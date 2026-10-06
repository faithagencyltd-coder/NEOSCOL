-- =============================================================================
-- Super Admin — SA-1 : équipe et rôles, journal global, contrôle des modules.
--
--  1. Équipe : platform_admins reçoit un rôle.
--       owner  (Propriétaire)   : tout, y compris la gestion de l'équipe ;
--       admin  (Administrateur) : tout, sauf la gestion de l'équipe ;
--       viewer (Lecture seule)  : consulte toute la console, ne modifie rien.
--     Garantie en base : un membre « lecture seule » n'est reconnu comme
--     administrateur QUE dans une transaction en lecture seule (lectures de
--     tables, fonctions STABLE). Toute écriture (fonction VOLATILE, INSERT,
--     UPDATE, DELETE) lui est donc refusée, même en contournant l'interface.
--  2. Journal global : lecture des événements de toute la plateforme. Pour les
--     événements métier d'un établissement, seul le type d'action est montré ;
--     le détail reste réservé à l'établissement.
--  3. Contrôle des modules : arrêt ou réactivation d'une fonctionnalité pour
--     toute la plateforme, un pays ou un type d'établissement (le niveau le
--     plus précis l'emporte), en plus de l'arrêt par établissement existant.
-- Les comptes existants deviennent « Propriétaire » : aucun accès n'est perdu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Équipe et rôles
-- -----------------------------------------------------------------------------
alter table public.platform_admins
  add column role text not null default 'owner' check (role in ('owner', 'admin', 'viewer')),
  add column added_by uuid references public.profiles (id) on delete set null,
  add column updated_at timestamptz not null default now();

-- Rôle du membre connecté (compte actif, double authentification respectée), sinon null.
create or replace function app.platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pa.role
    from public.platform_admins pa
    join public.profiles p on p.id = pa.user_id and p.is_active
   where pa.user_id = auth.uid()
     and app.mfa_satisfied();
$$;

-- Lecture seule : reconnu seulement dans une transaction en lecture seule.
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
              when r in ('owner', 'admin') then true
              when r = 'viewer' then current_setting('transaction_read_only', true) = 'on'
              else false
            end
       from (select app.platform_role() as r) x),
    false);
$$;

create or replace function app.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.platform_role() = 'owner', false);
$$;

create or replace function public.my_platform_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app.platform_role();
$$;

create or replace function public.platform_team()
returns table (user_id uuid, email text, first_name text, last_name text, role text, is_active boolean, mfa boolean,
               created_at timestamptz, updated_at timestamptz, added_by_email text, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.platform_role() is null then
    raise exception 'Réservé à l''équipe de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select pa.user_id, p.email, p.first_name, p.last_name, pa.role, p.is_active,
           exists (select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status = 'verified'),
           pa.created_at, pa.updated_at, ab.email, u.last_sign_in_at
      from public.platform_admins pa
      join public.profiles p on p.id = pa.user_id
      left join public.profiles ab on ab.id = pa.added_by
      left join auth.users u on u.id = pa.user_id
     order by case pa.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.last_name, p.first_name;
end;
$$;

create or replace function app.platform_role_label(p_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'owner' then 'Propriétaire' when 'admin' then 'Administrateur' when 'viewer' then 'Lecture seule' else p_role end;
$$;

-- Ajout d'un compte existant (le compte lui-même est créé par le serveur APRÈS ce contrôle).
create or replace function public.platform_add_team_member(p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not app.is_platform_owner() then
    raise exception 'Seul un propriétaire peut gérer l''équipe de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('owner', 'admin', 'viewer') then
    raise exception 'Rôle inconnu.' using errcode = 'check_violation';
  end if;
  select email into v_email from public.profiles where id = p_user and is_active;
  if v_email is null then
    raise exception 'Compte introuvable ou désactivé.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.platform_admins where user_id = p_user) then
    raise exception 'Ce compte fait déjà partie de l''équipe.' using errcode = 'unique_violation';
  end if;
  insert into public.platform_admins (user_id, role, added_by) values (p_user, p_role, auth.uid());
  perform app.audit(null, 'platform.team_member_added', 'platform_admins', p_user,
    'Membre ajouté à l''équipe : ' || v_email || ' (' || app.platform_role_label(p_role) || ')',
    jsonb_build_object('role', p_role));
end;
$$;

-- Garde-fou : la plateforme garde toujours au moins un propriétaire actif.
create or replace function app.platform_keep_owner(p_except uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.platform_admins pa join public.profiles p on p.id = pa.user_id and p.is_active
     where pa.role = 'owner' and pa.user_id <> p_except
  ) then
    raise exception 'Il doit toujours rester au moins un propriétaire actif.' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.platform_set_team_role(p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_email text;
begin
  if not app.is_platform_owner() then
    raise exception 'Seul un propriétaire peut gérer l''équipe de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('owner', 'admin', 'viewer') then
    raise exception 'Rôle inconnu.' using errcode = 'check_violation';
  end if;
  select pa.role, p.email into v_old, v_email
    from public.platform_admins pa join public.profiles p on p.id = pa.user_id
   where pa.user_id = p_user
   for update of pa;
  if v_old is null then
    raise exception 'Membre introuvable.' using errcode = 'no_data_found';
  end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' then perform app.platform_keep_owner(p_user); end if;
  update public.platform_admins set role = p_role, updated_at = now() where user_id = p_user;
  perform app.audit(null, 'platform.team_role_changed', 'platform_admins', p_user,
    'Rôle modifié : ' || v_email || ' — ' || app.platform_role_label(v_old) || ' → ' || app.platform_role_label(p_role),
    jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

create or replace function public.platform_remove_team_member(p_user uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_email text;
begin
  if not app.is_platform_owner() then
    raise exception 'Seul un propriétaire peut gérer l''équipe de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  select pa.role, p.email into v_role, v_email
    from public.platform_admins pa join public.profiles p on p.id = pa.user_id
   where pa.user_id = p_user
   for update of pa;
  if v_role is null then
    raise exception 'Membre introuvable.' using errcode = 'no_data_found';
  end if;
  if v_role = 'owner' then perform app.platform_keep_owner(p_user); end if;
  -- Le compte lui-même est conservé (il peut appartenir à des établissements) : seul l'accès à la console est retiré.
  delete from public.platform_admins where user_id = p_user;
  perform app.audit(null, 'platform.team_member_removed', 'platform_admins', p_user,
    'Membre retiré de l''équipe : ' || v_email || ' (' || app.platform_role_label(v_role) || ')',
    jsonb_build_object('role', v_role, 'reason', left(btrim(p_reason), 500)));
end;
$$;

revoke all on function public.my_platform_role(), public.platform_team(), public.platform_add_team_member(uuid, text),
  public.platform_set_team_role(uuid, text), public.platform_remove_team_member(uuid, text) from public, anon;
grant execute on function public.my_platform_role(), public.platform_team(), public.platform_add_team_member(uuid, text),
  public.platform_set_team_role(uuid, text), public.platform_remove_team_member(uuid, text) to authenticated;
revoke all on function app.platform_keep_owner(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Journal global
-- -----------------------------------------------------------------------------
create or replace function app.audit_severity(p_action text, p_result text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_result <> 'success' and p_action like 'auth.%' then 'high'
    when p_action ~ '(team_|security|role|permission|mfa_disabled|unlock|revoke|suspend|delete|denied)' then 'high'
    when p_result <> 'success' then 'medium'
    when split_part(p_action, '.', 1) in ('platform', 'settings', 'billing', 'membership') then 'medium'
    else 'info'
  end;
$$;

create or replace function public.platform_activity_log(
  p_from date default null,
  p_to date default null,
  p_org uuid default null,
  p_actor text default null,
  p_category text default null,
  p_severity text default null,
  p_scope text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id bigint, created_at timestamptz, organization_id uuid, organization_name text, actor_email text,
               action text, category text, severity text, result text, entity_type text, summary text,
               details_hidden boolean, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_severity is not null and p_severity not in ('info', 'medium', 'high') then
    raise exception 'Gravité inconnue.' using errcode = 'check_violation';
  end if;
  return query
    with filtered as (
      select a.*, split_part(a.action, '.', 1) as cat, app.audit_severity(a.action, a.result) as sev
        from public.audit_logs a
       where (p_from is null or a.created_at >= p_from::timestamptz)
         and (p_to is null or a.created_at < (p_to + 1)::timestamptz)
         and (p_org is null or a.organization_id = p_org)
         and (p_actor is null or a.actor_email ilike '%' || p_actor || '%')
         and (p_category is null or split_part(a.action, '.', 1) = p_category)
         and (p_scope = 'all' or (p_scope = 'platform' and a.organization_id is null) or (p_scope = 'schools' and a.organization_id is not null))
    )
    select f.id, f.created_at, f.organization_id, o.name, f.actor_email, f.action, f.cat, f.sev, f.result, f.entity_type,
           case when f.organization_id is null or f.cat in ('auth', 'platform', 'billing', 'settings', 'sms', 'teacher_access')
                then f.summary end,
           not (f.organization_id is null or f.cat in ('auth', 'platform', 'billing', 'settings', 'sms', 'teacher_access')),
           count(*) over ()
      from filtered f
      left join public.organizations o on o.id = f.organization_id
     where p_severity is null or f.sev = p_severity
     order by f.created_at desc, f.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.platform_activity_categories()
returns table (category text, events bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query select split_part(a.action, '.', 1), count(*) from public.audit_logs a group by 1 order by 1;
end;
$$;

revoke all on function public.platform_activity_log(date, date, uuid, text, text, text, text, integer, integer),
  public.platform_activity_categories() from public, anon;
grant execute on function public.platform_activity_log(date, date, uuid, text, text, text, text, integer, integer),
  public.platform_activity_categories() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Contrôle des modules (plateforme, pays, type d'établissement)
-- -----------------------------------------------------------------------------
create table public.platform_feature_rules (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null check (feature_key = any (app.org_feature_keys())),
  scope text not null check (scope in ('global', 'country', 'org_type')),
  scope_value text not null default '',
  enabled boolean not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (feature_key, scope, scope_value),
  check ((scope = 'global') = (scope_value = ''))
);
alter table public.platform_feature_rules enable row level security;
create policy platform_feature_rules_select on public.platform_feature_rules for select to authenticated
  using ((select app.is_platform_admin()));
revoke insert, update, delete on public.platform_feature_rules from authenticated, anon;

-- Fonctionnalités arrêtées par les règles de la plateforme pour cet établissement : {clé: false}.
-- Le niveau le plus précis l'emporte : type d'établissement, puis pays, puis plateforme.
create or replace function public.platform_locked_features(o public.organizations)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, false), '{}'::jsonb)
    from unnest(app.org_feature_keys()) as k(key)
   where coalesce(
           (select r.enabled from public.platform_feature_rules r where r.feature_key = k.key and r.scope = 'org_type' and r.scope_value = o.type::text),
           (select r.enabled from public.platform_feature_rules r where r.feature_key = k.key and r.scope = 'country' and r.scope_value = o.country),
           (select r.enabled from public.platform_feature_rules r where r.feature_key = k.key and r.scope = 'global'),
           true) = false;
$$;
grant execute on function public.platform_locked_features(public.organizations) to authenticated, service_role;

-- Les règles de la plateforme s'ajoutent aux arrêts par établissement et aux réglages de l'établissement.
create or replace function app.org_feature_enabled(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((o.settings -> 'platform_features' ->> p_key)::boolean, true)
     and coalesce((o.settings -> 'features' ->> p_key)::boolean, true)
     and not (public.platform_locked_features(o) ? p_key)
  from public.organizations o where o.id = p_org;
$$;

-- Enregistre (p_enabled true/false) ou supprime (p_enabled null) une règle.
create or replace function public.platform_set_feature_rule(p_feature text, p_scope text, p_value text, p_enabled boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_value text := case when p_scope = 'global' then '' else btrim(coalesce(p_value, '')) end;
  v_label text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if not (p_feature = any (app.org_feature_keys())) then
    raise exception 'Fonctionnalité inconnue.' using errcode = 'check_violation';
  end if;
  if p_scope not in ('global', 'country', 'org_type') then
    raise exception 'Niveau inconnu.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_scope = 'country' and not exists (select 1 from public.countries where code = v_value) then
    raise exception 'Pays inconnu.' using errcode = 'check_violation';
  end if;
  if p_scope = 'org_type' and not (v_value = any (enum_range(null::public.organization_type)::text[])) then
    raise exception 'Type d''établissement inconnu.' using errcode = 'check_violation';
  end if;
  v_label := case p_scope when 'global' then 'toute la plateforme' when 'country' then 'pays ' || v_value else 'type ' || v_value end;
  if p_enabled is null then
    delete from public.platform_feature_rules where feature_key = p_feature and scope = p_scope and scope_value = v_value;
    perform app.audit(null, 'platform.feature_rule_removed', 'platform_feature_rules', null,
      'Règle retirée : ' || p_feature || ' — ' || v_label,
      jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'reason', left(btrim(p_reason), 500)));
    return;
  end if;
  insert into public.platform_feature_rules (feature_key, scope, scope_value, enabled, reason, updated_by)
  values (p_feature, p_scope, v_value, p_enabled, left(btrim(p_reason), 500), auth.uid())
  on conflict (feature_key, scope, scope_value)
  do update set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(null, 'platform.feature_rule', 'platform_feature_rules', null,
    case when p_enabled then 'Fonctionnalité ouverte : ' else 'Fonctionnalité arrêtée : ' end || p_feature || ' — ' || v_label,
    jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'enabled', p_enabled, 'reason', left(btrim(p_reason), 500)));
end;
$$;

-- Nombre d'établissements touchés par les règles actuelles, par fonctionnalité.
create or replace function public.platform_feature_impact()
returns table (feature_key text, organizations bigint, locked bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select k.key, count(o.id), count(o.id) filter (where public.platform_locked_features(o) ? k.key)
      from unnest(app.org_feature_keys()) as k(key)
      cross join public.organizations o
     group by k.key;
end;
$$;

revoke all on function public.platform_set_feature_rule(text, text, text, boolean, text), public.platform_feature_impact() from public, anon;
grant execute on function public.platform_set_feature_rule(text, text, text, boolean, text), public.platform_feature_impact() to authenticated;
