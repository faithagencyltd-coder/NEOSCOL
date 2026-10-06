-- =============================================================================
-- Super Admin — SA-7 : fiche établissement complète, recherche d'un compte,
-- suspension / réactivation motivée d'un compte.
-- Aucun accès caché aux données des élèves : la fiche ne montre que des
-- volumes, l'abonnement, la consommation, les comptes (e-mail, rôle, dernière
-- connexion) et les événements de plateforme. Le « voir comme » n'est pas
-- proposé : il donnerait un accès invisible aux données de l'école.
-- =============================================================================

create or replace function public.platform_organization_profile(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.organizations;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.organizations where id = p_org;
  if o.id is null then
    raise exception 'Établissement introuvable.' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'code', o.code, 'type', o.type, 'city', o.city, 'country', o.country,
        'status', o.status, 'is_demo', o.is_demo, 'created_at', o.created_at, 'email', o.email, 'email_verification', o.email_verification, 'currency', o.currency),
    'subscription', (select jsonb_build_object('status', s.status, 'plan', p.name, 'interval', s.billing_interval, 'trial_end', s.trial_end,
          'period_end', s.current_period_end, 'next_billing_date', s.next_billing_date, 'is_demo', s.is_demo,
          'price', case s.billing_interval when 'YEARLY' then s.annual_price else s.monthly_price end, 'currency', s.currency)
        from public.subscriptions s left join public.subscription_plans p on p.id = s.plan_id where s.organization_id = o.id order by s.created_at desc limit 1),
    'counts', jsonb_build_object(
        'students', (select count(*) from public.students st where st.organization_id = o.id and st.archived_at is null),
        'staff', (select count(*) from public.staff_members sm where sm.organization_id = o.id and sm.archived_at is null),
        'members', (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
        'files', (select count(*) from public.file_objects f where f.organization_id = o.id),
        'storage_bytes', (select coalesce(sum(f.size_bytes), 0) from public.file_objects f where f.organization_id = o.id)),
    'usage', jsonb_build_object(
        'sms_balance', (select w.balance from public.sms_wallets w where w.organization_id = o.id),
        'ai_requests_month', (select count(*) from public.assistant_usage u where u.organization_id = o.id and u.created_at >= date_trunc('month', now())),
        'logins_30d', (select count(*) from public.audit_logs a where a.organization_id = o.id and a.action in ('auth.login', 'auth.login_mfa') and a.created_at > now() - interval '30 days'),
        'last_login', (select max(a.created_at) from public.audit_logs a where a.organization_id = o.id and a.action in ('auth.login', 'auth.login_mfa'))),
    'paid', coalesce((select jsonb_agg(x order by x.paid_at desc) from (
        select e.paid_at, e.reference, e.label, e.amount, e.currency from app.revenue_entries(true) e where e.organization_id = o.id order by e.paid_at desc limit 5) x), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(x order by x.is_admin desc, x.email) from (
        select p.id as user_id, p.email, p.first_name, p.last_name, p.is_active, m.status,
               (select string_agg(r.name, ', ' order by r.name) from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id) as roles,
               exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id and r.key = 'org_admin') as is_admin,
               u.last_sign_in_at
          from public.memberships m join public.profiles p on p.id = m.user_id left join auth.users u on u.id = p.id
         where m.organization_id = o.id
         limit 200) x), '[]'::jsonb),
    'tickets', (select jsonb_build_object('open', count(*) filter (where t.status in ('open', 'in_progress', 'waiting')), 'total', count(*))
        from public.support_tickets t where t.organization_id = o.id),
    'events', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select a.created_at, a.action, a.actor_email, a.result,
               case when split_part(a.action, '.', 1) in ('auth', 'platform', 'billing', 'settings', 'sms', 'teacher_access') then a.summary end as summary
          from public.audit_logs a where a.organization_id = o.id
           and split_part(a.action, '.', 1) in ('auth', 'platform', 'billing', 'settings', 'sms', 'teacher_access', 'support')
         order by a.created_at desc limit 15) x), '[]'::jsonb)
  );
end;
$$;

-- Recherche d'un compte (e-mail, nom, téléphone) : établissements, rôles, statut, dernière connexion.
create or replace function public.platform_user_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_q) < 3 then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(x order by x.email) from (
    select p.id as user_id, p.email, p.first_name, p.last_name, p.phone, p.is_active, u.last_sign_in_at, u.created_at,
           (select pa.role from public.platform_admins pa where pa.user_id = p.id) as platform_role,
           exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as mfa,
           (select count(*) from auth.sessions s where s.user_id = p.id) as sessions,
           coalesce((select jsonb_agg(jsonb_build_object('organization_id', o.id, 'organization', o.name, 'status', m.status,
               'roles', (select string_agg(r.name, ', ' order by r.name) from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id)))
              from public.memberships m join public.organizations o on o.id = m.organization_id where m.user_id = p.id), '[]'::jsonb) as memberships
      from public.profiles p left join auth.users u on u.id = p.id
     where p.email ilike '%' || v_q || '%'
        or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || v_q || '%'
        or coalesce(p.phone, '') ilike '%' || v_q || '%'
     order by p.email limit 25) x), '[]'::jsonb);
end;
$$;

-- Suspension / réactivation d'un compte (motif obligatoire, journalisée). Les sessions sont fermées à la suspension.
create or replace function public.platform_set_user_active(p_user uuid, p_active boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then
    raise exception 'Vous ne pouvez pas suspendre votre propre compte.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if not p_active and exists (select 1 from public.platform_admins where user_id = p_user and role = 'owner') and not app.is_platform_owner() then
    raise exception 'Seul un propriétaire peut suspendre un autre propriétaire.' using errcode = 'insufficient_privilege';
  end if;
  if not p_active and exists (select 1 from public.platform_admins where user_id = p_user and role = 'owner') then
    perform app.platform_keep_owner(p_user);
  end if;
  update public.profiles set is_active = p_active where id = p_user returning email into v_email;
  if v_email is null then
    raise exception 'Compte introuvable.' using errcode = 'no_data_found';
  end if;
  if not p_active then
    delete from auth.sessions where user_id = p_user;
  end if;
  perform app.audit(null, case when p_active then 'platform.user_reactivated' else 'platform.user_suspended' end, 'profiles', p_user,
    case when p_active then 'Compte réactivé : ' else 'Compte suspendu : ' end || v_email, jsonb_build_object('reason', left(btrim(p_reason), 500)));
end;
$$;

revoke all on function public.platform_organization_profile(uuid), public.platform_user_search(text), public.platform_set_user_active(uuid, boolean, text) from public, anon;
grant execute on function public.platform_organization_profile(uuid), public.platform_user_search(text), public.platform_set_user_active(uuid, boolean, text) to authenticated;
