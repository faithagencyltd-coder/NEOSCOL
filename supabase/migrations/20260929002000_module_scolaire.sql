-- =============================================================================
-- MODULE 1 — SCOLAIRE
--
-- Un seul module commercial (Module Scolaire, 15 000 F CFA / mois) et, à
-- l'intérieur, quatre niveaux configurables par établissement :
--   maternelle · primaire · college · lycee  (lycée : général et/ou technique)
--
-- Principes :
--   * aucune table supprimée, aucune donnée supprimée : colonnes ajoutées,
--     toutes facultatives, avec valeurs par défaut compatibles ;
--   * configuration stockée dans organizations.settings (mécanisme existant),
--     clé « school » : { "levels": [...], "lycee_tracks": [...] } ;
--   * désactiver un niveau MASQUE ses éléments, ne supprime rien ;
--   * centres de formation et universités : non concernés, inchangés.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Formule unique « Module Scolaire »
-- -----------------------------------------------------------------------------
-- Collège & Lycée (15 000 / 126 000) devient le Module Scolaire : mêmes prix,
-- aucun changement pour ses abonnés. Maternelle & Primaire est désactivée
-- (les abonnements déjà payés conservent leur formule et leur prix).
update public.subscription_plans
   set code = 'MODULE_SCOLAIRE',
       name = 'Module Scolaire',
       description = 'Un seul module pour tout le parcours scolaire : vous activez la maternelle, le primaire, le collège et/ou le lycée (général, technique) de votre établissement.',
       audience = 'Maternelle, primaire, collège, lycée général et technique',
       org_types = '{primary_school,middle_school,high_school,private_school,school_complex}',
       sort_order = 1
 where code = 'COLLEGE_LYCEE';

update public.subscription_plans
   set is_active = false, org_types = '{}', sort_order = 90
 where code = 'MATERNELLE_PRIMAIRE';

update public.subscription_plans set org_types = '{school_group}' where code = 'ENTERPRISE';

create or replace function app.default_plan_code(p_type public.organization_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'vocational_center' then 'CENTRE_FORMATION'
    when 'technical_center' then 'CENTRE_FORMATION'
    when 'university' then 'UNIVERSITE'
    when 'institute' then 'UNIVERSITE'
    when 'school_group' then 'ENTERPRISE'
    else 'MODULE_SCOLAIRE'
  end;
$$;

-- Essais encore gratuits sur l'ancienne formule Maternelle & Primaire : passés au
-- Module Scolaire (aucun paiement n'a été fait ; changement tracé).
with moved as (
  update public.subscriptions s
     set plan_id = p.id, monthly_price = p.monthly_price, annual_price = p.annual_price
    from public.subscription_plans p, public.subscription_plans old
   where p.code = 'MODULE_SCOLAIRE' and old.code = 'MATERNELLE_PRIMAIRE'
     and s.plan_id = old.id and s.status = 'TRIALING'
  returning s.id, s.organization_id
)
insert into public.subscription_events (organization_id, subscription_id, event_type, metadata)
select organization_id, id, 'plan_changed',
       jsonb_build_object('from_plan', 'MATERNELLE_PRIMAIRE', 'to_plan', 'MODULE_SCOLAIRE', 'during_trial', true, 'reason', 'formule unique Module Scolaire')
from moved;

-- Établissements de démonstration scolaires : abonnement de démonstration au Module Scolaire.
update public.subscriptions s
   set plan_id = p.id, monthly_price = p.monthly_price, annual_price = p.annual_price
  from public.subscription_plans p, public.organizations o
 where p.code = 'MODULE_SCOLAIRE' and o.id = s.organization_id and s.is_demo
   and o.type in ('primary_school', 'middle_school', 'high_school', 'private_school', 'school_complex');

-- Renouvellement d'une formule désactivée : autorisé pour l'établissement qui l'a déjà (prix conservé).
create or replace function app.billing_create_invoice(p_org uuid, p_plan_code text, p_interval text, p_kind text)
returns public.subscription_invoices
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_list integer;
  v_amount integer;
  v_inv public.subscription_invoices;
begin
  if p_interval not in ('MONTHLY', 'YEARLY') then
    raise exception 'Périodicité invalide.' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if v_sub.id is null then
    raise exception 'Abonnement introuvable.' using errcode = 'no_data_found';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and (is_active or id = v_sub.plan_id);
  if v_plan.id is null then
    raise exception 'Formule inconnue ou indisponible.' using errcode = 'check_violation';
  end if;
  if v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then
    v_list := case p_interval when 'YEARLY' then v_sub.monthly_price * 12 else v_sub.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_sub.annual_price else v_sub.monthly_price end;
  else
    v_list := case p_interval when 'YEARLY' then v_plan.annual_list_price else v_plan.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_plan.annual_price else v_plan.monthly_price end;
  end if;
  insert into public.subscription_invoices (
    organization_id, subscription_id, invoice_number, plan_id, plan_code, plan_name, billing_interval,
    unit_monthly_price, unit_annual_price, list_amount, discount_amount, amount, currency, kind, status,
    due_at, created_by
  ) values (
    p_org, v_sub.id,
    'NSC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscription_invoice_number_seq')::text, 6, '0'),
    v_plan.id, v_plan.code, v_plan.name, p_interval,
    case when v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then v_sub.monthly_price else v_plan.monthly_price end,
    case when v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then v_sub.annual_price else v_plan.annual_price end,
    v_list, v_list - v_amount, v_amount, v_plan.currency, p_kind, 'PENDING',
    greatest(now(), coalesce(app.subscription_end_at(v_sub), now())), auth.uid()
  ) returning * into v_inv;
  update public.subscription_invoices set pdf_url = '/api/abonnement/factures/' || v_inv.id where id = v_inv.id;
  perform app.billing_event(p_org, v_sub.id, 'invoice_created',
    jsonb_build_object('invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_amount, 'plan', v_plan.code, 'interval', p_interval, 'kind', p_kind));
  return v_inv;
end;
$$;

-- Une formule désactivée reste lisible par l'établissement qui y est abonné.
create policy plans_read_subscribed on public.subscription_plans for select to authenticated
  using (exists (
    select 1 from public.subscriptions s
    where s.plan_id = subscription_plans.id and s.organization_id = any ((select app.member_org_ids())::uuid[])
  ));

-- -----------------------------------------------------------------------------
-- 2. Niveaux du Module Scolaire
-- -----------------------------------------------------------------------------
create or replace function app.is_school_org_type(p_type public.organization_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type not in ('university', 'institute', 'vocational_center', 'technical_center');
$$;

-- Niveaux proposés par défaut selon le type d'établissement.
create or replace function app.default_school_levels(p_type public.organization_type)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'primary_school' then array['maternelle', 'primaire']
    when 'middle_school' then array['college']
    when 'high_school' then array['lycee']
    else array['maternelle', 'primaire', 'college', 'lycee']
  end;
$$;

-- Cycle scolaire déduit d'un libellé libre (« Collège », « Lycée technique »…).
create or replace function app.school_cycle_from_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_label is null then null
    when app.search_normalize(p_label) like '%maternel%' or app.search_normalize(p_label) like '%prescolaire%' then 'maternelle'
    when app.search_normalize(p_label) like '%primaire%' then 'primaire'
    when app.search_normalize(p_label) like '%college%' then 'college'
    when app.search_normalize(p_label) like '%lycee%' then 'lycee'
    else null
  end;
$$;

alter table public.levels
  add column school_cycle text check (school_cycle in ('maternelle', 'primaire', 'college', 'lycee'));
comment on column public.levels.school_cycle is 'Niveau du Module Scolaire (maternelle, primaire, college, lycee). NULL : hors Module Scolaire (université, formation) ou non classé.';

alter table public.programs
  add column school_cycle text check (school_cycle in ('maternelle', 'primaire', 'college', 'lycee')),
  add column track_type text check (track_type in ('general', 'technical'));
comment on column public.programs.track_type is 'Séries et filières du lycée : enseignement général ou technique. NULL pour les formations et diplômes.';

alter table public.subjects
  add column school_cycles text[] not null default '{}'
    check (school_cycles <@ array['maternelle', 'primaire', 'college', 'lycee']);
comment on column public.subjects.school_cycles is 'Niveaux où la matière s''applique ; vide = tous les niveaux (comportement antérieur).';

-- Reprise de l'existant : niveaux classés d'après leur libellé de cycle.
update public.levels l
   set school_cycle = app.school_cycle_from_label(coalesce(l.cycle, l.name))
  from public.organizations o
 where o.id = l.organization_id and app.is_school_org_type(o.type) and l.school_cycle is null;

-- Configuration par établissement (réglages existants), établissements scolaires uniquement.
-- Valeur par défaut compatible : niveaux du type d'établissement + niveaux déjà créés.
update public.organizations o
   set settings = o.settings || jsonb_build_object('school', jsonb_build_object(
         'levels', to_jsonb(d.levels),
         'lycee_tracks', case when 'lycee' = any (d.levels) then '["general"]'::jsonb else '[]'::jsonb end))
  from (
    select o2.id, array(
      select x from (select distinct x from unnest(app.default_school_levels(o2.type) || coalesce(
        (select array_agg(distinct l.school_cycle) from public.levels l where l.organization_id = o2.id and l.school_cycle is not null), '{}')) x) t
      order by array_position(array['maternelle', 'primaire', 'college', 'lycee'], x)) as levels
    from public.organizations o2
  ) d
 where d.id = o.id and app.is_school_org_type(o.type) and not (o.settings ? 'school');

-- Nouveaux établissements scolaires : niveaux par défaut de leur type.
create or replace function app.organization_school_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_school_org_type(new.type) and not (coalesce(new.settings, '{}'::jsonb) ? 'school') then
    new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('school', jsonb_build_object(
      'levels', to_jsonb(app.default_school_levels(new.type)),
      'lycee_tracks', case when 'lycee' = any (app.default_school_levels(new.type)) then '["general"]'::jsonb else '[]'::jsonb end));
  end if;
  return new;
end;
$$;
create trigger organizations_school_defaults
  before insert on public.organizations
  for each row execute function app.organization_school_defaults();

-- Niveaux activés d'un établissement (NULL : établissement hors Module Scolaire).
create or replace function app.org_school_levels(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.settings ? 'school'
    then array(select jsonb_array_elements_text(o.settings -> 'school' -> 'levels'))
  end
  from public.organizations o where o.id = p_org;
$$;

create or replace function app.org_lycee_tracks(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(o.settings -> 'school' -> 'lycee_tracks')), '{}')
  from public.organizations o where o.id = p_org;
$$;

-- Enregistrement des niveaux (settings.manage) : au moins un niveau ; lycée : au moins un type.
create or replace function public.set_school_config(p_org uuid, p_levels text[], p_tracks text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_levels text[];
  v_tracks text[];
  v_before jsonb;
  v_after jsonb;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_org from public.organizations where id = p_org;
  if not app.is_school_org_type(v_org.type) then
    raise exception 'Le Module Scolaire ne s''applique pas à ce type d''établissement.' using errcode = 'check_violation';
  end if;
  v_levels := array(select x from (select distinct x from unnest(coalesce(p_levels, '{}')) x) t order by array_position(array['maternelle', 'primaire', 'college', 'lycee'], x));
  if cardinality(v_levels) = 0 then
    raise exception 'Sélectionnez au moins un niveau.' using errcode = 'check_violation';
  end if;
  if not v_levels <@ array['maternelle', 'primaire', 'college', 'lycee'] then
    raise exception 'Niveau inconnu.' using errcode = 'check_violation';
  end if;
  v_tracks := case when 'lycee' = any (v_levels)
    then array(select distinct x from unnest(coalesce(p_tracks, '{}')) x order by 1) else '{}' end;
  if 'lycee' = any (v_levels) and cardinality(v_tracks) = 0 then
    raise exception 'Lycée : choisissez l''enseignement général, technique ou les deux.' using errcode = 'check_violation';
  end if;
  if not v_tracks <@ array['general', 'technical'] then
    raise exception 'Type d''enseignement inconnu.' using errcode = 'check_violation';
  end if;
  v_before := v_org.settings -> 'school';
  v_after := jsonb_build_object('levels', to_jsonb(v_levels), 'lycee_tracks', to_jsonb(v_tracks));
  update public.organizations set settings = settings || jsonb_build_object('school', v_after) where id = p_org;
  perform app.audit(p_org, 'settings.school_levels', 'organizations', p_org, 'Niveaux du Module Scolaire mis à jour',
                    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;
revoke execute on function public.set_school_config(uuid, text[], text[]) from public, anon;
grant execute on function public.set_school_config(uuid, text[], text[]) to authenticated;

-- Garde-fous : on ne crée pas de niveau, de série ni de classe dans un niveau non activé.
-- (Les données existantes d'un niveau désactivé restent intactes et consultables.)
create or replace function app.school_level_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_levels text[] := app.org_school_levels(new.organization_id);
  v_cycle text;
  -- Champs lus en JSON : la même fonction sert à levels, programs et classes.
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if v_levels is null then
    return new; -- établissement hors Module Scolaire
  end if;
  -- Niveau saisi avec un simple libellé de cycle (import, anciens écrans) : classement automatique.
  if tg_table_name = 'levels' then
    if v_new ->> 'school_cycle' is null then
      new.school_cycle := app.school_cycle_from_label(coalesce(v_new ->> 'cycle', v_new ->> 'name'));
      v_new := to_jsonb(new);
    end if;
  end if;
  if tg_table_name = 'classes' then
    if tg_op = 'UPDATE' and v_new -> 'level_id' is not distinct from v_old -> 'level_id' then return new; end if;
    select school_cycle into v_cycle from public.levels where id = (v_new ->> 'level_id')::uuid;
  else
    if tg_op = 'UPDATE' and v_new -> 'school_cycle' is not distinct from v_old -> 'school_cycle'
       and v_new -> 'track_type' is not distinct from v_old -> 'track_type' then
      return new;
    end if;
    v_cycle := v_new ->> 'school_cycle';
  end if;
  if v_cycle is not null and not (v_cycle = any (v_levels)) then
    raise exception 'Le niveau « % » n''est pas activé pour cet établissement (Paramètres › Établissement › Module scolaire).',
      case v_cycle when 'maternelle' then 'Maternelle' when 'primaire' then 'Primaire' when 'college' then 'Collège' else 'Lycée' end
      using errcode = 'check_violation';
  end if;
  if v_new ->> 'track_type' is not null and not ((v_new ->> 'track_type') = any (app.org_lycee_tracks(new.organization_id))) then
    raise exception 'Le lycée % n''est pas activé pour cet établissement.', case v_new ->> 'track_type' when 'technical' then 'technique' else 'général' end
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger levels_school_guard before insert or update on public.levels
  for each row execute function app.school_level_guard();
create trigger programs_school_guard before insert or update on public.programs
  for each row execute function app.school_level_guard();
create trigger classes_school_guard before insert or update on public.classes
  for each row execute function app.school_level_guard();

-- Toute écriture de settings.school (quel que soit le chemin) reste valide.
create or replace function app.organization_school_settings_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_levels text[];
  v_tracks text[];
begin
  if not (new.settings ? 'school') or new.settings -> 'school' is not distinct from old.settings -> 'school' then
    return new;
  end if;
  if jsonb_typeof(new.settings -> 'school' -> 'levels') <> 'array' or jsonb_typeof(coalesce(new.settings -> 'school' -> 'lycee_tracks', '[]')) <> 'array' then
    raise exception 'Configuration du Module Scolaire invalide.' using errcode = 'check_violation';
  end if;
  v_levels := array(select jsonb_array_elements_text(new.settings -> 'school' -> 'levels'));
  v_tracks := array(select jsonb_array_elements_text(coalesce(new.settings -> 'school' -> 'lycee_tracks', '[]')));
  if cardinality(v_levels) = 0 or not v_levels <@ array['maternelle', 'primaire', 'college', 'lycee']
     or not v_tracks <@ array['general', 'technical'] then
    raise exception 'Configuration du Module Scolaire invalide : au moins un niveau parmi maternelle, primaire, collège, lycée.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger organizations_school_settings_check
  before update of settings on public.organizations
  for each row execute function app.organization_school_settings_check();
