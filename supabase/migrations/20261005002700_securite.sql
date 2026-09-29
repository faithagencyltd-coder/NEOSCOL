-- =============================================================================
-- P4 — SÉCURITÉ
--   1. Double authentification (TOTP) appliquée EN BASE : un compte qui a
--      activé la double authentification n'a AUCUN droit tant que sa session
--      n'est pas au niveau aal2 (mot de passe volé = inutilisable).
--   2. Verrouillage progressif des comptes et anti-robot après échecs.
--   3. Vérification de l'adresse e-mail des nouveaux établissements :
--      établissement en lecture seule tant que l'adresse n'est pas vérifiée.
--   4. Sessions et appareils : liste et révocation.
--   5. Réglages de sécurité de la plateforme (Super Admin).
-- =============================================================================

create table public.platform_security_settings (
  id int primary key default 1 check (id = 1),
  lockout_threshold int not null default 5 check (lockout_threshold between 3 and 50),
  lockout_minutes int not null default 15 check (lockout_minutes between 1 and 1440),
  captcha_after_failures int not null default 3 check (captcha_after_failures between 1 and 50),
  mfa_required_sensitive boolean not null default false,
  email_verification_required boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.platform_security_settings (id) values (1);

-- -----------------------------------------------------------------------------
-- 1. Double authentification appliquée par la base
-- -----------------------------------------------------------------------------
create or replace function app.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.profiles p on p.id = pa.user_id and p.is_active
    where pa.user_id = auth.uid()
  ) and app.mfa_satisfied();
$$;

create or replace function app.permitted_org_ids(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.organization_id), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and rp.permission_code = p_permission
    and app.mfa_satisfied()
    and (app.permission_allowed_read_only(p_permission) or app.org_billing_access(m.organization_id) = 'full');
$$;

-- État MFA de l'utilisateur courant (pour l'application).
create or replace function public.my_security_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mfa_enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'platform_admin', exists (select 1 from public.platform_admins where user_id = auth.uid()),
    'sensitive', exists (select 1 from public.platform_admins where user_id = auth.uid())
      or exists (select 1 from public.memberships m
                   join public.membership_roles mr on mr.membership_id = m.id
                   join public.roles r on r.id = mr.role_id
                  where m.user_id = auth.uid() and m.status = 'active' and r.key in ('org_admin', 'director', 'accountant')),
    'mfa_required', (select mfa_required_sensitive from public.platform_security_settings where id = 1)
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Tentatives de connexion : verrouillage et anti-robot progressif
-- -----------------------------------------------------------------------------
create table public.auth_login_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null check (identifier_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('failure', 'success', 'unlock')),
  created_at timestamptz not null default now()
);
create index auth_login_attempts_identifier on public.auth_login_attempts (identifier_hash, created_at desc);
create index auth_login_attempts_ip on public.auth_login_attempts (ip_hash, created_at desc);
alter table public.auth_login_attempts enable row level security;
revoke all on public.auth_login_attempts from anon, authenticated;

-- Avant une tentative (serveur) : compte verrouillé ? anti-robot exigé ?
create or replace function public.login_guard(p_identifier_hash text, p_ip_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select * from public.platform_security_settings where id = 1),
  since as (
    select greatest(
      now() - make_interval(mins => cfg.lockout_minutes),
      coalesce((select max(created_at) from public.auth_login_attempts
                 where identifier_hash = p_identifier_hash and kind in ('success', 'unlock')), '-infinity')
    ) as t from cfg
  ),
  f as (
    select count(*) as n, max(created_at) as last
    from public.auth_login_attempts, since
    where identifier_hash = p_identifier_hash and kind = 'failure' and created_at > since.t
  ),
  ip as (
    select count(*) as n from public.auth_login_attempts
    where p_ip_hash is not null and ip_hash = p_ip_hash and kind = 'failure' and created_at > now() - interval '1 hour'
  )
  select jsonb_build_object(
    'locked', f.n >= cfg.lockout_threshold,
    'locked_until', case when f.n >= cfg.lockout_threshold then f.last + make_interval(mins => cfg.lockout_minutes) end,
    'captcha', f.n >= cfg.captcha_after_failures or ip.n >= cfg.captcha_after_failures,
    'failures', f.n
  )
  from cfg, f, ip;
$$;

create or replace function public.login_record(p_identifier_hash text, p_ip_hash text, p_success boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.auth_login_attempts (identifier_hash, ip_hash, kind)
  values (p_identifier_hash, p_ip_hash, case when p_success then 'success' else 'failure' end);
  delete from public.auth_login_attempts where created_at < now() - interval '90 days';
$$;

revoke execute on function public.login_guard(text, text) from public, anon, authenticated;
revoke execute on function public.login_record(text, text, boolean) from public, anon, authenticated;
grant execute on function public.login_guard(text, text) to service_role;
grant execute on function public.login_record(text, text, boolean) to service_role;
grant select, insert, delete on public.auth_login_attempts to service_role;

-- -----------------------------------------------------------------------------
-- 3. Vérification de l'adresse e-mail des nouveaux établissements
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column email_verification text not null default 'verified' check (email_verification in ('pending', 'verified')),
  add column email_verified_at timestamptz;

create table public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.email_verification_tokens enable row level security;
revoke all on public.email_verification_tokens from anon, authenticated;
grant select, insert, update on public.email_verification_tokens to service_role;

-- Accès : un établissement dont l'adresse n'est pas vérifiée (ou dont
-- l'établissement principal ne l'est pas) est en lecture seule.
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
    when exists (
      select 1 from public.organizations o left join public.organizations g on g.id = o.parent_id
      where o.id = p_org and (o.email_verification = 'pending' or g.email_verification = 'pending')
    ) then 'read_only'
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

-- Bandeau : état de vérification visible par les membres.
create or replace function public.email_verification_state(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not (p_org = any (app.member_org_ids())) then null else (
    select jsonb_build_object('pending', o.email_verification = 'pending' or coalesce(g.email_verification, 'verified') = 'pending',
                              'group_id', case when coalesce(g.email_verification, 'verified') = 'pending' then g.id end)
    from public.organizations o left join public.organizations g on g.id = o.parent_id where o.id = p_org) end;
$$;

-- Serveur uniquement : validation d'un lien de vérification (jeton haché, usage unique, 48 h).
create or replace function public.verify_organization_email(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token public.email_verification_tokens;
begin
  select * into v_token from public.email_verification_tokens where token_hash = p_token_hash for update;
  if v_token.id is null or v_token.used_at is not null or v_token.expires_at < now() then
    return jsonb_build_object('ok', false);
  end if;
  update public.email_verification_tokens set used_at = now() where id = v_token.id;
  update public.organizations set email_verification = 'verified', email_verified_at = now() where id = v_token.organization_id;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values (v_token.organization_id, v_token.user_id, 'auth.email_verified', 'organizations', v_token.organization_id,
          'Adresse e-mail vérifiée : établissement activé', jsonb_build_object('source', 'app'));
  return jsonb_build_object('ok', true, 'organization_id', v_token.organization_id);
end;
$$;

revoke execute on function public.verify_organization_email(text) from public, anon, authenticated;
grant execute on function public.verify_organization_email(text) to service_role;
revoke execute on function public.email_verification_state(uuid) from public, anon;
grant execute on function public.email_verification_state(uuid) to authenticated;
revoke execute on function public.my_security_state() from public, anon;
grant execute on function public.my_security_state() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Sessions et appareils
-- -----------------------------------------------------------------------------
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text, aal text, current boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at), s.user_agent, host(s.ip), s.aal::text,
         s.id::text = auth.jwt() ->> 'session_id'
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
  limit 50;
$$;

create or replace function public.revoke_my_session(p_session uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = 'insufficient_privilege';
  end if;
  if p_session::text = auth.jwt() ->> 'session_id' then
    raise exception 'Utilisez « Se déconnecter » pour fermer la session en cours.' using errcode = 'check_violation';
  end if;
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  if not found then
    raise exception 'Session introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  perform app.audit(null, 'auth.session_revoked', 'sessions', p_session, 'Session d''un appareil fermée', '{}'::jsonb, 'success');
end;
$$;

revoke execute on function public.my_sessions() from public, anon;
revoke execute on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Centre de sécurité (Super Admin)
-- -----------------------------------------------------------------------------
alter table public.platform_security_settings enable row level security;
revoke all on public.platform_security_settings from anon, authenticated;
grant select on public.platform_security_settings to authenticated, service_role;
create policy platform_security_settings_read on public.platform_security_settings for select to authenticated using (true);

create or replace function public.platform_update_security_settings(
  p_lockout_threshold int, p_lockout_minutes int, p_captcha_after int, p_mfa_required boolean, p_email_verification boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_security_settings set
    lockout_threshold = p_lockout_threshold, lockout_minutes = p_lockout_minutes, captcha_after_failures = p_captcha_after,
    mfa_required_sensitive = p_mfa_required, email_verification_required = p_email_verification, updated_at = now()
  where id = 1;
  perform app.audit(null, 'platform.security_settings', 'platform_security_settings', null, 'Réglages de sécurité de la plateforme modifiés',
    jsonb_build_object('lockout_threshold', p_lockout_threshold, 'lockout_minutes', p_lockout_minutes, 'captcha_after', p_captcha_after,
                       'mfa_required', p_mfa_required, 'email_verification', p_email_verification), 'success');
end;
$$;

-- Vue d'ensemble : comptes verrouillés, échecs récents, MFA des rôles sensibles.
create or replace function public.platform_security_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg public.platform_security_settings;
begin
  perform app.require_platform_admin();
  select * into v_cfg from public.platform_security_settings where id = 1;
  return jsonb_build_object(
    'failures_24h', (select count(*) from public.auth_login_attempts where kind = 'failure' and created_at > now() - interval '24 hours'),
    'successes_24h', (select count(*) from public.auth_login_attempts where kind = 'success' and created_at > now() - interval '24 hours'),
    'locked', coalesce((
      select jsonb_agg(jsonb_build_object('identifier_hash', x.identifier_hash, 'failures', x.n, 'last', x.last) order by x.last desc)
      from (
        select a.identifier_hash, count(*) n, max(a.created_at) last
        from public.auth_login_attempts a
        where a.kind = 'failure'
          and a.created_at > now() - make_interval(mins => v_cfg.lockout_minutes)
          and a.created_at > coalesce((select max(b.created_at) from public.auth_login_attempts b
                                        where b.identifier_hash = a.identifier_hash and b.kind in ('success', 'unlock')), '-infinity')
        group by a.identifier_hash
        having count(*) >= v_cfg.lockout_threshold
      ) x), '[]'::jsonb),
    'pending_verification', (select count(*) from public.organizations where email_verification = 'pending'),
    'sensitive_accounts', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'platform_admin', u.pa,
               'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
               'sessions', (select count(*) from auth.sessions s where s.user_id = u.id)) order by u.pa desc, u.email)
      from (
        select distinct au.id, au.email, exists (select 1 from public.platform_admins pa where pa.user_id = au.id) as pa
        from auth.users au
        where exists (select 1 from public.platform_admins pa where pa.user_id = au.id)
           or exists (select 1 from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
                      join public.roles r on r.id = mr.role_id
                      where m.user_id = au.id and m.status = 'active' and r.key in ('org_admin', 'director', 'accountant'))
        limit 200
      ) u), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_unlock_account(p_identifier_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  insert into public.auth_login_attempts (identifier_hash, kind) values (p_identifier_hash, 'unlock');
  perform app.audit(null, 'platform.account_unlocked', 'auth_login_attempts', null, 'Compte déverrouillé par la plateforme',
    jsonb_build_object('identifier_hash', p_identifier_hash), 'success');
end;
$$;

-- Déconnexion forcée de tous les appareils d'un compte (compte compromis).
create or replace function public.platform_revoke_user_sessions(p_user uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform app.require_platform_admin();
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  perform app.audit(null, 'platform.sessions_revoked', 'users', p_user, 'Toutes les sessions d''un compte ont été fermées',
    jsonb_build_object('count', v_count), 'success');
  return v_count;
end;
$$;

revoke execute on function public.platform_update_security_settings(int, int, int, boolean, boolean) from public, anon;
revoke execute on function public.platform_security_overview() from public, anon;
revoke execute on function public.platform_unlock_account(text) from public, anon;
revoke execute on function public.platform_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.platform_update_security_settings(int, int, int, boolean, boolean) to authenticated;
grant execute on function public.platform_security_overview() to authenticated;
grant execute on function public.platform_unlock_account(text) to authenticated;
grant execute on function public.platform_revoke_user_sessions(uuid) to authenticated;
