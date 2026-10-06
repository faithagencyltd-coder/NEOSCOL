-- =============================================================================
-- Super Admin — SA-2 : tableau de bord général (données réelles uniquement).
-- Une seule fonction de lecture regroupe les chiffres clés et les alertes.
-- « Connectés maintenant » est une estimation honnête : sessions actives
-- rafraîchies dans les 15 dernières minutes.
-- =============================================================================

create or replace function public.platform_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today timestamptz := date_trunc('day', now());
  v_alerts jsonb := '[]'::jsonb;
  v_n bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;

  -- Alertes (chaque alerte : niveau, titre, détail, lien).
  select count(*) into v_n from public.subscriptions s
   where s.status in ('ACTIVE', 'TRIALING') and not s.is_demo
     and coalesce(case when s.status = 'TRIALING' then s.trial_end end, s.current_period_end) between now() and now() + interval '7 days';
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'warning', 'title', v_n || ' abonnement(s) arrivent à échéance sous 7 jours', 'href', '/plateforme/abonnements'); end if;

  select count(*) into v_n from public.subscriptions s where s.status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED') and not s.is_demo;
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'danger', 'title', v_n || ' abonnement(s) impayé(s) ou restreint(s)', 'href', '/plateforme/abonnements'); end if;

  select count(*) into v_n from public.payment_transactions t where t.provider = 'offline' and t.status = 'PENDING';
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'warning', 'title', v_n || ' paiement(s) hors ligne à valider', 'href', '/plateforme/paiements'); end if;

  select count(*) into v_n from public.platform_integrations i where i.enabled and i.last_test_ok is false;
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'danger', 'title', v_n || ' intégration(s) active(s) en échec au dernier test', 'href', '/plateforme/integrations'); end if;

  select count(*) into v_n from public.payment_gateway_settings g where g.checkout_enabled and g.last_test_ok is false;
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'danger', 'title', v_n || ' passerelle(s) de paiement en échec au dernier test', 'href', '/plateforme/paiements-en-ligne'); end if;

  select (select count(*) from public.payment_webhooks w where w.processing_status = 'rejected' and w.received_at > now() - interval '24 hours')
       + (select count(*) from public.fee_payment_webhooks w where w.processing_status = 'rejected' and w.received_at > now() - interval '24 hours') into v_n;
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'warning', 'title', v_n || ' notification(s) de paiement rejetée(s) en 24 h', 'href', '/plateforme/supervision'); end if;

  select count(*) into v_n from public.auth_login_attempts a where a.kind = 'failure' and a.created_at > now() - interval '1 hour';
  if v_n >= 20 then v_alerts := v_alerts || jsonb_build_object('level', 'danger', 'title', v_n || ' échecs de connexion dans la dernière heure', 'href', '/plateforme/securite'); end if;

  select count(*) into v_n from public.platform_admins pa
   where not exists (select 1 from auth.mfa_factors f where f.user_id = pa.user_id and f.status = 'verified');
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'info', 'title', v_n || ' membre(s) de l''équipe sans double authentification', 'href', '/plateforme/equipe'); end if;

  select count(*) into v_n from public.organizations o where o.email_verification = 'pending';
  if v_n > 0 then v_alerts := v_alerts || jsonb_build_object('level', 'info', 'title', v_n || ' établissement(s) dont l''e-mail reste à vérifier', 'href', '/plateforme/securite'); end if;

  return jsonb_build_object(
    'organizations', (select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where o.status = 'active'),
        'suspended', count(*) filter (where o.status <> 'active'),
        'demo', count(*) filter (where o.is_demo),
        'new_30d', count(*) filter (where o.created_at > now() - interval '30 days'),
        'new_7d', count(*) filter (where o.created_at > now() - interval '7 days'))
      from public.organizations o),
    'users', jsonb_build_object(
        'total', (select count(*) from public.profiles p where p.is_active),
        'logins_today', (select count(distinct a.actor_id) from public.audit_logs a
                          where a.action in ('auth.login', 'auth.login_mfa') and a.result = 'success' and a.created_at >= v_today),
        'online_estimate', (select count(distinct s.user_id) from auth.sessions s
                             where coalesce(s.refreshed_at, s.updated_at, s.created_at) > now() - interval '15 minutes'),
        'failed_logins_24h', (select count(*) from public.auth_login_attempts a where a.kind = 'failure' and a.created_at > now() - interval '24 hours')),
    'subscriptions', (select jsonb_build_object(
        'active', count(*) filter (where s.status = 'ACTIVE'),
        'trialing', count(*) filter (where s.status = 'TRIALING'),
        'unpaid', count(*) filter (where s.status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED')),
        'ended', count(*) filter (where s.status in ('CANCELLED', 'EXPIRED')))
      from public.subscriptions s where not s.is_demo),
    'expiring', coalesce((select jsonb_agg(x order by x.ends_at) from (
        select o.id, o.name, s.status, coalesce(case when s.status = 'TRIALING' then s.trial_end end, s.current_period_end) as ends_at
          from public.subscriptions s join public.organizations o on o.id = s.organization_id
         where s.status in ('ACTIVE', 'TRIALING') and not s.is_demo
           and coalesce(case when s.status = 'TRIALING' then s.trial_end end, s.current_period_end) between now() and now() + interval '30 days'
         limit 10) x), '[]'::jsonb),
    'alerts', v_alerts,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.platform_dashboard() from public, anon;
grant execute on function public.platform_dashboard() to authenticated;
