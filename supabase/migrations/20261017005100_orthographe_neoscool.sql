-- =============================================================================
-- Orthographe officielle du nom : « NeoScool » dans les messages affichés par
-- les fonctions (exceptions, notifications, journal). Corps des fonctions repris
-- à l'identique, seul le nom change. Aucune donnée modifiée.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.link_existing_staff_account(p_staff_id uuid, p_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff public.staff_members;
  v_user uuid;
  v_role public.roles;
  v_membership public.memberships;
begin
  select * into v_staff from public.staff_members where id = p_staff_id for update;
  if v_staff.id is null or not app.has_permission(v_staff.organization_id, 'users.manage') then
    raise exception 'Membre du personnel introuvable.' using errcode = 'no_data_found';
  end if;
  if v_staff.user_id is not null then
    raise exception 'Un compte de connexion est déjà rattaché à cette fiche.' using errcode = 'check_violation';
  end if;
  if v_staff.status <> 'active' or v_staff.archived_at is not null then
    raise exception 'Réactivez d''abord ce membre du personnel.' using errcode = 'check_violation';
  end if;
  if nullif(btrim(v_staff.email), '') is null then
    raise exception 'Renseignez d''abord l''adresse e-mail du membre du personnel.' using errcode = 'check_violation';
  end if;
  select * into v_role from public.roles where id = p_role_id and organization_id = v_staff.organization_id;
  if v_role.id is null or v_role.persona not in ('staff', 'teacher') then
    raise exception 'Rôle invalide pour un membre du personnel.' using errcode = 'check_violation';
  end if;

  select p.id into v_user from public.profiles p where lower(p.email) = lower(btrim(v_staff.email)) limit 1;
  if v_user is null then
    return jsonb_build_object('result', 'no_account');
  end if;
  if exists (select 1 from public.staff_members s where s.organization_id = v_staff.organization_id and s.user_id = v_user) then
    raise exception 'Ce compte est déjà rattaché à une autre fiche du personnel de votre établissement.' using errcode = 'unique_violation';
  end if;

  select * into v_membership from public.memberships where organization_id = v_staff.organization_id and user_id = v_user for update;
  if v_membership.id is not null and v_membership.status = 'suspended' then
    raise exception 'Ce compte est suspendu dans votre établissement : réactivez-le d''abord (Utilisateurs).' using errcode = 'check_violation';
  end if;
  if v_membership.id is null then
    insert into public.memberships (organization_id, user_id, status, invited_by)
    values (v_staff.organization_id, v_user, 'invited', auth.uid())
    returning * into v_membership;
  end if;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  values (v_staff.organization_id, v_membership.id, v_role.id)
  on conflict do nothing;
  update public.staff_members set user_id = v_user where id = v_staff.id;

  perform app.audit(v_staff.organization_id,
    case when v_membership.status = 'invited' then 'staff.account_invited' else 'staff.account_linked' end,
    'staff_members', v_staff.id,
    case when v_membership.status = 'invited'
      then 'Invitation envoyée au compte NeoScool existant de ' || v_staff.first_name || ' ' || v_staff.last_name
      else 'Compte NeoScool existant rattaché à ' || v_staff.first_name || ' ' || v_staff.last_name end,
    jsonb_build_object('membership_id', v_membership.id, 'role', v_role.key));
  return jsonb_build_object('result', case when v_membership.status = 'invited' then 'invited' else 'linked' end,
                            'membership_id', v_membership.id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_teacher_access_record_payment(p_user uuid, p_org uuid, p_amount integer, p_reference text, p_method text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          'Paiement enregistré par NeoScool. Tous vos établissements supplémentaires sont accessibles jusqu''au ' || to_char(v_to, 'DD/MM/YYYY') || '.',
          '/mes-etablissements');
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'covers_from', v_from, 'covers_to', v_to);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.platform_teacher_access_set_status(p_user uuid, p_org uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            'Motif : ' || left(btrim(p_reason), 200) || '. Votre compte NeoScool et votre premier établissement ne sont pas concernés.', '/mes-etablissements');
  end if;
  return jsonb_build_object('status', v_status, 'state', app.teacher_subscription_state(p_user));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_membership_invitation(p_membership_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'Invitation acceptée : accès avec le compte NeoScool existant', jsonb_build_object('access_state', v_state));
  return jsonb_build_object('result', 'accepted', 'organization', v_org, 'organization_id', v_m.organization_id,
                            'access_state', v_state, 'payment_required', v_state in ('pending', 'expired'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.teacher_access_start_checkout(p_org uuid, p_provider text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'Abonnement suspendu par l''administration NeoScool : contactez le support pour le rétablir.' using errcode = 'check_violation';
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
$function$
;

