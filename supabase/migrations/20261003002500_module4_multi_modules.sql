-- =============================================================================
-- MODULE 4 — ABONNEMENT MULTI-MODULES (30 000 F CFA / mois, 252 000 F CFA / an)
--
-- Un seul abonnement pour un établissement principal (type school_group) qui
-- regroupe 1, 2 ou 3 ESPACES : Scolaire, Formation professionnelle, Université.
-- Chaque espace est un établissement rattaché (parent_id) qui réutilise
-- intégralement le module correspondant (aucun nouveau moteur). Le prix est
-- celui du Module 4, jamais la somme des modules.
--
-- Réutilise : organizations.parent_id, provisionnement automatique (rôles…),
-- app.org_billing_access (accès du groupe), fonctionnalité multi_establishment.
-- Contrôles en base : composantes souscrites, accès des espaces, formule
-- réservée aux groupes (et un groupe n'a que cette formule).
-- =============================================================================

-- La formule « Enterprise » devient le Module 4 (mêmes abonnements, nouveau tarif
-- pour les nouvelles souscriptions ; les prix déjà copiés sur les abonnements et
-- factures existants ne changent pas).
update public.subscription_plans
   set code = 'MULTI_MODULES',
       name = 'Module 4 — Multi-modules',
       description = 'Regroupez plusieurs activités de votre établissement dans un seul abonnement NéoScol : école scolaire, centre de formation professionnelle et/ou université.',
       audience = 'Établissements qui réunissent plusieurs activités (école, centre de formation, université)',
       monthly_price = 30000,
       annual_price = 252000,
       annual_discount_percent = 30,
       org_types = '{school_group}'
 where code = 'ENTERPRISE';

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
    when 'school_group' then 'MULTI_MODULES'
    else 'MODULE_SCOLAIRE'
  end;
$$;

-- Composante (domaine) d'un type d'établissement.
create or replace function app.org_component(p_type public.organization_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('vocational_center', 'technical_center') then 'training'
    when p_type in ('university', 'institute') then 'university'
    when p_type = 'school_group' then null
    else 'school'
  end;
$$;

-- Composantes souscrites (Module 4) : 1 à 3 parmi school, training, university.
alter table public.subscriptions
  add column components text[] not null default '{}'
    check (components <@ array['school', 'training', 'university']::text[]);
comment on column public.subscriptions.components is
  'Module 4 : domaines activés (school, training, university). Détermine les espaces accessibles, jamais le prix.';
-- Abonnements existants de l'ancienne formule multi-établissements : les trois domaines (aucun accès retiré).
update public.subscriptions s set components = array['school', 'training', 'university']
  from public.subscription_plans p where p.id = s.plan_id and p.code = 'MULTI_MODULES' and cardinality(s.components) = 0;

alter table public.subscription_events drop constraint subscription_events_event_type_check;
alter table public.subscription_events add constraint subscription_events_event_type_check check (event_type in (
  'trial_started', 'plan_selected', 'checkout_created', 'payment_pending', 'payment_success', 'payment_failed',
  'payment_cancelled', 'invoice_created', 'invoice_paid', 'invoice_cancelled', 'subscription_activated',
  'subscription_renewed', 'subscription_cancelled', 'subscription_resumed', 'subscription_past_due',
  'subscription_grace_period', 'subscription_restricted', 'subscription_expired', 'subscription_reactivated',
  'plan_changed', 'manual_payment', 'notification_sent', 'components_changed', 'space_created'
));

-- Formule et type d'établissement cohérents : Module 4 ⇔ établissement principal (groupe).
create or replace function app.plan_matches_org(p_org uuid, p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (o.type = 'school_group') = (p.code = 'MULTI_MODULES')
  from public.organizations o, public.subscription_plans p
  where o.id = p_org and p.id = p_plan;
$$;

create or replace function app.subscription_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) and not coalesce(app.plan_matches_org(new.organization_id, new.plan_id), true) then
    raise exception 'Le Module 4 (multi-modules) est réservé aux établissements principaux qui regroupent plusieurs activités ; un tel établissement n''utilise que cette formule.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger subscriptions_plan_guard before insert or update of plan_id on public.subscriptions
  for each row execute function app.subscription_plan_guard();
create trigger subscription_invoices_plan_guard before insert on public.subscription_invoices
  for each row execute function app.subscription_plan_guard();

-- Un espace rattaché à un groupe Module 4 n'a pas d'abonnement propre : il est couvert par le groupe.
create or replace function app.subscription_bootstrap(p_org uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_plan public.subscription_plans;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_org;
  if v_org.parent_id is not null and exists (
    select 1 from public.subscriptions s
    join public.subscription_features f on f.plan_id = s.plan_id and f.feature_code = 'multi_establishment' and f.enabled
    where s.organization_id = v_org.parent_id
  ) then
    return null;
  end if;
  select * into v_plan from public.subscription_plans where code = app.default_plan_code(v_org.type);
  if v_org.is_demo then
    insert into public.subscriptions (organization_id, plan_id, billing_interval, status, monthly_price, annual_price, currency,
                                      current_period_start, current_period_end, next_billing_date, is_demo, components)
    values (p_org, v_plan.id, 'YEARLY', 'ACTIVE', v_plan.monthly_price, v_plan.annual_price, v_plan.currency,
            now(), now() + interval '1 year', now() + interval '1 year', true,
            case when v_org.type = 'school_group' then array['school', 'training', 'university'] else '{}' end)
    on conflict (organization_id) do nothing
    returning id into v_id;
  else
    insert into public.subscriptions (organization_id, plan_id, billing_interval, status, monthly_price, annual_price, currency,
                                      trial_start, trial_end)
    values (p_org, v_plan.id, 'MONTHLY', 'TRIALING', v_plan.monthly_price, v_plan.annual_price, v_plan.currency,
            now(), now() + make_interval(days => v_plan.trial_days))
    on conflict (organization_id) do nothing
    returning id into v_id;
    if v_id is not null then
      perform app.billing_event(p_org, v_id, 'trial_started',
        jsonb_build_object('plan', v_plan.code, 'trial_days', v_plan.trial_days, 'trial_end', now() + make_interval(days => v_plan.trial_days)));
    end if;
  end if;
  return v_id;
end;
$$;

-- Accès : un espace couvert par le groupe n'a accès que si SA composante est souscrite.
-- Composante retirée : lecture seule (aucune donnée supprimée).
create or replace function app.org_billing_access(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select * from public.platform_billing_settings where id = 1),
  candidates as (
    select s.*, true as covered from public.subscriptions s where s.organization_id = p_org
    union all
    select s.*, (cardinality(s.components) = 0 or app.org_component(o.type) = any (s.components)) as covered
    from public.subscriptions s
    join public.organizations o on o.parent_id = s.organization_id and o.id = p_org
    join public.subscription_features f on f.plan_id = s.plan_id and f.feature_code = 'multi_establishment' and f.enabled
  )
  select case
    when not exists (select 1 from candidates) then 'full'
    when exists (
      select 1 from candidates c, cfg
      where c.covered
        and c.status not in ('RESTRICTED', 'EXPIRED')
        and now() < (case when c.status = 'TRIALING' or c.current_period_end is null then c.trial_end else c.current_period_end end)
                    + case when c.cancel_at_period_end or c.status = 'CANCELLED' then interval '0'
                           else make_interval(days => cfg.restrict_after_days) end
    ) then 'full'
    else 'read_only'
  end;
$$;

-- Choix des composantes (1 à 3). Le prix ne change pas.
create or replace function public.set_subscription_components(p_org uuid, p_components text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_list text[];
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_list
  from unnest(coalesce(p_components, '{}')) c where c in ('school', 'training', 'university');
  if cardinality(v_list) = 0 then
    raise exception 'Veuillez sélectionner au moins un domaine.' using errcode = 'check_violation';
  end if;
  select s.* into v_sub from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
   where s.organization_id = p_org and p.code = 'MULTI_MODULES' for update of s;
  if v_sub.id is null then
    raise exception 'Réservé aux abonnements Module 4 (multi-modules).' using errcode = 'check_violation';
  end if;
  update public.subscriptions set components = v_list where id = v_sub.id;
  perform app.billing_event(p_org, v_sub.id, 'components_changed', jsonb_build_object('from', v_sub.components, 'to', v_list));
  perform app.audit(p_org, 'billing.components_changed', 'subscriptions', v_sub.id,
    'Domaines du Module 4 : ' || array_to_string(v_list, ', '), jsonb_build_object('from', v_sub.components, 'to', v_list), 'success');
  return v_list;
end;
$$;
revoke execute on function public.set_subscription_components(uuid, text[]) from public, anon;
grant execute on function public.set_subscription_components(uuid, text[]) to authenticated;

-- Garde des attributions de rôles (reprise) + exception Module 4.
create or replace function app.check_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_user uuid;
begin
  if auth.uid() is null then
    return new; -- contexte système (service role, seed, migrations)
  end if;

  select user_id into v_member_user from public.memberships where id = new.membership_id;
  -- Module 4 : l'administrateur de l'établissement principal administre ses espaces
  -- (rôle org_admin dans un établissement rattaché, et rien d'autre).
  if v_member_user = auth.uid()
     and exists (select 1 from public.roles r where r.id = new.role_id and r.key = 'org_admin')
     and exists (select 1 from public.organizations o
                 where o.id = new.organization_id and o.parent_id is not null
                   and app.has_permission(o.parent_id, 'roles.manage') and app.has_permission(o.parent_id, 'settings.manage')) then
    return new;
  end if;
  if v_member_user = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier vos propres rôles.' using errcode = 'insufficient_privilege';
  end if;

  -- La plateforme (Super administrateur) nomme le premier administrateur d'un établissement.
  if app.is_platform_admin() or app.has_permission(new.organization_id, 'roles.manage') then
    return new;
  end if;

  if app.has_permission(new.organization_id, 'portal_access.manage')
     and exists (select 1 from public.roles r where r.id = new.role_id and r.persona in ('parent', 'student')) then
    return new;
  end if;

  if exists (
    select 1 from public.role_permissions rp
    where rp.role_id = new.role_id
      and not app.has_permission(new.organization_id, rp.permission_code)
  ) then
    raise exception 'Ce rôle accorde des permissions que vous ne possédez pas.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Création d'un espace (établissement rattaché) pour une composante souscrite.
-- Les administrateurs de l'établissement principal en deviennent administrateurs.
create or replace function public.create_component_space(p_parent uuid, p_component text, p_name text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_parent public.organizations;
  v_sub public.subscriptions;
  v_type public.organization_type;
  v_label text;
  v_code text;
  v_base text;
  v_try integer := 0;
  v_org uuid;
  v_membership uuid;
  v_member record;
begin
  if not app.has_permission(p_parent, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_parent from public.organizations where id = p_parent;
  if v_parent.type <> 'school_group' then
    raise exception 'Seul un établissement principal (Module 4) peut créer des espaces.' using errcode = 'check_violation';
  end if;
  select s.* into v_sub from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
   where s.organization_id = p_parent and p.code = 'MULTI_MODULES';
  if v_sub.id is null or not (p_component = any (v_sub.components)) then
    raise exception 'Ce domaine n''est pas inclus dans votre abonnement Module 4.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.organizations o where o.parent_id = p_parent and o.status <> 'archived' and app.org_component(o.type) = p_component) then
    raise exception 'L''espace de ce domaine existe déjà.' using errcode = 'unique_violation';
  end if;
  v_type := case p_component when 'training' then 'vocational_center' when 'university' then 'university' else 'school_complex' end;
  v_label := case p_component when 'training' then 'Formation professionnelle' when 'university' then 'Université' else 'École' end;
  v_base := left(v_parent.code, 7) || case p_component when 'training' then 'FP' when 'university' then 'UN' else 'SC' end;
  loop
    v_code := case when v_try = 0 then v_base else left(v_base, 6) || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0') end;
    exit when not exists (select 1 from public.organizations where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Code d''espace indisponible.'; end if;
  end loop;

  insert into public.organizations (parent_id, name, code, slug, type, city, country, phone, email, currency, locale, timezone, is_demo)
  values (p_parent, coalesce(nullif(btrim(p_name), ''), v_parent.name || ' — ' || v_label), v_code,
          lower(v_code) || '-' || substr(md5(random()::text), 1, 6), v_type, v_parent.city, v_parent.country,
          v_parent.phone, v_parent.email, v_parent.currency, v_parent.locale, v_parent.timezone, v_parent.is_demo)
  returning id into v_org;

  -- Identité visuelle reprise de l'établissement principal (modifiable ensuite).
  update public.organization_branding b
     set logo_path = pb.logo_path, stamp_path = pb.stamp_path, signature_path = pb.signature_path,
         primary_color = pb.primary_color, secondary_color = pb.secondary_color, header_text = pb.header_text,
         footer_text = pb.footer_text, signatory_name = pb.signatory_name, signatory_title = pb.signatory_title
    from public.organization_branding pb
   where b.organization_id = v_org and pb.organization_id = p_parent;

  -- Administrateurs de l'établissement principal (dont l'auteur) → administrateurs de l'espace.
  for v_member in
    select distinct m.user_id from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.key = 'org_admin'
    where m.organization_id = p_parent and m.status = 'active'
    union
    select auth.uid()
  loop
    insert into public.memberships (organization_id, user_id, status, joined_at)
    values (v_org, v_member.user_id, 'active', now())
    on conflict do nothing
    returning id into v_membership;
    if v_membership is not null then
      insert into public.membership_roles (organization_id, membership_id, role_id)
      select v_org, v_membership, r.id from public.roles r where r.organization_id = v_org and r.key = 'org_admin';
    end if;
  end loop;

  perform app.billing_event(p_parent, v_sub.id, 'space_created', jsonb_build_object('component', p_component, 'organization_id', v_org, 'code', v_code));
  perform app.audit(p_parent, 'settings.space_created', 'organizations', v_org,
    'Espace « ' || v_label || ' » créé (' || v_code || ')', jsonb_build_object('component', p_component), 'success');
  return v_org;
end;
$$;
revoke execute on function public.create_component_space(uuid, text, text) from public, anon;
grant execute on function public.create_component_space(uuid, text, text) to authenticated;

-- Vue d'ensemble du Module 4 pour un membre du groupe OU d'un de ses espaces :
-- établissement principal, abonnement, domaines, espaces (seulement ceux dont
-- l'utilisateur est membre sont « ouvrables »).
create or replace function public.module4_overview(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_sub public.subscriptions;
  v_result jsonb;
begin
  if not (p_org = any (app.member_org_ids())) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  select case when o.type = 'school_group' then o.id else o.parent_id end into v_group from public.organizations o where o.id = p_org;
  if v_group is null then return null; end if;
  select s.* into v_sub from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
   where s.organization_id = v_group and p.code = 'MULTI_MODULES';
  if v_sub.id is null then return null; end if;
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'code', g.code, 'member', g.id = any (app.member_org_ids())),
    'status', v_sub.status,
    'interval', v_sub.billing_interval,
    'monthly_price', v_sub.monthly_price,
    'annual_price', v_sub.annual_price,
    'currency', v_sub.currency,
    'components', to_jsonb(v_sub.components),
    'trial_end', v_sub.trial_end,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'created_at', v_sub.created_at,
    'spaces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'code', o.code, 'type', o.type, 'component', app.org_component(o.type),
               'status', o.status, 'member', o.id = any (app.member_org_ids()),
               'access', app.org_billing_access(o.id)) order by o.name)
      from public.organizations o where o.parent_id = v_group and o.status <> 'archived'), '[]'::jsonb)
  ) into v_result
  from public.organizations g where g.id = v_group;
  return v_result;
end;
$$;
revoke execute on function public.module4_overview(uuid) from public, anon;
grant execute on function public.module4_overview(uuid) to authenticated;

-- État d'accès (bandeau) : un espace sans abonnement propre reflète celui de son
-- établissement principal (Module 4), en indiquant si son domaine est couvert.
create or replace function public.billing_access_state(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_end timestamptz;
  v_plan text;
  v_group text;
  v_covered boolean := true;
begin
  if not (app.is_member(p_org) or app.is_platform_admin()) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if v_sub.id is null then
    select s.* into v_sub
      from public.organizations o
      join public.subscriptions s on s.organization_id = o.parent_id
      join public.subscription_features f on f.plan_id = s.plan_id and f.feature_code = 'multi_establishment' and f.enabled
     where o.id = p_org;
    if v_sub.id is null then
      return jsonb_build_object('status', null, 'access', 'full');
    end if;
    select g.name, (cardinality(v_sub.components) = 0 or app.org_component(o.type) = any (v_sub.components))
      into v_group, v_covered
      from public.organizations o join public.organizations g on g.id = o.parent_id
     where o.id = p_org;
  end if;
  v_end := app.subscription_end_at(v_sub);
  select name into v_plan from public.subscription_plans where id = v_sub.plan_id;
  return jsonb_build_object(
    'status', v_sub.status,
    'access', app.org_billing_access(p_org),
    'plan', v_plan,
    'end_at', v_end,
    'days_left', greatest(0, ceil(extract(epoch from (v_end - now())) / 86400))::int,
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'is_demo', v_sub.is_demo,
    'covered_by', v_group,
    'covered', v_covered
  );
end;
$$;
