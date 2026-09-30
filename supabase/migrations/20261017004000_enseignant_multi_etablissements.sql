-- =============================================================================
-- Enseignant multi-établissements : UN compte Neoscool, plusieurs établissements.
--
-- 1. Rattachement d'un compte existant : quand un établissement crée le compte
--    d'un enseignant dont l'adresse e-mail a déjà un compte Neoscool, aucun
--    second compte n'est créé. Une invitation (adhésion « invited ») est posée ;
--    l'enseignant l'accepte avec ses identifiants habituels. Le rôle est propre
--    à chaque établissement (membership_roles), donc les droits aussi.
--
-- 2. Accès supplémentaire payant (réglé par le Super Admin) : quand la règle est
--    active, l'accès d'un enseignant à un établissement SUPPLÉMENTAIRE (autre que
--    son premier établissement) exige un abonnement en cours. Sans abonnement
--    valide, l'adhésion reste intacte mais ne donne AUCUN droit : la garde est
--    ajoutée dans app.member_org_ids / app.permitted_org_ids / my_permissions /
--    app.my_personas, donc toute la RLS en tient compte. Le compte et ses autres
--    établissements ne sont jamais touchés ; rien n'est supprimé.
--
-- 3. Paiement : même circuit que les abonnements (fournisseur, vérification
--    serveur, idempotence). Référence NEO-AAAA-NNNNNN tirée de la même séquence
--    (unique entre les deux registres). Expiration calculée à la volée
--    (fin de période + délai de grâce) : aucune tâche planifiée nécessaire.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Réglage plateforme (une seule ligne) + historique des prix
-- -----------------------------------------------------------------------------
create table public.platform_teacher_access_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  price integer not null default 0 check (price between 0 and 100000000),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  period_months integer not null default 1 check (period_months in (1, 3, 6, 12)),
  grace_days integer not null default 0 check (grace_days between 0 and 60),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not enabled or price > 0)
);
insert into public.platform_teacher_access_settings (id) values (1);

create table public.platform_teacher_access_settings_history (
  id bigint generated always as identity primary key,
  enabled boolean not null,
  price integer not null,
  currency text not null,
  period_months integer not null,
  grace_days integer not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.platform_teacher_access_settings enable row level security;
alter table public.platform_teacher_access_settings_history enable row level security;
create policy platform_teacher_access_settings_select on public.platform_teacher_access_settings for select to authenticated
  using ((select app.is_platform_admin()));
create policy platform_teacher_access_settings_history_select on public.platform_teacher_access_settings_history for select to authenticated
  using ((select app.is_platform_admin()));

comment on table public.platform_teacher_access_settings is
  'Règle Super Admin : abonnement supplémentaire pour l''accès d''un enseignant à un établissement de plus (prix, périodicité, grâce).';

-- -----------------------------------------------------------------------------
-- Accès supplémentaires (un par enseignant et établissement supplémentaire)
-- -----------------------------------------------------------------------------
create table public.teacher_extra_accesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'exempt')),
  period_start date,
  period_end date,
  status_reason text check (status_reason is null or char_length(status_reason) <= 500),
  last_payment_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id),
  check (period_start is null or period_end is null or period_end >= period_start)
);
create index teacher_extra_accesses_org_idx on public.teacher_extra_accesses (organization_id);

create table public.teacher_access_payments (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.teacher_extra_accesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  internal_reference text not null unique check (internal_reference ~ '^NEO-[0-9]{4}-[0-9]{6,}$'),
  provider text not null references public.payment_providers (code),
  mode text not null check (mode in ('test', 'live')),
  provider_transaction_id text,
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_months integer not null check (period_months in (1, 3, 6, 12)),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  payment_method text,
  checkout_url text,
  provider_response jsonb not null default '{}'::jsonb,
  failure_reason text,
  note text check (note is null or char_length(note) <= 500),
  paid_at timestamptz,
  covers_from date,
  covers_to date,
  created_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, mode, provider_transaction_id),
  check (status <> 'SUCCESS' or paid_at is not null),
  check (provider <> 'simulation' or mode = 'test')
);
create index teacher_access_payments_user_idx on public.teacher_access_payments (user_id, created_at desc);
create index teacher_access_payments_org_idx on public.teacher_access_payments (organization_id, created_at desc);

alter table public.teacher_extra_accesses enable row level security;
alter table public.teacher_access_payments enable row level security;
-- Lecture : l'enseignant (les siens), l'établissement concerné (users.read), la plateforme.
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
create policy teacher_extra_accesses_select on public.teacher_extra_accesses for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id = any ((select app.permitted_org_ids('users.read'))::uuid[])
    or (select app.is_platform_admin())
  );
create policy teacher_access_payments_select on public.teacher_access_payments for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));

create trigger teacher_extra_accesses_touch before update on public.teacher_extra_accesses
  for each row execute function app.touch_updated_at();
create trigger teacher_access_payments_touch before update on public.teacher_access_payments
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Qui est concerné ?
-- Adhésion SUPPLÉMENTAIRE d'enseignant = adhésion active avec un rôle enseignant,
-- alors que le même compte a déjà, dans un AUTRE établissement (hors espaces du
-- même groupe Module 4), une adhésion active plus ancienne avec un rôle de
-- personnel ou d'enseignant. Le premier établissement reste toujours gratuit.
-- -----------------------------------------------------------------------------
create or replace function app.is_extra_teacher_membership(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.id = p_membership
      and exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id
                   where mr.membership_id = m.id and r.persona = 'teacher')
      and exists (
        select 1
        from public.memberships m2
        join public.organizations o2 on o2.id = m2.organization_id and o2.status = 'active'
        where m2.user_id = m.user_id
          and m2.id <> m.id
          and m2.status = 'active'
          and (m2.created_at, m2.id) < (m.created_at, m.id)
          and coalesce(o2.parent_id, o2.id) <> coalesce(o.parent_id, o.id)
          and exists (select 1 from public.membership_roles mr2 join public.roles r2 on r2.id = mr2.role_id
                       where mr2.membership_id = m2.id and r2.persona in ('staff', 'teacher'))
      )
  );
$$;

-- État de l'accès d'une adhésion :
--   not_required (règle inactive ou premier établissement) · pending (jamais payé)
--   active · grace (période finie, délai de grâce en cours) · expired
--   suspended (par la plateforme) · exempt (accès offert par la plateforme)
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
  select a.status, a.period_end into v_status, v_end
  from public.teacher_extra_accesses a
  join public.memberships m on m.user_id = a.user_id and m.organization_id = a.organization_id
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

-- Garde : l'adhésion est-elle privée de droits faute d'abonnement supplémentaire ?
-- Chemin rapide quand la règle est inactive (une lecture de la ligne de réglage).
create or replace function app.teacher_access_blocked(p_membership uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((select enabled from public.platform_teacher_access_settings where id = 1), false) then
    return false;
  end if;
  return app.teacher_access_state(p_membership) in ('pending', 'expired', 'suspended');
end;
$$;

-- -----------------------------------------------------------------------------
-- Fonctions d'accès : mêmes définitions qu'avant + la garde ci-dessus.
-- -----------------------------------------------------------------------------
create or replace function app.member_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.user_id = auth.uid()
    and m.status = 'active'
    and not app.teacher_access_blocked(m.id);
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
    and (app.permission_allowed_read_only(p_permission) or app.org_billing_access(m.organization_id) = 'full')
    and not app.teacher_access_blocked(m.id);
$$;

create or replace function public.my_permissions(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_code order by rp.permission_code), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = auth.uid()
    and m.organization_id = p_org
    and m.status = 'active'
    and (app.permission_allowed_read_only(rp.permission_code) or app.org_billing_access(p_org) = 'full')
    and not app.teacher_access_blocked(m.id);
$$;

create or replace function app.my_personas(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.persona), '{}')
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.user_id = auth.uid()
    and m.organization_id = p_org
    and m.status = 'active'
    and not app.teacher_access_blocked(m.id);
$$;

-- -----------------------------------------------------------------------------
-- 1. Rattachement d'un compte existant (établissement, droit users.manage)
-- Résultats : no_account (aucun compte avec cet e-mail → création classique),
--             invited (invitation posée), linked (déjà membre : rôle ajouté).
-- -----------------------------------------------------------------------------
create or replace function public.link_existing_staff_account(p_staff_id uuid, p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      then 'Invitation envoyée au compte Neoscool existant de ' || v_staff.first_name || ' ' || v_staff.last_name
      else 'Compte Neoscool existant rattaché à ' || v_staff.first_name || ' ' || v_staff.last_name end,
    jsonb_build_object('membership_id', v_membership.id, 'role', v_role.key));
  return jsonb_build_object('result', case when v_membership.status = 'invited' then 'invited' else 'linked' end,
                            'membership_id', v_membership.id);
end;
$$;

-- Réponse de l'enseignant à une invitation (son propre compte uniquement).
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
    insert into public.teacher_extra_accesses (user_id, organization_id) values (auth.uid(), v_m.organization_id)
    on conflict (user_id, organization_id) do nothing;
  end if;
  perform app.audit(v_m.organization_id, 'membership.invitation_accepted', 'memberships', v_m.id,
    'Invitation acceptée : accès avec le compte Neoscool existant', jsonb_build_object('access_state', v_state));
  return jsonb_build_object('result', 'accepted', 'organization', v_org, 'organization_id', v_m.organization_id,
                            'access_state', v_state, 'payment_required', v_state in ('pending', 'expired'));
end;
$$;

-- -----------------------------------------------------------------------------
-- Vue de l'enseignant : ses établissements, invitations et accès supplémentaires.
-- (Un établissement bloqué n'est plus lisible par la RLS : son nom vient d'ici.)
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
          'period_end', a.period_end,
          'status_reason', a.status_reason
        ) as x
        from public.memberships m
        join public.organizations o on o.id = m.organization_id and o.status = 'active'
        left join public.profiles ip on ip.id = m.invited_by
        left join public.teacher_extra_accesses a on a.user_id = m.user_id and a.organization_id = m.organization_id
        where m.user_id = auth.uid() and m.status in ('active', 'invited')
      ) q
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('reference', t.internal_reference, 'organization_name', o.name,
                                          'amount', t.amount, 'currency', t.currency, 'status', t.status,
                                          'provider', t.provider, 'paid_at', t.paid_at, 'created_at', t.created_at,
                                          'covers_from', t.covers_from, 'covers_to', t.covers_to)
                       order by t.created_at desc)
      from (select * from public.teacher_access_payments where user_id = auth.uid() order by created_at desc limit 30) t
      join public.organizations o on o.id = t.organization_id
    ), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Paiement de l'accès supplémentaire par l'enseignant
-- -----------------------------------------------------------------------------
create or replace function app.teacher_access_extend(p_access uuid, p_months integer)
returns table (covers_from date, covers_to date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.teacher_extra_accesses;
  v_from date;
  v_to date;
begin
  select * into v_a from public.teacher_extra_accesses where id = p_access for update;
  -- Renouvellement anticipé : la nouvelle période suit la période en cours.
  v_from := case when v_a.period_end is not null and v_a.period_end >= current_date then v_a.period_end + 1 else current_date end;
  v_to := (v_from + make_interval(months => p_months))::date - 1;
  update public.teacher_extra_accesses
     set period_start = case when v_a.period_end is not null and v_a.period_end >= current_date then coalesce(period_start, v_from) else v_from end,
         period_end = v_to,
         status = case when status in ('suspended', 'exempt') then status else 'active' end,
         status_reason = case when status in ('suspended', 'exempt') then status_reason else null end,
         last_payment_at = now()
   where id = p_access;
  return query select v_from, v_to;
end;
$$;

create or replace function public.teacher_access_start_checkout(p_org uuid, p_provider text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_teacher_access_settings;
  v_m public.memberships;
  v_access public.teacher_extra_accesses;
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
  insert into public.teacher_extra_accesses (user_id, organization_id) values (auth.uid(), p_org)
  on conflict (user_id, organization_id) do nothing;
  select * into v_access from public.teacher_extra_accesses where user_id = auth.uid() and organization_id = p_org for update;
  if v_access.status = 'suspended' then
    raise exception 'Accès suspendu par l''administration Neoscool : contactez le support pour le rétablir.' using errcode = 'check_violation';
  end if;
  if v_access.status = 'exempt' then
    raise exception 'Votre accès à cet établissement est offert : aucun paiement n''est nécessaire.' using errcode = 'check_violation';
  end if;
  -- Les paiements commencés et jamais aboutis sont clos : un seul paiement en cours.
  update public.teacher_access_payments
     set status = 'CANCELLED', failure_reason = 'Remplacé par un nouveau paiement'
   where access_id = v_access.id and status in ('PENDING', 'PROCESSING') and provider = p_provider and mode = p_mode;
  insert into public.teacher_access_payments (access_id, user_id, organization_id, internal_reference, provider, mode,
                                              amount, currency, period_months, status, created_by)
  values (v_access.id, auth.uid(), p_org,
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          p_provider, p_mode, v_set.price, v_set.currency, v_set.period_months, 'PENDING', auth.uid())
  returning * into v_pay;
  select name into v_org from public.organizations where id = p_org;
  perform app.audit(p_org, 'teacher_access.checkout', 'teacher_access_payments', v_pay.id,
    'Paiement de l''accès enseignant supplémentaire commencé (' || v_pay.amount || ' ' || v_pay.currency || ')');
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'amount', v_pay.amount,
                            'currency', v_pay.currency, 'period_months', v_pay.period_months, 'organization_name', v_org);
end;
$$;

-- Service serveur uniquement (clé de service) : jamais appelable depuis le navigateur.
create or replace function public.teacher_access_attach_checkout(p_payment uuid, p_provider_tx text, p_checkout_url text, p_response jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.teacher_access_payments
     set provider_transaction_id = p_provider_tx, checkout_url = p_checkout_url, status = 'PROCESSING',
         provider_response = provider_response || jsonb_build_object('checkout', coalesce(p_response, '{}'::jsonb))
   where id = p_payment and status = 'PENDING';
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
  v_org text;
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
  select e.covers_from, e.covers_to into v_from, v_to from app.teacher_access_extend(v_pay.access_id, v_pay.period_months) e;
  update public.teacher_access_payments
     set status = 'SUCCESS', paid_at = now(), payment_method = left(coalesce(p_method, payment_method), 60),
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_tx),
         covers_from = v_from, covers_to = v_to, failure_reason = null,
         provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb))
   where id = v_pay.id;
  select name into v_org from public.organizations where id = v_pay.organization_id;
  perform app.audit(v_pay.organization_id, 'teacher_access.paid', 'teacher_access_payments', v_pay.id,
    'Accès enseignant supplémentaire payé et activé jusqu''au ' || to_char(v_to, 'DD/MM/YYYY'),
    jsonb_build_object('reference', v_pay.internal_reference, 'amount', v_pay.amount, 'user_id', v_pay.user_id));
  insert into public.notifications (organization_id, user_id, type, title, body, link, data)
  values (v_pay.organization_id, v_pay.user_id, 'teacher_access.paid', 'Accès à ' || v_org || ' activé',
          'Paiement confirmé (' || v_pay.amount || ' ' || v_pay.currency || '). Accès valable jusqu''au ' || to_char(v_to, 'DD/MM/YYYY') || '.',
          '/mes-etablissements', jsonb_build_object('reference', v_pay.internal_reference));
  return jsonb_build_object('result', 'confirmed', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id,
                            'covers_from', v_from, 'covers_to', v_to);
end;
$$;

create or replace function public.teacher_access_fail_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_status text, p_reason text, p_response jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.teacher_access_payments;
begin
  if p_status not in ('FAILED', 'CANCELLED') then
    raise exception 'Statut invalide.' using errcode = 'check_violation';
  end if;
  select * into v_pay from public.teacher_access_payments
   where provider = p_provider and mode = p_mode
     and (internal_reference = p_reference or (p_reference is null and provider_transaction_id = p_provider_tx))
   for update;
  if v_pay.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  if v_pay.status in ('SUCCESS', 'FAILED', 'CANCELLED') then
    return jsonb_build_object('result', 'duplicate', 'payment_id', v_pay.id);
  end if;
  update public.teacher_access_payments
     set status = p_status, failure_reason = left(p_reason, 300),
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_tx),
         provider_response = provider_response || jsonb_build_object('failure', coalesce(p_response, '{}'::jsonb))
   where id = v_pay.id;
  return jsonb_build_object('result', lower(p_status), 'payment_id', v_pay.id, 'organization_id', v_pay.organization_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Console Super Admin
-- -----------------------------------------------------------------------------
create or replace function public.platform_save_teacher_access_settings(
  p_enabled boolean, p_price integer, p_currency text, p_period_months integer, p_grace_days integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.platform_teacher_access_settings;
  v_new public.platform_teacher_access_settings;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_price is null or p_price < 0 or p_price > 100000000 then
    raise exception 'Prix invalide.' using errcode = 'check_violation';
  end if;
  if p_enabled and p_price = 0 then
    raise exception 'Définissez un prix supérieur à 0 avant d''activer la règle.' using errcode = 'check_violation';
  end if;
  if p_period_months not in (1, 3, 6, 12) then
    raise exception 'Périodicité invalide (1, 3, 6 ou 12 mois).' using errcode = 'check_violation';
  end if;
  if p_grace_days is null or p_grace_days not between 0 and 60 then
    raise exception 'Délai de grâce invalide (0 à 60 jours).' using errcode = 'check_violation';
  end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'Devise invalide.' using errcode = 'check_violation';
  end if;
  select * into v_old from public.platform_teacher_access_settings where id = 1 for update;
  update public.platform_teacher_access_settings
     set enabled = p_enabled, price = p_price, currency = p_currency, period_months = p_period_months,
         grace_days = p_grace_days, updated_by = auth.uid(), updated_at = now()
   where id = 1
  returning * into v_new;
  insert into public.platform_teacher_access_settings_history (enabled, price, currency, period_months, grace_days, changed_by)
  values (p_enabled, p_price, p_currency, p_period_months, p_grace_days, auth.uid());
  perform app.audit(null, 'platform.teacher_access_settings', 'platform_teacher_access_settings', null,
    'Abonnement enseignant supplémentaire ' || case when p_enabled then 'activé' else 'désactivé' end
      || ' : ' || p_price || ' ' || p_currency || ' / ' || p_period_months || ' mois',
    jsonb_build_object('before', to_jsonb(v_old) - 'updated_by' - 'updated_at', 'after', to_jsonb(v_new) - 'updated_by' - 'updated_at'));
  return to_jsonb(v_new) - 'updated_by';
end;
$$;

-- Enseignants concernés : toute adhésion supplémentaire d'enseignant, et tout
-- accès déjà enregistré (même si l'enseignant a quitté l'un des établissements).
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
    select jsonb_agg(x order by x ->> 'teacher_name', x ->> 'organization_name')
    from (
      select jsonb_build_object(
        'user_id', c.user_id,
        'organization_id', c.organization_id,
        'teacher_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
        'email', p.email,
        'organization_name', o.name,
        'other_organizations', coalesce((
          select jsonb_agg(o2.name order by m2.created_at)
          from public.memberships m2 join public.organizations o2 on o2.id = m2.organization_id
          where m2.user_id = c.user_id and m2.organization_id <> c.organization_id and m2.status = 'active'), '[]'::jsonb),
        'membership_status', m.status,
        'access_status', a.status,
        'access_state', case when m.id is not null and m.status = 'active' then app.teacher_access_state(m.id) else 'no_membership' end,
        'period_start', a.period_start,
        'period_end', a.period_end,
        'status_reason', a.status_reason,
        'last_payment', (select jsonb_build_object('reference', t.internal_reference, 'amount', t.amount, 'currency', t.currency,
                                                   'status', t.status, 'provider', t.provider, 'at', coalesce(t.paid_at, t.created_at))
                           from public.teacher_access_payments t
                          where t.user_id = c.user_id and t.organization_id = c.organization_id
                          order by t.created_at desc limit 1),
        'paid_total', (select coalesce(sum(t.amount), 0) from public.teacher_access_payments t
                        where t.user_id = c.user_id and t.organization_id = c.organization_id and t.status = 'SUCCESS')
      ) as x
      from (
        select m.user_id, m.organization_id from public.memberships m
         where m.status = 'active' and app.is_extra_teacher_membership(m.id)
        union
        select a.user_id, a.organization_id from public.teacher_extra_accesses a
      ) c
      join public.profiles p on p.id = c.user_id
      join public.organizations o on o.id = c.organization_id
      left join public.memberships m on m.user_id = c.user_id and m.organization_id = c.organization_id
      left join public.teacher_extra_accesses a on a.user_id = c.user_id and a.organization_id = c.organization_id
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_teacher_access_payments(p_limit integer default 100)
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
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'reference', t.internal_reference, 'user_id', t.user_id, 'organization_id', t.organization_id,
      'teacher_name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'email', p.email,
      'organization_name', o.name, 'amount', t.amount, 'currency', t.currency, 'status', t.status,
      'provider', t.provider, 'mode', t.mode, 'method', t.payment_method, 'paid_at', t.paid_at, 'created_at', t.created_at,
      'covers_from', t.covers_from, 'covers_to', t.covers_to, 'failure_reason', t.failure_reason, 'note', t.note
    ) order by t.created_at desc)
    from (select * from public.teacher_access_payments order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) t
    join public.profiles p on p.id = t.user_id
    join public.organizations o on o.id = t.organization_id
  ), '[]'::jsonb);
end;
$$;

-- Paiement reçu hors ligne (espèces, virement…) : validé par la plateforme.
create or replace function public.platform_teacher_access_record_payment(
  p_user uuid, p_org uuid, p_amount integer, p_reference text, p_method text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_teacher_access_settings;
  v_access public.teacher_extra_accesses;
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
  insert into public.teacher_extra_accesses (user_id, organization_id) values (p_user, p_org)
  on conflict (user_id, organization_id) do nothing;
  select * into v_access from public.teacher_extra_accesses where user_id = p_user and organization_id = p_org for update;
  select e.covers_from, e.covers_to into v_from, v_to from app.teacher_access_extend(v_access.id, v_set.period_months) e;
  insert into public.teacher_access_payments (access_id, user_id, organization_id, internal_reference, provider, mode,
                                              provider_transaction_id, amount, currency, period_months, status, payment_method,
                                              note, paid_at, covers_from, covers_to, created_by, confirmed_by, provider_response)
  values (v_access.id, p_user, p_org,
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          'manual', 'live', left(btrim(p_reference), 120), p_amount, v_set.currency, v_set.period_months, 'SUCCESS',
          left(coalesce(nullif(btrim(p_method), ''), 'manuel'), 60), left(p_note, 500), now(), v_from, v_to, auth.uid(), auth.uid(),
          jsonb_build_object('manual', true))
  returning * into v_pay;
  perform app.audit(p_org, 'teacher_access.manual_payment', 'teacher_access_payments', v_pay.id,
    'Paiement manuel de l''accès enseignant supplémentaire validé par la plateforme (' || p_amount || ' ' || v_set.currency || ')',
    jsonb_build_object('user_id', p_user, 'reference', v_pay.internal_reference));
  insert into public.notifications (organization_id, user_id, type, title, body, link)
  select p_org, p_user, 'teacher_access.paid', 'Accès à ' || o.name || ' activé',
         'Paiement enregistré par Neoscool. Accès valable jusqu''au ' || to_char(v_to, 'DD/MM/YYYY') || '.', '/mes-etablissements'
  from public.organizations o where o.id = p_org;
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'covers_from', v_from, 'covers_to', v_to);
end;
$$;

-- Activer / suspendre / rétablir / offrir l'accès. Jamais de suppression de compte.
create or replace function public.platform_teacher_access_set_status(p_user uuid, p_org uuid, p_action text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access public.teacher_extra_accesses;
  v_status text;
  v_label text;
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
  if not exists (select 1 from public.memberships where user_id = p_user and organization_id = p_org) then
    raise exception 'Cet enseignant n''est pas rattaché à cet établissement.' using errcode = 'no_data_found';
  end if;
  insert into public.teacher_extra_accesses (user_id, organization_id) values (p_user, p_org)
  on conflict (user_id, organization_id) do nothing;
  select * into v_access from public.teacher_extra_accesses where user_id = p_user and organization_id = p_org for update;
  v_status := case p_action
    when 'suspend' then 'suspended'
    when 'exempt' then 'exempt'
    -- Rétablir / retirer l'offre : l'accès suit alors le paiement (période payée en cours ou non).
    else case when v_access.period_end is not null and v_access.period_end >= current_date then 'active' else 'pending' end
  end;
  if p_action = 'restore' and v_access.status <> 'suspended' then
    raise exception 'Cet accès n''est pas suspendu.' using errcode = 'check_violation';
  end if;
  if p_action = 'remove_exemption' and v_access.status <> 'exempt' then
    raise exception 'Cet accès n''est pas offert.' using errcode = 'check_violation';
  end if;
  update public.teacher_extra_accesses
     set status = v_status, status_reason = left(btrim(p_reason), 500), updated_by = auth.uid()
   where id = v_access.id;
  v_label := case p_action when 'suspend' then 'suspendu' when 'exempt' then 'offert' when 'restore' then 'rétabli' else 'soumis au paiement' end;
  perform app.audit(p_org, 'teacher_access.' || p_action, 'teacher_extra_accesses', v_access.id,
    'Accès enseignant supplémentaire ' || v_label || ' par la plateforme', jsonb_build_object('user_id', p_user, 'reason', left(btrim(p_reason), 500), 'status', v_status));
  insert into public.notifications (organization_id, user_id, type, title, body, link)
  select p_org, p_user, 'teacher_access.status', 'Accès à ' || o.name || ' ' || v_label,
         'Motif : ' || left(btrim(p_reason), 200) || '. Votre compte Neoscool et vos autres établissements ne sont pas concernés.', '/mes-etablissements'
  from public.organizations o where o.id = p_org;
  return jsonb_build_object('status', v_status, 'state',
    (select app.teacher_access_state(m.id) from public.memberships m where m.user_id = p_user and m.organization_id = p_org));
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke all on function
  app.is_extra_teacher_membership(uuid), app.teacher_access_state(uuid), app.teacher_access_blocked(uuid),
  app.teacher_access_extend(uuid, integer)
  from public, anon;
grant execute on function app.is_extra_teacher_membership(uuid), app.teacher_access_state(uuid), app.teacher_access_blocked(uuid)
  to authenticated, service_role;
grant execute on function app.teacher_access_extend(uuid, integer) to service_role;

revoke all on function
  public.link_existing_staff_account(uuid, uuid), public.respond_membership_invitation(uuid, boolean),
  public.my_organization_accesses(), public.teacher_access_start_checkout(uuid, text, text),
  public.teacher_access_attach_checkout(uuid, text, text, jsonb),
  public.teacher_access_confirm_payment(text, text, text, text, integer, text, text, jsonb),
  public.teacher_access_fail_payment(text, text, text, text, text, text, jsonb),
  public.platform_save_teacher_access_settings(boolean, integer, text, integer, integer),
  public.platform_teacher_accesses(), public.platform_teacher_access_payments(integer),
  public.platform_teacher_access_record_payment(uuid, uuid, integer, text, text, text),
  public.platform_teacher_access_set_status(uuid, uuid, text, text)
  from public, anon;
grant execute on function
  public.link_existing_staff_account(uuid, uuid), public.respond_membership_invitation(uuid, boolean),
  public.my_organization_accesses(), public.teacher_access_start_checkout(uuid, text, text),
  public.platform_save_teacher_access_settings(boolean, integer, text, integer, integer),
  public.platform_teacher_accesses(), public.platform_teacher_access_payments(integer),
  public.platform_teacher_access_record_payment(uuid, uuid, integer, text, text, text),
  public.platform_teacher_access_set_status(uuid, uuid, text, text)
  to authenticated;
-- Confirmation / échec / rattachement du fournisseur : serveur uniquement
-- (les droits par défaut du schéma sont retirés explicitement).
revoke all on function
  app.teacher_access_extend(uuid, integer),
  public.teacher_access_attach_checkout(uuid, text, text, jsonb),
  public.teacher_access_confirm_payment(text, text, text, text, integer, text, text, jsonb),
  public.teacher_access_fail_payment(text, text, text, text, text, text, jsonb)
  from authenticated;
grant execute on function
  public.teacher_access_attach_checkout(uuid, text, text, jsonb),
  public.teacher_access_confirm_payment(text, text, text, text, integer, text, text, jsonb),
  public.teacher_access_fail_payment(text, text, text, text, text, text, jsonb)
  to service_role;

grant select on public.platform_teacher_access_settings, public.platform_teacher_access_settings_history,
  public.teacher_extra_accesses, public.teacher_access_payments to authenticated;
