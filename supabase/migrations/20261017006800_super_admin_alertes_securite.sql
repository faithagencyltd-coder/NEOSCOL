-- =============================================================================
-- Super Admin — SA-3 : alertes de sécurité.
-- Trois familles, sans exagération :
--   observed   : faits constatés (échecs répétés, accès refusés) ;
--   suspicious : comportements à vérifier (même adresse sur de nombreux
--                comptes, nouvel appareil, nombreuses adresses pour un compte) ;
--   changes    : modifications sensibles (rôles, droits, équipe, double
--                authentification, sessions) faites par une personne.
-- Les adresses IP restent hachées ou tronquées : aucune donnée inutile.
-- Un journal de connexions ne détecte pas toutes les attaques : la page le dit.
-- =============================================================================

create or replace function public.platform_security_alerts(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'days', v_days,
    -- Faits observés
    'repeated_failures', coalesce((select jsonb_agg(x order by x.failures desc) from (
        select left(a.identifier_hash, 12) as identifier, count(*) as failures, max(a.created_at) as last
          from public.auth_login_attempts a
         where a.kind = 'failure' and a.created_at > now() - interval '24 hours'
         group by a.identifier_hash having count(*) >= 3
         order by count(*) desc limit 20) x), '[]'::jsonb),
    'denied', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select a.created_at, a.action, a.actor_email, o.name as organization
          from public.audit_logs a left join public.organizations o on o.id = a.organization_id
         where a.result = 'denied' and a.created_at > now() - make_interval(days => v_days)
         order by a.created_at desc limit 20) x), '[]'::jsonb),
    -- Comportements suspects
    'spraying', coalesce((select jsonb_agg(x order by x.accounts desc) from (
        select left(a.ip_hash, 12) as ip, count(distinct a.identifier_hash) as accounts, count(*) as failures, max(a.created_at) as last
          from public.auth_login_attempts a
         where a.kind = 'failure' and a.created_at > now() - interval '24 hours' and a.ip_hash is not null
         group by a.ip_hash having count(distinct a.identifier_hash) >= 5
         limit 20) x), '[]'::jsonb),
    'new_devices', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select a.created_at, a.actor_email, o.name as organization,
               left(coalesce(a.metadata ->> 'user_agent', ''), 120) as device
          from public.audit_logs a left join public.organizations o on o.id = a.organization_id
         where a.action in ('auth.login', 'auth.login_mfa') and a.result = 'success'
           and a.created_at > now() - make_interval(days => v_days)
           and a.actor_id is not null and a.metadata ? 'user_agent'
           and not exists (
             select 1 from public.audit_logs b
              where b.actor_id = a.actor_id and b.action in ('auth.login', 'auth.login_mfa') and b.result = 'success'
                and b.created_at < a.created_at and b.created_at > a.created_at - interval '90 days'
                and b.metadata ->> 'user_agent' = a.metadata ->> 'user_agent')
           -- La toute première connexion d'un compte n'est pas un « nouvel appareil ».
           and exists (
             select 1 from public.audit_logs c
              where c.actor_id = a.actor_id and c.action in ('auth.login', 'auth.login_mfa') and c.created_at < a.created_at)
         order by a.created_at desc limit 20) x), '[]'::jsonb),
    'many_addresses', coalesce((select jsonb_agg(x order by x.addresses desc) from (
        select a.actor_email, count(distinct a.metadata ->> 'ip') as addresses, max(a.created_at) as last
          from public.audit_logs a
         where a.action in ('auth.login', 'auth.login_mfa') and a.result = 'success'
           and a.created_at > now() - interval '24 hours' and a.actor_id is not null
         group by a.actor_email having count(distinct a.metadata ->> 'ip') >= 4
         limit 20) x), '[]'::jsonb),
    -- Modifications sensibles faites par une personne
    'changes', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select a.created_at, a.action, a.actor_email, o.name as organization,
               case when a.organization_id is null or split_part(a.action, '.', 1) in ('auth', 'platform', 'settings') then a.summary end as summary
          from public.audit_logs a left join public.organizations o on o.id = a.organization_id
         where a.created_at > now() - make_interval(days => v_days)
           and a.actor_id is not null
           and (a.action in ('role_permissions.insert', 'role_permissions.delete', 'membership_roles.insert', 'membership_roles.delete',
                             'memberships.update', 'roles.update', 'roles.delete', 'settings.role_permission',
                             'auth.mfa_disabled', 'auth.sessions_revoked', 'auth.password_changed')
                or a.action like 'platform.team_%'
                or a.action in ('platform.org_features', 'platform.feature_rule', 'platform.feature_rule_removed'))
         order by a.created_at desc limit 30) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_security_alerts(integer) from public, anon;
grant execute on function public.platform_security_alerts(integer) to authenticated;
