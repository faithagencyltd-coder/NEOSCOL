-- =============================================================================
-- Formules : gestion complète par le Super Admin.
--   - Créer, modifier (nom, textes FR/EN, avantages affichés, types
--     d'établissement concernés, ordre), dupliquer, retirer / réactiver une
--     formule ; suppression définitive seulement si elle n'a jamais servi.
--   - Options réellement appliquées : portail parents, portail élève,
--     messagerie, assistant IA, messages vocaux de la tablette, SMS. Un
--     établissement n'y accède que si sa formule les inclut.
--   - Garde en base : une formule n'est souscrite que par les types
--     d'établissement auxquels elle est proposée.
-- Rien n'est supprimé : les abonnements et factures gardent leur formule et
-- leur prix.
-- =============================================================================

alter table public.subscription_plans
  add column name_en text check (name_en is null or char_length(name_en) between 2 and 80),
  add column description_en text check (description_en is null or char_length(description_en) <= 1000),
  add column highlights jsonb not null default '[]'::jsonb,
  add column highlights_en jsonb not null default '[]'::jsonb,
  add constraint subscription_plans_highlights_check check (
    jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 8
    and jsonb_typeof(highlights_en) = 'array' and jsonb_array_length(highlights_en) <= 8);

-- Options appliquées : présentes (et incluses) dans toutes les formules existantes.
insert into public.subscription_features (plan_id, feature_code, enabled)
select p.id, f.code, true
  from public.subscription_plans p
 cross join (values ('student_portal'), ('voice_checkin'), ('sms')) as f(code)
on conflict (plan_id, feature_code) do nothing;

-- Catalogue des options d'une formule (les mêmes pour toutes).
create or replace function app.plan_feature_codes()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['students', 'teachers', 'parents', 'student_portal', 'finance', 'attendance', 'grades', 'bulletins', 'documents', 'qr',
               'reports', 'assistant', 'communication', 'sms', 'voice_checkin', 'pwa', 'multi_establishment'];
$$;

create or replace function app.clean_highlights(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(left(btrim(v), 120))), '[]'::jsonb)
    from (select value #>> '{}' as v from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) limit 8) t
   where btrim(coalesce(v, '')) <> '';
$$;

-- Création (p_plan null) ou modification d'une formule. Le prix d'une formule
-- existante se change avec platform_update_plan_prices (historique).
create or replace function public.platform_save_plan(
  p_plan uuid,
  p_code text,
  p_name text,
  p_name_en text,
  p_description text,
  p_description_en text,
  p_audience text,
  p_highlights jsonb,
  p_highlights_en jsonb,
  p_org_types public.organization_type[],
  p_sort_order integer,
  p_is_active boolean,
  p_features jsonb,
  p_monthly_price integer default null,
  p_annual_discount_percent numeric default 30,
  p_trial_days integer default 20,
  p_currency text default 'XOF')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.subscription_plans;
  v_id uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_annual integer;
  v_key text;
begin
  perform app.require_platform_admin();
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Nom de la formule : 2 à 80 caractères.' using errcode = 'check_violation';
  end if;
  if coalesce(p_is_active, false) and cardinality(coalesce(p_org_types, '{}')) = 0 then
    raise exception 'Choisissez au moins un type d''établissement pour proposer cette formule.' using errcode = 'check_violation';
  end if;
  -- Le Module 4 reste la formule unique des établissements principaux (groupes) : ses espaces en dépendent.
  if ('school_group' = any (coalesce(p_org_types, '{}'))) <> (coalesce((select code from public.subscription_plans where id = p_plan), v_code) = 'MULTI_MODULES') then
    raise exception 'Les établissements principaux (plusieurs activités) utilisent uniquement le Module 4.' using errcode = 'check_violation';
  end if;
  if p_features is not null and exists (select 1 from jsonb_object_keys(p_features) k where k <> all (app.plan_feature_codes())) then
    raise exception 'Option inconnue.' using errcode = 'check_violation';
  end if;

  if p_plan is null then
    if v_code !~ '^[A-Z][A-Z_]{2,39}$' then
      raise exception 'Code de la formule : lettres majuscules et _ (3 à 40), par exemple SCOLAIRE_PREMIUM.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.subscription_plans where code = v_code) then
      raise exception 'Ce code de formule existe déjà.' using errcode = 'unique_violation';
    end if;
    if p_monthly_price is null or p_monthly_price < 100 then
      raise exception 'Prix mensuel invalide (100 minimum).' using errcode = 'check_violation';
    end if;
    if p_annual_discount_percent is null or p_annual_discount_percent < 0 or p_annual_discount_percent > 60 then
      raise exception 'Remise annuelle invalide (0 à 60 %%).' using errcode = 'check_violation';
    end if;
    if p_trial_days is null or p_trial_days not between 0 and 90 then
      raise exception 'Essai gratuit : 0 à 90 jours.' using errcode = 'check_violation';
    end if;
    v_annual := greatest(100, (round(p_monthly_price * 12 * (1 - p_annual_discount_percent / 100) / 100) * 100)::integer);
    insert into public.subscription_plans (code, name, name_en, description, description_en, audience, highlights, highlights_en,
                                           monthly_price, annual_price, annual_discount_percent, currency, trial_days, org_types, sort_order, is_active)
    values (v_code, btrim(p_name), nullif(btrim(p_name_en), ''), left(nullif(btrim(p_description), ''), 1000), left(nullif(btrim(p_description_en), ''), 1000),
            left(nullif(btrim(p_audience), ''), 200), app.clean_highlights(p_highlights), app.clean_highlights(p_highlights_en),
            p_monthly_price, v_annual, p_annual_discount_percent, coalesce(nullif(upper(btrim(p_currency)), ''), 'XOF'), p_trial_days,
            coalesce(p_org_types, '{}'), coalesce(p_sort_order, 50), coalesce(p_is_active, false))
    returning id into v_id;
    insert into public.subscription_features (plan_id, feature_code, enabled)
    select v_id, c, coalesce((p_features ->> c)::boolean, true) from unnest(app.plan_feature_codes()) c;
    perform app.audit(null, 'platform.plan_created', 'subscription_plans', v_id, 'Formule créée : ' || btrim(p_name),
      jsonb_build_object('code', v_code, 'monthly_price', p_monthly_price, 'org_types', p_org_types));
    return v_id;
  end if;

  select * into v_before from public.subscription_plans where id = p_plan for update;
  if v_before.id is null then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  update public.subscription_plans
     set name = btrim(p_name), name_en = nullif(btrim(p_name_en), ''),
         description = left(nullif(btrim(p_description), ''), 1000), description_en = left(nullif(btrim(p_description_en), ''), 1000),
         audience = left(nullif(btrim(p_audience), ''), 200),
         highlights = app.clean_highlights(p_highlights), highlights_en = app.clean_highlights(p_highlights_en),
         org_types = coalesce(p_org_types, '{}'), sort_order = coalesce(p_sort_order, sort_order), is_active = coalesce(p_is_active, is_active),
         updated_at = now()
   where id = p_plan;
  if p_features is not null then
    for v_key in select jsonb_object_keys(p_features) loop
      insert into public.subscription_features (plan_id, feature_code, enabled)
      values (p_plan, v_key, (p_features ->> v_key)::boolean)
      on conflict (plan_id, feature_code) do update set enabled = excluded.enabled;
    end loop;
  end if;
  perform app.audit(null, 'platform.plan_updated', 'subscription_plans', p_plan, 'Formule modifiée : ' || btrim(p_name),
    jsonb_build_object('before', jsonb_build_object('name', v_before.name, 'is_active', v_before.is_active, 'org_types', v_before.org_types),
                       'after', jsonb_build_object('name', btrim(p_name), 'is_active', coalesce(p_is_active, v_before.is_active), 'org_types', p_org_types),
                       'features', p_features));
  return p_plan;
end;
$$;

-- Retirer (plus proposée, abonnés actuels inchangés) ou réactiver.
create or replace function public.platform_set_plan_active(p_plan uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
begin
  perform app.require_platform_admin();
  select * into v_plan from public.subscription_plans where id = p_plan for update;
  if v_plan.id is null then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  if p_active and cardinality(v_plan.org_types) = 0 then
    raise exception 'Choisissez au moins un type d''établissement avant de réactiver cette formule.' using errcode = 'check_violation';
  end if;
  update public.subscription_plans set is_active = p_active, updated_at = now() where id = p_plan;
  perform app.audit(null, case when p_active then 'platform.plan_reactivated' else 'platform.plan_retired' end, 'subscription_plans', p_plan,
    case when p_active then 'Formule réactivée : ' else 'Formule retirée des offres : ' end || v_plan.name,
    jsonb_build_object('subscriptions', (select count(*) from public.subscriptions where plan_id = p_plan)));
end;
$$;

-- Dupliquer : copie retirée (à relire avant de la proposer).
create or replace function public.platform_duplicate_plan(p_plan uuid, p_code text, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_src public.subscription_plans;
  v_id uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform app.require_platform_admin();
  select * into v_src from public.subscription_plans where id = p_plan;
  if v_src.id is null then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  if v_code !~ '^[A-Z][A-Z_]{2,39}$' then
    raise exception 'Code de la formule : lettres majuscules et _ (3 à 40), par exemple SCOLAIRE_PREMIUM.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.subscription_plans where code = v_code) then
    raise exception 'Ce code de formule existe déjà.' using errcode = 'unique_violation';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Nom de la formule : 2 à 80 caractères.' using errcode = 'check_violation';
  end if;
  insert into public.subscription_plans (code, name, name_en, description, description_en, audience, highlights, highlights_en,
                                         monthly_price, annual_price, annual_discount_percent, currency, trial_days, org_types, sort_order, is_active)
  values (v_code, btrim(p_name), v_src.name_en, v_src.description, v_src.description_en, v_src.audience, v_src.highlights, v_src.highlights_en,
          v_src.monthly_price, v_src.annual_price, v_src.annual_discount_percent, v_src.currency, v_src.trial_days, v_src.org_types, v_src.sort_order + 1, false)
  returning id into v_id;
  insert into public.subscription_features (plan_id, feature_code, enabled, limit_value)
  select v_id, feature_code, enabled, limit_value from public.subscription_features where plan_id = p_plan;
  perform app.audit(null, 'platform.plan_created', 'subscription_plans', v_id, 'Formule dupliquée : ' || btrim(p_name) || ' (depuis ' || v_src.name || ')',
    jsonb_build_object('code', v_code, 'source', v_src.code));
  return v_id;
end;
$$;

-- Suppression définitive : seulement une formule qui n'a jamais servi.
create or replace function public.platform_delete_plan(p_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
begin
  perform app.require_platform_admin();
  select * into v_plan from public.subscription_plans where id = p_plan for update;
  if v_plan.id is null then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.subscriptions where plan_id = p_plan)
     or exists (select 1 from public.subscription_invoices where plan_id = p_plan)
     or exists (select 1 from public.negotiated_prices where plan_code = v_plan.code)
     or exists (select 1 from public.promo_codes where v_plan.code = any (coalesce(plan_codes, '{}'))) then
    raise exception 'Cette formule a déjà servi (abonnement, facture, tarif négocié ou code promo) : retirez-la des offres au lieu de la supprimer.'
      using errcode = 'foreign_key_violation';
  end if;
  perform app.audit(null, 'platform.plan_deleted', 'subscription_plans', p_plan, 'Formule supprimée : ' || v_plan.name,
    jsonb_build_object('code', v_plan.code, 'monthly_price', v_plan.monthly_price));
  delete from public.subscription_plans where id = p_plan;
end;
$$;

-- Formule d'essai d'un nouvel établissement : la première formule proposée à son
-- type (ordre de la console) ; à défaut, la formule historique du module.
create or replace function app.default_plan_code(p_type public.organization_type)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select code from public.subscription_plans where is_active and p_type = any (org_types) order by sort_order, created_at limit 1),
    case p_type
      when 'vocational_center' then 'CENTRE_FORMATION'
      when 'technical_center' then 'CENTRE_FORMATION'
      when 'university' then 'UNIVERSITE'
      when 'institute' then 'UNIVERSITE'
      when 'school_group' then 'MULTI_MODULES'
      else 'MODULE_SCOLAIRE'
    end);
$$;

-- Garde : une souscription ou un changement de formule vise une formule
-- proposée au type de l'établissement (la formule actuelle reste renouvelable).
create or replace function app.subscription_invoice_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('subscription', 'plan_change')
     and not exists (select 1 from public.subscriptions s where s.id = new.subscription_id and s.plan_id = new.plan_id)
     and not exists (select 1 from public.subscription_plans p join public.organizations o on o.id = new.organization_id
                      where p.id = new.plan_id and o.type = any (p.org_types)) then
    raise exception 'Cette formule n''est pas proposée à ce type d''établissement.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger subscription_invoices_plan_offer_guard before insert on public.subscription_invoices
  for each row execute function app.subscription_invoice_plan_guard();

-- Options de la formule de l'établissement (lues avec l'établissement dans la session).
-- null = pas d'abonnement (espace du Module 4, établissement de démonstration sans formule) : aucune restriction.
create or replace function public.plan_features(o public.organizations)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(f.feature_code, f.enabled)
    from public.subscriptions s
    join public.subscription_features f on f.plan_id = s.plan_id
   where s.organization_id = o.id
     and (o.id = any (app.member_org_ids()) or app.is_platform_admin());
$$;

-- Vérification serveur d'une option appliquée.
create or replace function app.org_plan_allows(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select f.enabled from public.subscriptions s join public.subscription_features f on f.plan_id = s.plan_id and f.feature_code = p_feature
                    where s.organization_id = p_org), true);
$$;

revoke execute on function public.platform_save_plan(uuid, text, text, text, text, text, text, jsonb, jsonb, public.organization_type[], integer, boolean, jsonb, integer, numeric, integer, text) from public, anon;
revoke execute on function public.platform_set_plan_active(uuid, boolean) from public, anon;
revoke execute on function public.platform_duplicate_plan(uuid, text, text) from public, anon;
revoke execute on function public.platform_delete_plan(uuid) from public, anon;
revoke execute on function public.plan_features(public.organizations) from public, anon;
revoke execute on function app.org_plan_allows(uuid, text) from public, anon;
grant execute on function public.platform_save_plan(uuid, text, text, text, text, text, text, jsonb, jsonb, public.organization_type[], integer, boolean, jsonb, integer, numeric, integer, text) to authenticated;
grant execute on function public.platform_set_plan_active(uuid, boolean) to authenticated;
grant execute on function public.platform_duplicate_plan(uuid, text, text) to authenticated;
grant execute on function public.platform_delete_plan(uuid) to authenticated;
grant execute on function public.plan_features(public.organizations) to authenticated;
grant execute on function app.org_plan_allows(uuid, text) to authenticated;

-- Textes plus courts pour les formules officielles (seulement s'ils n'ont pas été modifiés).
update public.subscription_plans set
  description = 'Tout le parcours scolaire dans un seul abonnement : maternelle, primaire, collège, lycée général et technique.',
  description_en = 'The whole school journey in one subscription: nursery, primary, lower and upper secondary.',
  name_en = 'School module',
  highlights = '["Élèves, classes, emplois du temps", "Appel, notes et bulletins", "Paiements, reçus et relances", "Portails parents et élèves", "Tablette de pointage"]',
  highlights_en = '["Students, classes, timetables", "Attendance, grades and report cards", "Payments, receipts and reminders", "Parent and student portals", "Check-in tablet"]'
where code = 'MODULE_SCOLAIRE' and description like 'Un seul module pour tout le parcours scolaire%';
update public.subscription_plans set
  description = 'Pour les centres de formation : formations, sessions, apprenants, compétences et certificats.',
  description_en = 'For training centres: programmes, sessions, learners, skills and certificates.',
  name_en = 'Vocational training',
  highlights = '["Formations et sessions", "Entrées et sorties par badge", "Paiements échelonnés", "Compétences, stages, certificats"]',
  highlights_en = '["Programmes and sessions", "Badge check-in and check-out", "Instalment payments", "Skills, internships, certificates"]'
where code = 'CENTRE_FORMATION' and description like 'Centres de formation professionnelle :%';
update public.subscription_plans set
  description = 'Pour les universités et instituts : filières, UE et crédits, délibérations, mémoires et diplômes.',
  description_en = 'For universities and institutes: programmes, course units and credits, juries, theses and diplomas.',
  name_en = 'University',
  highlights = '["Facultés, filières, parcours", "UE, crédits et résultats", "Délibérations et rattrapages", "Mémoires, soutenances, diplômes"]',
  highlights_en = '["Faculties, programmes, tracks", "Course units, credits, results", "Juries and resits", "Theses, defences, diplomas"]'
where code = 'UNIVERSITE' and description like 'Universités, instituts et écoles supérieures :%';
update public.subscription_plans set
  description = 'Un seul abonnement pour un établissement qui réunit école, centre de formation et/ou université.',
  description_en = 'One subscription for an institution that combines a school, a training centre and/or a university.',
  name_en = 'Module 4 — Multi-module',
  highlights = '["Jusqu''à 3 espaces séparés", "Un seul compte de direction", "Statistiques consolidées"]',
  highlights_en = '["Up to 3 separate spaces", "One management account", "Consolidated statistics"]'
where code = 'MULTI_MODULES' and description like 'Regroupez plusieurs activités%';
