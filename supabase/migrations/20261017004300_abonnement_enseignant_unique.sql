-- =============================================================================
-- Abonnement enseignant multi-établissements : UN SEUL abonnement par enseignant.
--
--   Établissement A (le premier)  : toujours gratuit.
--   Établissement B (le 2e)        : l'abonnement est demandé (si la règle est active).
--   Établissements C, D, E…        : couverts par ce même abonnement, sans autre paiement.
--
-- L'abonnement est donc porté par le COMPTE de l'enseignant (teacher_subscriptions,
-- une ligne par compte) et non plus par établissement. Les accès enregistrés par
-- établissement (teacher_extra_accesses) sont repris dans l'abonnement du compte
-- et conservés tels quels (historique) ; les paiements sont conservés et restent
-- rattachés au compte (user_id). Rien n'est supprimé.
-- =============================================================================

create table public.teacher_subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'exempt')),
  period_start date,
  period_end date,
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  first_organization_id uuid references public.organizations (id) on delete set null,
  last_payment_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start is null or period_end is null or period_end >= period_start)
);

alter table public.teacher_subscriptions enable row level security;
-- Lecture : l'enseignant, les établissements où il travaille (users.read), la plateforme.
create policy teacher_subscriptions_select on public.teacher_subscriptions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.is_platform_admin())
    or exists (
      select 1 from public.memberships m
      where m.user_id = teacher_subscriptions.user_id
        and m.organization_id = any ((select app.permitted_org_ids('users.read'))::uuid[])
    )
  );
create trigger teacher_subscriptions_touch before update on public.teacher_subscriptions
  for each row execute function app.touch_updated_at();
grant select on public.teacher_subscriptions to authenticated;

comment on table public.teacher_subscriptions is
  'Abonnement unique d''un enseignant multi-établissements : couvre tous ses établissements à partir du 2e (le 1er reste gratuit).';

-- Reprise des accès enregistrés par établissement : un abonnement par compte.
insert into public.teacher_subscriptions (user_id, status, period_start, period_end, status_reason, first_organization_id, last_payment_at)
select a.user_id,
       case
         when bool_or(a.status = 'exempt') then 'exempt'
         when bool_or(a.status = 'suspended') then 'suspended'
         when max(a.period_end) is not null then 'active'
         else 'pending' end,
       min(a.period_start),
       max(a.period_end),
       (array_agg(a.status_reason order by a.updated_at desc) filter (where a.status_reason is not null))[1],
       (array_agg(a.organization_id order by a.created_at))[1],
       max(a.last_payment_at)
from public.teacher_extra_accesses a
group by a.user_id
on conflict (user_id) do nothing;

-- Les nouveaux paiements ne dépendent plus d'un accès par établissement.
alter table public.teacher_access_payments alter column access_id drop not null;
comment on column public.teacher_access_payments.organization_id is
  'Établissement depuis lequel le paiement a été fait (information) : l''abonnement couvre tous les établissements supplémentaires du compte.';

-- -----------------------------------------------------------------------------
-- État d'une adhésion : suit l'abonnement du COMPTE.
-- -----------------------------------------------------------------------------
create or replace function app.teacher_access_state(p_membership uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_grace integer;
  v_status text;
  v_end date;
begin
  select enabled, grace_days into v_enabled, v_grace from public.platform_teacher_access_settings where id = 1;
  if not coalesce(v_enabled, false) or not app.is_extra_teacher_membership(p_membership) then
    return 'not_required';
  end if;
  select s.status, s.period_end into v_status, v_end
  from public.teacher_subscriptions s
  join public.memberships m on m.user_id = s.user_id
  where m.id = p_membership;
  if v_status is null or v_status = 'pending' then
    return 'pending';
  end if;
  if v_status in ('suspended', 'exempt') then
    return v_status;
  end if;
  if v_end is not null and v_end >= current_date then
    return 'active';
  end if;
  if v_end is not null and v_end + v_grace >= current_date then
    return 'grace';
  end if;
  return 'expired';
end;
$$;

-- État de l'abonnement d'un compte, indépendamment d'un établissement.
create or replace function app.teacher_subscription_state(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.platform_teacher_access_settings;
  v_sub public.teacher_subscriptions;
begin
  select * into v_set from public.platform_teacher_access_settings where id = 1;
  select * into v_sub from public.teacher_subscriptions where user_id = p_user;
  if not coalesce(v_set.enabled, false) then return 'not_required'; end if;
  if v_sub.user_id is null or v_sub.status = 'pending' then return 'pending'; end if;
  if v_sub.status in ('suspended', 'exempt') then return v_sub.status; end if;
  if v_sub.period_end is not null and v_sub.period_end >= current_date then return 'active'; end if;
  if v_sub.period_end is not null and v_sub.period_end + v_set.grace_days >= current_date then return 'grace'; end if;
  return 'expired';
end;
$$;

-- Prolonge l'abonnement du compte (renouvellement anticipé : à la suite de la période en cours).
create or replace function app.teacher_subscription_extend(p_user uuid, p_months integer, p_org uuid)
returns table (covers_from date, covers_to date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.teacher_subscriptions;
  v_from date;
  v_to date;
begin
  insert into public.teacher_subscriptions (user_id, first_organization_id) values (p_user, p_org)
  on conflict (user_id) do nothing;
  select * into v_sub from public.teacher_subscriptions where user_id = p_user for update;
  v_from := case when v_sub.period_end is not null and v_sub.period_end >= current_date then v_sub.period_end + 1 else current_date end;
  v_to := (v_from + make_interval(months => p_months))::date - 1;
  update public.teacher_subscriptions
     set period_start = case when v_sub.period_end is not null and v_sub.period_end >= current_date then coalesce(period_start, v_from) else v_from end,
         period_end = v_to,
         status = case when status in ('suspended', 'exempt') then status else 'active' end,
         status_reason = case when status in ('suspended', 'exempt') then status_reason else null end,
         first_organization_id = coalesce(first_organization_id, p_org),
         last_payment_at = now()
   where user_id = p_user;
  return query select v_from, v_to;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invitation acceptée : l'abonnement du compte est préparé si nécessaire.
-- -----------------------------------------------------------------------------
create or replace function public.respond_membership_invitation(p_membership_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.memberships;
  v_org text;
  v_state text;
begin
  select * into v_m from public.memberships where id = p_membership_id and user_id = auth.uid() for update;
  if v_m.id is null or v_m.status <> 'invited' then
    raise exception 'Invitation introuvable ou déjà traitée.' using errcode = 'no_data_found';
  end if;
  select name into v_org from public.organizations where id = v_m.organization_id;
  if not p_accept then
    update public.staff_members set user_id = null where organization_id = v_m.organization_id and user_id = auth.uid();
    delete from public.memberships where id = v_m.id;
    perform app.audit(v_m.organization_id, 'membership.invitation_declined', 'memberships', v_m.id,
      'Invitation refusée par l''enseignant (compte conservé)');
    return jsonb_build_object('result', 'declined', 'organization', v_org);
  end if;
  update public.memberships set status = 'active', joined_at = now() where id = v_m.id;
  v_state := app.teacher_access_state(v_m.id);
  if v_state <> 'not_required' then
    insert into public.teacher_subscriptions (user_id, first_organization_id) values (auth.uid(), v_m.organization_id)
    on conflict (user_id) do nothing;
  end if;
  perform app.audit(v_m.organization_id, 'membership.invitation_accepted', 'memberships', v_m.id,
    'Invitation acceptée : accès avec le compte Neoscool existant', jsonb_build_object('access_state', v_state));
  return jsonb_build_object('result', 'accepted', 'organization', v_org, 'organization_id', v_m.organization_id,
                            'access_state', v_state, 'payment_required', v_state in ('pending', 'expired'));
end;
$$;

-- -----------------------------------------------------------------------------
-- Vue de l'enseignant : établissements + SON abonnement unique.
-- -----------------------------------------------------------------------------
create or replace function public.my_organization_accesses()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rule', (select jsonb_build_object('enabled', s.enabled, 'price', s.price, 'currency', s.currency,
                                       'period_months', s.period_months, 'grace_days', s.grace_days)
               from public.platform_teacher_access_settings s where s.id = 1),
    'subscription', (
      select jsonb_build_object(
        'state', app.teacher_subscription_state(auth.uid()),
        'status', t.status, 'period_start', t.period_start, 'period_end', t.period_end, 'status_reason', t.status_reason,
        'required', exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active' and app.is_extra_teacher_membership(m.id)),
        'covered', (select count(*) from public.memberships m where m.user_id = auth.uid() and m.status = 'active' and app.is_extra_teacher_membership(m.id)))
      from (select auth.uid() as uid) u
      left join public.teacher_subscriptions t on t.user_id = u.uid),
    'memberships', coalesce((
      select jsonb_agg(x order by x ->> 'status' desc, x ->> 'joined_at')
      from (
        select jsonb_build_object(
          'membership_id', m.id,
          'organization_id', o.id,
          'organization_name', o.name,
          'organization_type', o.type,
          'city', o.city,
          'status', m.status,
          'joined_at', coalesce(m.joined_at, m.created_at),
          'invited_by', nullif(btrim(coalesce(ip.first_name, '') || ' ' || coalesce(ip.last_name, '')), ''),
          'roles', coalesce((select jsonb_agg(r.name order by r.name) from public.membership_roles mr
                              join public.roles r on r.id = mr.role_id where mr.membership_id = m.id), '[]'::jsonb),
          'extra', app.is_extra_teacher_membership(m.id),
          'access_state', case when m.status = 'active' then app.teacher_access_state(m.id) end,
          'period_end', t.period_end,
          'status_reason', t.status_reason
        ) as x
        from public.memberships m
        join public.organizations o on o.id = m.organization_id and o.status = 'active'
        left join public.profiles ip on ip.id = m.invited_by
        left join public.teacher_subscriptions t on t.user_id = m.user_id
        where m.user_id = auth.uid() and m.status in ('active', 'invited')
      ) q
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('reference', p.internal_reference, 'organization_name', o.name,
                                          'amount', p.amount, 'currency', p.currency, 'status', p.status,
                                          'provider', p.provider, 'paid_at', p.paid_at, 'created_at', p.created_at,
                                          'covers_from', p.covers_from, 'covers_to', p.covers_to)
                       order by p.created_at desc)
      from (select * from public.teacher_access_payments where user_id = auth.uid() order by created_at desc limit 30) p
      join public.organizations o on o.id = p.organization_id
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Paiement : un seul abonnement, payable depuis n'importe quel établissement supplémentaire.
-- -----------------------------------------------------------------------------
create or replace function public.teacher_access_start_checkout(p_org uuid, p_provider text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_teacher_access_settings;
  v_m public.memberships;
  v_sub public.teacher_subscriptions;
  v_pay public.teacher_access_payments;
  v_org text;
begin
  select * into v_set from public.platform_teacher_access_settings where id = 1;
  if not v_set.enabled then
    raise exception 'Aucun abonnement supplémentaire n''est demandé actuellement.' using errcode = 'check_violation';
  end if;
  select * into v_m from public.memberships where organization_id = p_org and user_id = auth.uid() and status = 'active';
  if v_m.id is null or not app.is_extra_teacher_membership(v_m.id) then
    raise exception 'Cet établissement ne demande pas d''abonnement supplémentaire pour votre compte.' using errcode = 'check_violation';
  end if;
  if p_mode not in ('test', 'live') then
    raise exception 'Mode de paiement invalide.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.payment_providers where code = p_provider and is_active and code <> 'manual') then
    raise exception 'Fournisseur de paiement indisponible.' using errcode = 'check_violation';
  end if;
  insert into public.teacher_subscriptions (user_id, first_organization_id) values (auth.uid(), p_org)
  on conflict (user_id) do nothing;
  select * into v_sub from public.teacher_subscriptions where user_id = auth.uid() for update;
  if v_sub.status = 'suspended' then
    raise exception 'Abonnement suspendu par l''administration Neoscool : contactez le support pour le rétablir.' using errcode = 'check_violation';
  end if;
  if v_sub.status = 'exempt' then
    raise exception 'Votre abonnement est offert : aucun paiement n''est nécessaire.' using errcode = 'check_violation';
  end if;
  -- Un seul paiement en cours par compte.
  update public.teacher_access_payments
     set status = 'CANCELLED', failure_reason = 'Remplacé par un nouveau paiement'
   where user_id = auth.uid() and status in ('PENDING', 'PROCESSING') and provider = p_provider and mode = p_mode;
  insert into public.teacher_access_payments (access_id, user_id, organization_id, internal_reference, provider, mode,
                                              amount, currency, period_months, status, created_by)
  values (null, auth.uid(), p_org,
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          p_provider, p_mode, v_set.price, v_set.currency, v_set.period_months, 'PENDING', auth.uid())
  returning * into v_pay;
  select name into v_org from public.organizations where id = p_org;
  perform app.audit(p_org, 'teacher_access.checkout', 'teacher_access_payments', v_pay.id,
    'Paiement de l''abonnement enseignant multi-établissements commencé (' || v_pay.amount || ' ' || v_pay.currency || ')');
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'amount', v_pay.amount,
                            'currency', v_pay.currency, 'period_months', v_pay.period_months, 'organization_name', v_org);
end;
$$;

create or replace function public.teacher_access_confirm_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_amount integer, p_currency text,
  p_method text default null, p_response jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.teacher_access_payments;
  v_reason text;
  v_from date;
  v_to date;
begin
  select * into v_pay from public.teacher_access_payments
   where provider = p_provider and (internal_reference = p_reference or (p_reference is null and provider_transaction_id = p_provider_tx))
   for update;
  if v_pay.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  v_reason := case
    when v_pay.mode <> p_mode then 'mode_different'
    when p_provider_tx is not null and v_pay.provider_transaction_id is not null and v_pay.provider_transaction_id <> p_provider_tx then 'identifiant_fournisseur_different'
    when p_amount is distinct from v_pay.amount then 'montant_different'
    when p_currency is distinct from v_pay.currency then 'devise_differente'
  end;
  if v_reason is not null then
    update public.teacher_access_payments
       set provider_response = provider_response || jsonb_build_object('rejected', jsonb_build_object('reason', v_reason, 'at', now(), 'amount', p_amount, 'currency', p_currency))
     where id = v_pay.id;
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
  end if;
  if v_pay.status = 'SUCCESS' then
    return jsonb_build_object('result', 'duplicate', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
  end if;
  select e.covers_from, e.covers_to into v_from, v_to from app.teacher_subscription_extend(v_pay.user_id, v_pay.period_months, v_pay.organization_id) e;
  update public.teacher_access_payments
     set status = 'SUCCESS', paid_at = now(), payment_method = left(coalesce(p_method, payment_method), 60),
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_tx),
         covers_from = v_from, covers_to = v_to, failure_reason = null,
         provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb))
   where id = v_pay.id;
  perform app.audit(v_pay.organization_id, 'teacher_access.paid', 'teacher_access_payments', v_pay.id,
    'Abonnement enseignant multi-établissements payé et activé jusqu''au ' || to_char(v_to, 'DD/MM/YYYY'),
    jsonb_build_object('reference', v_pay.internal_reference, 'amount', v_pay.amount, 'user_id', v_pay.user_id));
  insert into public.notifications (organization_id, user_id, type, title, body, link, data)
  values (v_pay.organization_id, v_pay.user_id, 'teacher_access.paid', 'Abonnement multi-établissements activé',
          'Paiement confirmé (' || v_pay.amount || ' ' || v_pay.currency || '). Tous vos établissements supplémentaires sont accessibles jusqu''au '
            || to_char(v_to, 'DD/MM/YYYY') || '.',
          '/mes-etablissements', jsonb_build_object('reference', v_pay.internal_reference));
  return jsonb_build_object('result', 'confirmed', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id,
                            'covers_from', v_from, 'covers_to', v_to);
end;
$$;

-- -----------------------------------------------------------------------------
-- Console Super Admin : un enseignant = une ligne, avec tous ses établissements.
-- -----------------------------------------------------------------------------
create or replace function public.platform_teacher_accesses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'teacher_name')
    from (
      select jsonb_build_object(
        'user_id', c.user_id,
        'teacher_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
        'email', p.email,
        'primary_organization', (
          select o.name from public.memberships m join public.organizations o on o.id = m.organization_id
           where m.user_id = c.user_id and m.status = 'active' and not app.is_extra_teacher_membership(m.id)
             and exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id
                          where mr.membership_id = m.id and r.persona in ('staff', 'teacher'))
           order by m.created_at limit 1),
        'extra_organizations', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by m.created_at)
          from public.memberships m join public.organizations o on o.id = m.organization_id
          where m.user_id = c.user_id and m.status = 'active' and app.is_extra_teacher_membership(m.id)), '[]'::jsonb),
        'subscription_status', t.status,
        'access_state', app.teacher_subscription_state(c.user_id),
        'period_start', t.period_start,
        'period_end', t.period_end,
        'status_reason', t.status_reason,
        'last_payment', (select jsonb_build_object('reference', tp.internal_reference, 'amount', tp.amount, 'currency', tp.currency,
                                                   'status', tp.status, 'provider', tp.provider, 'at', coalesce(tp.paid_at, tp.created_at))
                           from public.teacher_access_payments tp where tp.user_id = c.user_id
                          order by tp.created_at desc limit 1),
        'paid_total', (select coalesce(sum(tp.amount), 0) from public.teacher_access_payments tp
                        where tp.user_id = c.user_id and tp.status = 'SUCCESS')
      ) as x
      from (
        select distinct m.user_id from public.memberships m
         where m.status = 'active' and app.is_extra_teacher_membership(m.id)
        union
        select s.user_id from public.teacher_subscriptions s
      ) c
      join public.profiles p on p.id = c.user_id
      left join public.teacher_subscriptions t on t.user_id = c.user_id
    ) q
  ), '[]'::jsonb);
end;
$$;

-- Paiement reçu hors ligne : prolonge l'abonnement unique du compte.
create or replace function public.platform_teacher_access_record_payment(
  p_user uuid, p_org uuid, p_amount integer, p_reference text, p_method text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_teacher_access_settings;
  v_pay public.teacher_access_payments;
  v_from date;
  v_to date;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.memberships where user_id = p_user and organization_id = p_org) then
    raise exception 'Cet enseignant n''est pas rattaché à cet établissement.' using errcode = 'no_data_found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant invalide.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Référence du paiement obligatoire.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.teacher_access_payments where provider = 'manual' and mode = 'live' and provider_transaction_id = left(btrim(p_reference), 120)) then
    raise exception 'Cette référence de paiement a déjà été enregistrée : un même versement ne peut pas être compté deux fois.' using errcode = 'unique_violation';
  end if;
  select * into v_set from public.platform_teacher_access_settings where id = 1;
  select e.covers_from, e.covers_to into v_from, v_to from app.teacher_subscription_extend(p_user, v_set.period_months, p_org) e;
  insert into public.teacher_access_payments (access_id, user_id, organization_id, internal_reference, provider, mode,
                                              provider_transaction_id, amount, currency, period_months, status, payment_method,
                                              note, paid_at, covers_from, covers_to, created_by, confirmed_by, provider_response)
  values (null, p_user, p_org,
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          'manual', 'live', left(btrim(p_reference), 120), p_amount, v_set.currency, v_set.period_months, 'SUCCESS',
          left(coalesce(nullif(btrim(p_method), ''), 'manuel'), 60), left(p_note, 500), now(), v_from, v_to, auth.uid(), auth.uid(),
          jsonb_build_object('manual', true))
  returning * into v_pay;
  perform app.audit(p_org, 'teacher_access.manual_payment', 'teacher_access_payments', v_pay.id,
    'Paiement manuel de l''abonnement enseignant multi-établissements validé par la plateforme (' || p_amount || ' ' || v_set.currency || ')',
    jsonb_build_object('user_id', p_user, 'reference', v_pay.internal_reference));
  insert into public.notifications (organization_id, user_id, type, title, body, link)
  values (p_org, p_user, 'teacher_access.paid', 'Abonnement multi-établissements activé',
          'Paiement enregistré par Neoscool. Tous vos établissements supplémentaires sont accessibles jusqu''au ' || to_char(v_to, 'DD/MM/YYYY') || '.',
          '/mes-etablissements');
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'covers_from', v_from, 'covers_to', v_to);
end;
$$;

-- Suspendre / rétablir / offrir : s'applique à l'abonnement du compte (tous ses établissements
-- supplémentaires). Le premier établissement et le compte ne sont jamais touchés.
create or replace function public.platform_teacher_access_set_status(p_user uuid, p_org uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.teacher_subscriptions;
  v_status text;
  v_label text;
  v_org uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('suspend', 'restore', 'exempt', 'remove_exemption') then
    raise exception 'Action inconnue.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.memberships where user_id = p_user) then
    raise exception 'Enseignant introuvable.' using errcode = 'no_data_found';
  end if;
  v_org := coalesce(p_org, (select m.organization_id from public.memberships m where m.user_id = p_user and app.is_extra_teacher_membership(m.id) order by m.created_at limit 1));
  insert into public.teacher_subscriptions (user_id, first_organization_id) values (p_user, v_org)
  on conflict (user_id) do nothing;
  select * into v_sub from public.teacher_subscriptions where user_id = p_user for update;
  if p_action = 'restore' and v_sub.status <> 'suspended' then
    raise exception 'Cet abonnement n''est pas suspendu.' using errcode = 'check_violation';
  end if;
  if p_action = 'remove_exemption' and v_sub.status <> 'exempt' then
    raise exception 'Cet abonnement n''est pas offert.' using errcode = 'check_violation';
  end if;
  v_status := case p_action
    when 'suspend' then 'suspended'
    when 'exempt' then 'exempt'
    else case when v_sub.period_end is not null and v_sub.period_end >= current_date then 'active' else 'pending' end
  end;
  update public.teacher_subscriptions
     set status = v_status, status_reason = left(btrim(p_reason), 500), updated_by = auth.uid()
   where user_id = p_user;
  v_label := case p_action when 'suspend' then 'suspendu' when 'exempt' then 'offert' when 'restore' then 'rétabli' else 'soumis au paiement' end;
  perform app.audit(v_org, 'teacher_access.' || p_action, 'teacher_subscriptions', null,
    'Abonnement enseignant multi-établissements ' || v_label || ' par la plateforme',
    jsonb_build_object('user_id', p_user, 'reason', left(btrim(p_reason), 500), 'status', v_status));
  if v_org is not null then
    insert into public.notifications (organization_id, user_id, type, title, body, link)
    values (v_org, p_user, 'teacher_access.status', 'Abonnement multi-établissements ' || v_label,
            'Motif : ' || left(btrim(p_reason), 200) || '. Votre compte Neoscool et votre premier établissement ne sont pas concernés.', '/mes-etablissements');
  end if;
  return jsonb_build_object('status', v_status, 'state', app.teacher_subscription_state(p_user));
end;
$$;

revoke all on function app.teacher_subscription_state(uuid), app.teacher_subscription_extend(uuid, integer, uuid) from public, anon;
grant execute on function app.teacher_subscription_state(uuid) to authenticated, service_role;
revoke all on function app.teacher_subscription_extend(uuid, integer, uuid) from authenticated;
grant execute on function app.teacher_subscription_extend(uuid, integer, uuid) to service_role;
