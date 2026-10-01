-- =============================================================================
-- PAIEMENTS EN LIGNE DES FAMILLES (multi-établissements, multi-agrégateurs)
--
-- Super Admin (interrupteur global) → établissement (interrupteur + un ou
-- plusieurs fournisseurs, sans limite) → portail parent → transaction NeoScool →
-- confirmation SERVEUR (notification + vérification auprès du fournisseur) →
-- écriture comptable automatique (table payments : reçu numéroté, solde de la
-- facture et des échéances mis à jour, famille notifiée) → comptables notifiés →
-- historique et audit.
--
-- * Aucune liste fixe de fournisseurs : chaque fournisseur d'établissement est
--   une ligne (adapter + configuration + clés chiffrées par le serveur).
-- * Désactiver (globalement ou pour un établissement) ne supprime rien :
--   configurations, clés, transactions et reçus sont conservés.
-- * Toute la logique de montant, devise, établissement, référence, doublons et
--   statut est appliquée ici, en base ; le navigateur n'en décide jamais.
-- * Aucune donnée existante n'est modifiée.
-- =============================================================================

insert into public.permissions (code, module, label, sort_order) values
  ('finance.online.manage', 'finance', 'Configurer les paiements en ligne (fournisseurs, activation)', 47);
insert into public.role_permissions (role_id, permission_code)
select r.id, 'finance.online.manage' from public.roles r where r.key in ('org_admin', 'director')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Interrupteur global (Super Admin)
-- -----------------------------------------------------------------------------
create table public.platform_payment_settings (
  id smallint primary key default 1 check (id = 1),
  school_payments_enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_payment_settings (id) values (1);
alter table public.platform_payment_settings enable row level security;
create policy platform_payment_settings_read on public.platform_payment_settings for select to authenticated using (true);
revoke all on public.platform_payment_settings from anon, authenticated;
grant select on public.platform_payment_settings to authenticated;
grant all on public.platform_payment_settings to service_role;

-- -----------------------------------------------------------------------------
-- Réglage de l'établissement
-- -----------------------------------------------------------------------------
create table public.org_payment_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  online_enabled boolean not null default false,
  allow_partial boolean not null default false,
  min_partial_amount numeric(14, 2) not null default 0 check (min_partial_amount >= 0),
  pending_minutes integer not null default 60 check (pending_minutes between 10 and 1440),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.org_payment_settings enable row level security;
create policy org_payment_settings_read on public.org_payment_settings for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
revoke all on public.org_payment_settings from anon, authenticated;
grant select on public.org_payment_settings to authenticated;
grant all on public.org_payment_settings to service_role;

-- -----------------------------------------------------------------------------
-- Fournisseurs de l'établissement (autant que souhaité)
-- -----------------------------------------------------------------------------
create table public.org_payment_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  adapter text not null check (adapter ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (char_length(btrim(label)) between 2 and 60),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  methods text[] not null default array['mobile_money'] check (cardinality(methods) between 1 and 4 and methods <@ array['mobile_money', 'card', 'bank_transfer', 'other']),
  mode text not null default 'test' check (mode in ('test', 'live')),
  is_active boolean not null default false,
  is_default boolean not null default false,
  priority integer not null default 100 check (priority between 0 and 9999),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and length(config::text) <= 4000),
  custom_definition jsonb check (custom_definition is null or (jsonb_typeof(custom_definition) = 'object' and length(custom_definition::text) <= 20000)),
  secret_ciphertext text,
  secret_hint text check (secret_hint is null or char_length(secret_hint) <= 40),
  webhook_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 500),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (adapter <> 'mock' or mode = 'test'),
  check (archived_at is null or not is_active)
);
create unique index org_payment_providers_one_default on public.org_payment_providers (organization_id) where is_default and archived_at is null;
create index org_payment_providers_org_idx on public.org_payment_providers (organization_id, priority);
comment on column public.org_payment_providers.secret_ciphertext is
  'Clés (JSON) chiffrées par le serveur (AES-256-GCM). Jamais lisibles par le navigateur.';
alter table public.org_payment_providers enable row level security;
create policy org_payment_providers_read on public.org_payment_providers for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.online.manage'))::uuid[])
      or organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[]));
revoke all on public.org_payment_providers from anon, authenticated;
grant select (id, organization_id, adapter, label, country, currency, methods, mode, is_active, is_default, priority, config,
              custom_definition, secret_hint, webhook_token, last_test_at, last_test_ok, last_test_message, archived_at,
              created_at, updated_at) on public.org_payment_providers to authenticated;
grant all on public.org_payment_providers to service_role;

-- -----------------------------------------------------------------------------
-- Transactions, événements, notifications reçues, remboursements
-- -----------------------------------------------------------------------------
create sequence public.fee_payment_ref_seq start 50000001;
grant usage on sequence public.fee_payment_ref_seq to service_role;

create table public.fee_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  internal_reference text not null unique check (internal_reference ~ '^NEO-[0-9]{4}-[0-9]{6,}$'),
  invoice_id uuid not null,
  installment_id uuid references public.installments (id) on delete set null,
  student_id uuid not null,
  payer_user_id uuid references public.profiles (id) on delete set null,
  guardian_id uuid references public.guardians (id) on delete set null,
  provider_id uuid not null,
  adapter text not null,
  provider_label text not null,
  mode text not null check (mode in ('test', 'live')),
  method text not null check (method in ('mobile_money', 'card', 'bank_transfer', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  purpose text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  provider_transaction_id text,
  checkout_url text,
  payment_id uuid,
  refunded_amount numeric(14, 2) not null default 0 check (refunded_amount >= 0),
  needs_review boolean not null default false,
  review_reason text,
  failure_reason text,
  provider_response jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (provider_id, provider_transaction_id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, provider_id) references public.org_payment_providers (organization_id, id) on delete restrict,
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete restrict,
  check (refunded_amount <= amount)
);
create index fee_payment_transactions_org_idx on public.fee_payment_transactions (organization_id, created_at desc);
create index fee_payment_transactions_invoice_idx on public.fee_payment_transactions (invoice_id) where status in ('PENDING', 'PROCESSING');
create index fee_payment_transactions_student_idx on public.fee_payment_transactions (student_id);
alter table public.fee_payment_transactions enable row level security;
create policy fee_payment_transactions_read on public.fee_payment_transactions for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
      or student_id = any ((select app.my_portal_student_ids())::uuid[]));
revoke all on public.fee_payment_transactions from anon, authenticated;
grant select (id, organization_id, internal_reference, invoice_id, installment_id, student_id, payer_user_id, guardian_id, provider_id,
              adapter, provider_label, mode, method, amount, currency, purpose, status, provider_transaction_id, payment_id,
              refunded_amount, needs_review, review_reason, failure_reason, expires_at, confirmed_at, created_at, updated_at)
  on public.fee_payment_transactions to authenticated;
grant all on public.fee_payment_transactions to service_role;

create table public.fee_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid references public.fee_payment_transactions (id) on delete cascade,
  provider_id uuid references public.org_payment_providers (id) on delete set null,
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index fee_payment_events_org_idx on public.fee_payment_events (organization_id, created_at desc);
create index fee_payment_events_tx_idx on public.fee_payment_events (transaction_id, created_at);
alter table public.fee_payment_events enable row level security;
create policy fee_payment_events_read on public.fee_payment_events for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
      or organization_id = any ((select app.permitted_org_ids('finance.online.manage'))::uuid[]));
revoke all on public.fee_payment_events from anon, authenticated;
grant select on public.fee_payment_events to authenticated;
grant all on public.fee_payment_events to service_role;

create table public.fee_payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider_id uuid not null references public.org_payment_providers (id) on delete cascade,
  received_at timestamptz not null default now(),
  ip text,
  payload jsonb not null default '{}'::jsonb,
  provider_transaction_id text,
  transaction_id uuid references public.fee_payment_transactions (id) on delete set null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'duplicate', 'ignored', 'rejected', 'error')),
  error text
);
create index fee_payment_webhooks_org_idx on public.fee_payment_webhooks (organization_id, received_at desc);
alter table public.fee_payment_webhooks enable row level security;
create policy fee_payment_webhooks_read on public.fee_payment_webhooks for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.online.manage'))::uuid[])
      or organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[]));
revoke all on public.fee_payment_webhooks from anon, authenticated;
grant select on public.fee_payment_webhooks to authenticated;
grant all on public.fee_payment_webhooks to service_role;

create table public.fee_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null references public.fee_payment_transactions (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  mode text not null default 'manual' check (mode in ('manual', 'automatic')),
  status text not null default 'requested' check (status in ('requested', 'completed', 'rejected', 'failed')),
  external_reference text check (external_reference is null or char_length(external_reference) <= 120),
  note text check (note is null or char_length(note) <= 500),
  cancelled_payment_id uuid references public.payments (id) on delete set null,
  replacement_payment_id uuid references public.payments (id) on delete set null,
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_by uuid references auth.users (id) on delete set null,
  processed_at timestamptz
);
create index fee_payment_refunds_org_idx on public.fee_payment_refunds (organization_id, requested_at desc);
alter table public.fee_payment_refunds enable row level security;
create policy fee_payment_refunds_read on public.fee_payment_refunds for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[]));
revoke all on public.fee_payment_refunds from anon, authenticated;
grant select on public.fee_payment_refunds to authenticated;
grant all on public.fee_payment_refunds to service_role;

-- -----------------------------------------------------------------------------
-- Correctif : l'annulation d'un paiement (et l'archivage d'une dépense annulée)
-- échouait toujours, la colonne calculée search_text n'étant recalculée qu'après
-- les déclencheurs BEFORE. Même logique qu'avant, colonne calculée ignorée.
-- -----------------------------------------------------------------------------
create or replace function app.payment_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_paid numeric;
  v_allow_over boolean;
begin
  if tg_op = 'INSERT' then
    select * into v_invoice from public.invoices where id = new.invoice_id for update;
    if v_invoice.status <> 'issued' then
      raise exception 'Les paiements ne sont possibles que sur une facture émise.' using errcode = 'check_violation';
    end if;
    select coalesce((settings #>> '{finance,allow_overpayment}')::boolean, false)
      into v_allow_over from public.organizations where id = new.organization_id;
    v_paid := app.invoice_paid_amount(new.invoice_id);
    if not v_allow_over and new.amount > v_invoice.total - v_paid then
      raise exception 'Le montant (%) dépasse le reliquat (%).', new.amount, v_invoice.total - v_paid using errcode = 'check_violation';
    end if;
    new.number := app.generate_number(new.organization_id, 'payment', 'REC-{CODE}-{YY}-{SEQ:6}');
    new.student_id := v_invoice.student_id;
    new.status := 'completed';
    new.balance_after := v_invoice.total - v_paid - new.amount;
    new.received_by := coalesce(auth.uid(), new.received_by);
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into new.received_by_name from public.profiles where id = new.received_by;
    return new;
  end if;

  -- Mise à jour : seule l'annulation (avec motif) est autorisée.
  if old.status = 'cancelled' then
    raise exception 'Un paiement annulé ne peut plus être modifié.' using errcode = 'check_violation';
  end if;
  -- search_text est une colonne calculée : PostgreSQL ne la recalcule qu'après ce déclencheur.
  if (to_jsonb(new) - array['status', 'cancelled_reason', 'cancelled_at', 'cancelled_by', 'notes', 'search_text'])
     is distinct from (to_jsonb(old) - array['status', 'cancelled_reason', 'cancelled_at', 'cancelled_by', 'notes', 'search_text']) then
    raise exception 'Un paiement enregistré ne peut pas être modifié ; annulez-le puis ressaisissez-le.' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'finance.payments.cancel') then
      raise exception 'L''annulation nécessite la permission finance.payments.cancel.' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(btrim(new.cancelled_reason), '') = '' then
      raise exception 'Le motif d''annulation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function app.expense_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'expense', 'DEP-{CODE}-{YY}-{SEQ:5}');
    new.status := 'recorded';
    return new;
  end if;
  if new.number is distinct from old.number or new.organization_id is distinct from old.organization_id then
    raise exception 'Le numéro d''une dépense ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  if old.status = 'cancelled' and (to_jsonb(new) - array['archived_at', 'archived_by', 'updated_at', 'search_text'])
                                   is distinct from (to_jsonb(old) - array['archived_at', 'archived_by', 'updated_at', 'search_text']) then
    raise exception 'Une dépense annulée ne peut plus être modifiée.' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' and old.status = 'recorded' then
    if coalesce(btrim(new.cancelled_reason), '') = '' then
      raise exception 'Le motif d''annulation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Outils internes
-- -----------------------------------------------------------------------------
create or replace function app.fee_payments_open(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select school_payments_enabled from public.platform_payment_settings where id = 1), false)
     and coalesce((select online_enabled from public.org_payment_settings where organization_id = p_org), false);
$$;

create or replace function app.fee_event(p_org uuid, p_tx uuid, p_provider uuid, p_kind text, p_summary text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.fee_payment_events (organization_id, transaction_id, provider_id, kind, summary, detail)
  values (p_org, p_tx, p_provider, p_kind, left(p_summary, 500), coalesce(p_detail, '{}'::jsonb));
$$;

-- Comptes actifs de l'établissement disposant d'une permission (notifications internes).
create or replace function app.org_users_with_permission(p_org uuid, p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.user_id
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id and mr.organization_id = m.organization_id
    join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = p_permission
   where m.organization_id = p_org and m.status = 'active';
$$;

create or replace function app.fee_amount_text(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_amount, 'FM999G999G999G990') || ' ' || case when p_currency in ('XOF', 'XAF') then 'F CFA' else p_currency end;
$$;

-- -----------------------------------------------------------------------------
-- Super Admin
-- -----------------------------------------------------------------------------
create or replace function public.platform_set_school_payments(p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_payment_settings set school_payments_enabled = p_enabled, updated_by = auth.uid(), updated_at = now() where id = 1;
  perform app.audit(null, 'platform.school_payments', 'platform_payment_settings', null,
    case when p_enabled then 'Paiements en ligne des familles activés (global)' else 'Paiements en ligne des familles désactivés (global) — configurations conservées' end,
    jsonb_build_object('enabled', p_enabled), 'success');
end;
$$;

-- -----------------------------------------------------------------------------
-- Établissement : réglages et fournisseurs
-- -----------------------------------------------------------------------------
create or replace function public.org_save_payment_settings(p_org uuid, p_enabled boolean, p_allow_partial boolean, p_min_partial numeric, p_pending_minutes integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'finance.online.manage') then
    raise exception 'Permission refusée.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_min_partial, 0) < 0 or coalesce(p_pending_minutes, 60) not between 10 and 1440 then
    raise exception 'Réglages invalides.' using errcode = 'check_violation';
  end if;
  insert into public.org_payment_settings (organization_id, online_enabled, allow_partial, min_partial_amount, pending_minutes, updated_by, updated_at)
  values (p_org, p_enabled, p_allow_partial, coalesce(p_min_partial, 0), coalesce(p_pending_minutes, 60), auth.uid(), now())
  on conflict (organization_id) do update set
    online_enabled = excluded.online_enabled, allow_partial = excluded.allow_partial, min_partial_amount = excluded.min_partial_amount,
    pending_minutes = excluded.pending_minutes, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(p_org, 'finance.online_settings', 'org_payment_settings', p_org,
    case when p_enabled then 'Paiements en ligne activés pour l''établissement' else 'Paiements en ligne désactivés pour l''établissement (configurations conservées)' end,
    jsonb_build_object('enabled', p_enabled, 'allow_partial', p_allow_partial, 'min_partial', p_min_partial, 'pending_minutes', p_pending_minutes), 'success');
end;
$$;

create or replace function public.org_save_payment_provider(
  p_org uuid, p_id uuid, p_adapter text, p_label text, p_country text, p_currency text, p_methods text[], p_mode text,
  p_config jsonb, p_custom_definition jsonb, p_secret_ciphertext text default null, p_secret_hint text default null, p_clear_secret boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.org_payment_providers;
  v_id uuid;
  v_changed boolean;
begin
  if not app.has_permission(p_org, 'finance.online.manage') then
    raise exception 'Permission refusée.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_adapter, '') !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'Type de fournisseur invalide.' using errcode = 'check_violation';
  end if;
  if p_adapter = 'mock' and p_mode <> 'test' then
    raise exception 'Le fournisseur de test ne fonctionne qu''en mode TEST (aucun argent réel).' using errcode = 'check_violation';
  end if;
  if p_adapter = 'custom' and p_custom_definition is null then
    raise exception 'Décrivez l''API du fournisseur personnalisé.' using errcode = 'check_violation';
  end if;
  if p_secret_ciphertext is not null and p_secret_ciphertext !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'Les clés doivent être chiffrées par le serveur.' using errcode = 'invalid_parameter_value';
  end if;
  if p_id is null then
    insert into public.org_payment_providers (organization_id, adapter, label, country, currency, methods, mode, config, custom_definition,
                                              secret_ciphertext, secret_hint, created_by, updated_by)
    values (p_org, p_adapter, btrim(p_label), nullif(upper(btrim(coalesce(p_country, ''))), ''), upper(p_currency), p_methods, p_mode,
            coalesce(p_config, '{}'::jsonb), case when p_adapter = 'custom' then p_custom_definition end,
            case when p_clear_secret then null else p_secret_ciphertext end, case when p_clear_secret then null else p_secret_hint end,
            auth.uid(), auth.uid())
    returning id into v_id;
    perform app.fee_event(p_org, null, v_id, 'provider_created', 'Fournisseur ajouté : ' || btrim(p_label), jsonb_build_object('adapter', p_adapter, 'mode', p_mode));
    perform app.audit(p_org, 'finance.online_provider_created', 'org_payment_providers', v_id, 'Fournisseur de paiement ajouté : ' || btrim(p_label),
      jsonb_build_object('adapter', p_adapter, 'mode', p_mode, 'secret_set', p_secret_ciphertext is not null), 'success');
    return v_id;
  end if;

  select * into v_row from public.org_payment_providers where id = p_id and organization_id = p_org for update;
  if v_row.id is null then
    raise exception 'Fournisseur introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  if v_row.archived_at is not null then
    raise exception 'Ce fournisseur est archivé.' using errcode = 'check_violation';
  end if;
  v_changed := p_adapter <> v_row.adapter or p_mode <> v_row.mode or coalesce(p_config, '{}'::jsonb) is distinct from v_row.config
            or (p_adapter = 'custom' and p_custom_definition is distinct from v_row.custom_definition)
            or p_secret_ciphertext is not null or p_clear_secret;
  update public.org_payment_providers set
    adapter = p_adapter, label = btrim(p_label), country = nullif(upper(btrim(coalesce(p_country, ''))), ''), currency = upper(p_currency),
    methods = p_methods, mode = p_mode, config = coalesce(p_config, '{}'::jsonb),
    custom_definition = case when p_adapter = 'custom' then p_custom_definition end,
    secret_ciphertext = case when p_clear_secret then null else coalesce(p_secret_ciphertext, secret_ciphertext) end,
    secret_hint = case when p_clear_secret then null when p_secret_ciphertext is not null then p_secret_hint else secret_hint end,
    -- Identifiants changés : le dernier test n'est plus valable, le fournisseur est retiré des moyens proposés.
    is_active = case when v_changed then false else is_active end,
    is_default = case when v_changed then false else is_default end,
    last_test_at = case when v_changed then null else last_test_at end,
    last_test_ok = case when v_changed then null else last_test_ok end,
    last_test_message = case when v_changed then null else last_test_message end,
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  perform app.fee_event(p_org, null, p_id, 'provider_updated', 'Fournisseur modifié : ' || btrim(p_label) || case when v_changed then ' (identifiants modifiés : à retester puis réactiver)' else '' end,
    jsonb_build_object('credentials_changed', v_changed));
  perform app.audit(p_org, 'finance.online_provider_updated', 'org_payment_providers', p_id, 'Fournisseur de paiement modifié : ' || btrim(p_label),
    jsonb_build_object('credentials_changed', v_changed, 'secret_changed', p_secret_ciphertext is not null or p_clear_secret), 'success');
  return p_id;
end;
$$;

create or replace function public.org_set_payment_provider_state(p_provider uuid, p_active boolean, p_default boolean, p_priority integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.org_payment_providers;
begin
  select * into v_row from public.org_payment_providers where id = p_provider for update;
  if v_row.id is null or not app.has_permission(v_row.organization_id, 'finance.online.manage') then
    raise exception 'Fournisseur introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_row.archived_at is not null and p_active then
    raise exception 'Ce fournisseur est archivé.' using errcode = 'check_violation';
  end if;
  if p_active and v_row.adapter not in ('mock') and v_row.secret_ciphertext is null then
    raise exception 'Renseignez les clés de ce fournisseur avant de l''activer.' using errcode = 'check_violation';
  end if;
  if p_active and v_row.adapter = 'custom' and not coalesce(v_row.last_test_ok, false) then
    raise exception 'Testez d''abord la connexion (fournisseur personnalisé : test réussi obligatoire).' using errcode = 'check_violation';
  end if;
  if p_default and not p_active then
    raise exception 'Seul un fournisseur actif peut être le fournisseur par défaut.' using errcode = 'check_violation';
  end if;
  if p_default then
    update public.org_payment_providers set is_default = false where organization_id = v_row.organization_id and is_default and id <> p_provider;
  end if;
  update public.org_payment_providers
     set is_active = p_active, is_default = p_default, priority = coalesce(p_priority, priority), updated_by = auth.uid(), updated_at = now()
   where id = p_provider;
  perform app.fee_event(v_row.organization_id, null, p_provider, case when p_active then 'provider_enabled' else 'provider_disabled' end,
    v_row.label || case when p_active then ' activé' else ' désactivé' end || case when p_default then ' (par défaut)' else '' end,
    jsonb_build_object('active', p_active, 'default', p_default, 'priority', p_priority));
  perform app.audit(v_row.organization_id, 'finance.online_provider_state', 'org_payment_providers', p_provider,
    'Fournisseur ' || v_row.label || case when p_active then ' activé' else ' désactivé' end, jsonb_build_object('active', p_active, 'default', p_default), 'success');
end;
$$;

create or replace function public.org_archive_payment_provider(p_provider uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.org_payment_providers;
begin
  select * into v_row from public.org_payment_providers where id = p_provider for update;
  if v_row.id is null or not app.has_permission(v_row.organization_id, 'finance.online.manage') then
    raise exception 'Fournisseur introuvable.' using errcode = 'insufficient_privilege';
  end if;
  update public.org_payment_providers set is_active = false, is_default = false, archived_at = now(), updated_by = auth.uid(), updated_at = now() where id = p_provider;
  perform app.fee_event(v_row.organization_id, null, p_provider, 'provider_archived', 'Fournisseur archivé : ' || v_row.label || ' (transactions conservées)');
  perform app.audit(v_row.organization_id, 'finance.online_provider_archived', 'org_payment_providers', p_provider, 'Fournisseur archivé : ' || v_row.label, '{}'::jsonb, 'success');
end;
$$;

create or replace function public.org_record_payment_provider_test(p_provider uuid, p_ok boolean, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.org_payment_providers;
begin
  select * into v_row from public.org_payment_providers where id = p_provider;
  if v_row.id is null or not app.has_permission(v_row.organization_id, 'finance.online.manage') then
    raise exception 'Fournisseur introuvable.' using errcode = 'insufficient_privilege';
  end if;
  update public.org_payment_providers set last_test_at = now(), last_test_ok = p_ok, last_test_message = left(coalesce(p_message, ''), 500) where id = p_provider;
  perform app.fee_event(v_row.organization_id, null, p_provider, 'provider_tested', 'Test de connexion ' || v_row.label || ' : ' || case when p_ok then 'réussi' else 'échec' end,
    jsonb_build_object('ok', p_ok, 'message', left(coalesce(p_message, ''), 300)));
end;
$$;

-- Ce que voit la famille : état et moyens de paiement proposés (sans aucune configuration).
create or replace function public.fee_payment_options(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_global boolean;
  v_settings public.org_payment_settings;
begin
  if not (p_org = any (app.member_org_ids())) then
    raise exception 'Permission refusée.' using errcode = 'insufficient_privilege';
  end if;
  select school_payments_enabled into v_global from public.platform_payment_settings where id = 1;
  select * into v_settings from public.org_payment_settings where organization_id = p_org;
  return jsonb_build_object(
    'global_enabled', coalesce(v_global, false),
    'org_enabled', coalesce(v_settings.online_enabled, false),
    'open', coalesce(v_global, false) and coalesce(v_settings.online_enabled, false),
    'allow_partial', coalesce(v_settings.allow_partial, false),
    'min_partial', coalesce(v_settings.min_partial_amount, 0),
    'providers', case when coalesce(v_global, false) and coalesce(v_settings.online_enabled, false) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'methods', p.methods, 'mode', p.mode, 'currency', p.currency, 'is_default', p.is_default)
                       order by p.is_default desc, p.priority, p.label)
        from public.org_payment_providers p
       where p.organization_id = p_org and p.is_active and p.archived_at is null), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Parent : création de la transaction (montant calculé ici, jamais par le navigateur)
-- -----------------------------------------------------------------------------
create or replace function public.fee_payment_start(p_invoice uuid, p_installment uuid, p_amount numeric, p_provider uuid, p_method text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_provider public.org_payment_providers;
  v_settings public.org_payment_settings;
  v_paid numeric;
  v_balance numeric;
  v_amount numeric;
  v_purpose text;
  v_ins public.installments;
  v_cum numeric;
  v_open numeric;
  v_existing public.fee_payment_transactions;
  v_method text;
  v_guardian uuid;
  v_reference text;
  v_tx public.fee_payment_transactions;
begin
  -- Verrou sur la facture : deux clics simultanés sont traités l'un après l'autre.
  select * into v_invoice from public.invoices where id = p_invoice for update;
  if v_invoice.id is null or not app.has_permission(v_invoice.organization_id, 'portal.parent')
     or not (v_invoice.student_id = any (app.my_portal_student_ids())) then
    raise exception 'Facture introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if not app.fee_payments_open(v_invoice.organization_id) then
    raise exception 'Le paiement en ligne n''est pas disponible pour cet établissement.' using errcode = 'check_violation';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Cette facture ne peut pas être payée en ligne.' using errcode = 'check_violation';
  end if;
  select * into v_provider from public.org_payment_providers where id = p_provider;
  if v_provider.id is null or v_provider.organization_id <> v_invoice.organization_id or not v_provider.is_active or v_provider.archived_at is not null then
    raise exception 'Ce moyen de paiement n''est pas disponible.' using errcode = 'check_violation';
  end if;
  if v_provider.currency <> v_invoice.currency then
    raise exception 'Ce moyen de paiement n''accepte pas la devise de la facture (%).', v_invoice.currency using errcode = 'check_violation';
  end if;
  v_method := coalesce(p_method, v_provider.methods[1]);
  if not (v_method = any (v_provider.methods)) then
    raise exception 'Moyen de paiement non proposé par ce fournisseur.' using errcode = 'check_violation';
  end if;
  select * into v_settings from public.org_payment_settings where organization_id = v_invoice.organization_id;
  v_paid := app.invoice_paid_amount(v_invoice.id);
  v_balance := v_invoice.total - v_paid;
  if v_balance <= 0 then
    raise exception 'Cette facture est déjà réglée.' using errcode = 'check_violation';
  end if;

  if p_installment is not null then
    select * into v_ins from public.installments where id = p_installment and invoice_id = v_invoice.id;
    if v_ins.id is null then
      raise exception 'Échéance introuvable.' using errcode = 'invalid_parameter_value';
    end if;
    select sum(amount) into v_cum from public.installments where invoice_id = v_invoice.id and sequence <= v_ins.sequence;
    v_amount := least(v_ins.amount, greatest(v_cum - v_paid, 0));
    if v_amount <= 0 then
      raise exception 'Cette échéance est déjà réglée.' using errcode = 'check_violation';
    end if;
    v_purpose := coalesce(nullif(btrim(v_ins.label), ''), 'Échéance ' || v_ins.sequence) || ' — facture ' || v_invoice.number;
  elsif p_amount is null or p_amount = v_balance then
    v_amount := v_balance;
    v_purpose := 'Solde — facture ' || v_invoice.number;
  else
    if not coalesce(v_settings.allow_partial, false) then
      raise exception 'L''établissement n''accepte pas les paiements d''un montant libre : choisissez une échéance ou le solde.' using errcode = 'check_violation';
    end if;
    if p_amount <= 0 or p_amount > v_balance then
      raise exception 'Montant invalide (maximum : %).', app.fee_amount_text(v_balance, v_invoice.currency) using errcode = 'check_violation';
    end if;
    if p_amount < coalesce(v_settings.min_partial_amount, 0) then
      raise exception 'Montant minimum : %.', app.fee_amount_text(v_settings.min_partial_amount, v_invoice.currency) using errcode = 'check_violation';
    end if;
    v_amount := p_amount;
    v_purpose := 'Acompte — facture ' || v_invoice.number;
  end if;
  if v_amount <> trunc(v_amount) then
    raise exception 'Montant avec décimales non pris en charge par les fournisseurs de paiement : arrondissez à l''unité.' using errcode = 'check_violation';
  end if;

  -- Double clic / retour arrière : la même demande en cours est réutilisée.
  select * into v_existing from public.fee_payment_transactions
   where invoice_id = v_invoice.id and installment_id is not distinct from p_installment and amount = v_amount and provider_id = p_provider
     and method = v_method and payer_user_id = auth.uid() and status in ('PENDING', 'PROCESSING') and expires_at > now()
   order by created_at desc limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('transaction_id', v_existing.id, 'reference', v_existing.internal_reference, 'amount', v_existing.amount,
      'currency', v_existing.currency, 'adapter', v_existing.adapter, 'mode', v_existing.mode, 'provider_id', v_existing.provider_id,
      'checkout_url', v_existing.checkout_url, 'purpose', v_existing.purpose, 'reused', true);
  end if;
  -- Double paiement : les paiements déjà en cours ne peuvent pas dépasser le reste dû.
  select coalesce(sum(amount), 0) into v_open from public.fee_payment_transactions
   where invoice_id = v_invoice.id and status in ('PENDING', 'PROCESSING') and expires_at > now();
  if v_open + v_amount > v_balance then
    raise exception 'Un paiement en ligne de % est déjà en cours pour cette facture : attendez sa confirmation (ou son expiration) avant d''en lancer un autre.',
      app.fee_amount_text(v_open, v_invoice.currency) using errcode = 'check_violation';
  end if;

  select g.id into v_guardian from public.guardians g join public.student_guardians sg on sg.guardian_id = g.id and sg.student_id = v_invoice.student_id
   where g.user_id = auth.uid() and g.archived_at is null limit 1;
  v_reference := 'NEO-' || to_char(now(), 'YYYY') || '-' || nextval('public.fee_payment_ref_seq');
  insert into public.fee_payment_transactions (organization_id, internal_reference, invoice_id, installment_id, student_id, payer_user_id, guardian_id,
                                               provider_id, adapter, provider_label, mode, method, amount, currency, purpose, expires_at, metadata)
  values (v_invoice.organization_id, v_reference, v_invoice.id, p_installment, v_invoice.student_id, auth.uid(), v_guardian,
          v_provider.id, v_provider.adapter, v_provider.label, v_provider.mode, v_method, v_amount, v_invoice.currency, v_purpose,
          now() + make_interval(mins => coalesce(v_settings.pending_minutes, 60)),
          jsonb_build_object('invoice_number', v_invoice.number, 'balance_before', v_balance))
  returning * into v_tx;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'created',
    'Transaction créée : ' || app.fee_amount_text(v_amount, v_tx.currency) || ' — ' || v_purpose || ' (' || v_provider.label || case when v_tx.mode = 'test' then ', mode test' else '' end || ')',
    jsonb_build_object('reference', v_reference, 'amount', v_amount));
  return jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'amount', v_tx.amount, 'currency', v_tx.currency,
    'adapter', v_tx.adapter, 'mode', v_tx.mode, 'provider_id', v_tx.provider_id, 'checkout_url', null, 'purpose', v_tx.purpose, 'reused', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Serveur (service role uniquement) : lien de paiement, confirmation, échec
-- -----------------------------------------------------------------------------
create or replace function public.fee_payment_attach(p_tx uuid, p_provider_tx text, p_checkout_url text, p_response jsonb default '{}'::jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
begin
  select * into v_tx from public.fee_payment_transactions where id = p_tx for update;
  if v_tx.id is null or v_tx.status <> 'PENDING' then
    raise exception 'Transaction introuvable ou déjà engagée.' using errcode = 'check_violation';
  end if;
  update public.fee_payment_transactions
     set provider_transaction_id = p_provider_tx, checkout_url = p_checkout_url, status = 'PROCESSING',
         provider_response = provider_response || jsonb_build_object('checkout', coalesce(p_response, '{}'::jsonb)), updated_at = now()
   where id = p_tx;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'checkout', 'Paiement ouvert chez ' || v_tx.provider_label, jsonb_build_object('provider_transaction_id', p_provider_tx));
end;
$$;

create or replace function public.fee_payment_confirm(
  p_provider uuid, p_provider_tx text, p_reference text, p_amount numeric, p_currency text, p_method text, p_response jsonb, p_source text default 'webhook')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
  v_invoice public.invoices;
  v_balance numeric;
  v_payment public.payments;
  v_payer text;
  v_student text;
  v_user uuid;
begin
  select * into v_tx from public.fee_payment_transactions
   where provider_id = p_provider and (provider_transaction_id = p_provider_tx or (p_provider_tx is null and internal_reference = p_reference))
   for update;
  if v_tx.id is null and p_reference is not null then
    select * into v_tx from public.fee_payment_transactions where provider_id = p_provider and internal_reference = p_reference for update;
  end if;
  if v_tx.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  if v_tx.status in ('SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED') then
    perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'duplicate', 'Confirmation reçue à nouveau (' || p_source || ') : ignorée, déjà enregistrée');
    return jsonb_build_object('result', 'duplicate', 'transaction_id', v_tx.id, 'payment_id', v_tx.payment_id);
  end if;
  if p_reference is not null and p_reference <> v_tx.internal_reference then
    update public.fee_payment_transactions set needs_review = true, review_reason = 'Référence différente renvoyée par le fournisseur : ' || left(p_reference, 60), updated_at = now() where id = v_tx.id;
    perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'rejected', 'Confirmation refusée : référence différente', jsonb_build_object('reference', p_reference));
    return jsonb_build_object('result', 'rejected', 'reason', 'reference_differente', 'transaction_id', v_tx.id);
  end if;
  if p_amount is null or p_amount <> v_tx.amount then
    update public.fee_payment_transactions set needs_review = true,
           review_reason = 'Montant confirmé (' || coalesce(p_amount::text, 'absent') || ') différent du montant demandé (' || v_tx.amount || ')', updated_at = now()
     where id = v_tx.id;
    perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'rejected', 'Confirmation refusée : montant différent', jsonb_build_object('amount', p_amount, 'expected', v_tx.amount));
    return jsonb_build_object('result', 'rejected', 'reason', 'montant_different', 'transaction_id', v_tx.id);
  end if;
  if upper(coalesce(p_currency, '')) <> v_tx.currency then
    update public.fee_payment_transactions set needs_review = true, review_reason = 'Devise confirmée (' || coalesce(p_currency, 'absente') || ') différente de ' || v_tx.currency, updated_at = now() where id = v_tx.id;
    perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'rejected', 'Confirmation refusée : devise différente', jsonb_build_object('currency', p_currency));
    return jsonb_build_object('result', 'rejected', 'reason', 'devise_differente', 'transaction_id', v_tx.id);
  end if;

  select * into v_invoice from public.invoices where id = v_tx.invoice_id for update;
  v_balance := v_invoice.total - app.invoice_paid_amount(v_invoice.id);
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_payer from public.profiles where id = v_tx.payer_user_id;
  select btrim(first_name || ' ' || last_name) into v_student from public.students where id = v_tx.student_id;

  if v_invoice.status <> 'issued' or v_balance < v_tx.amount then
    -- Argent reçu, mais la facture a changé entre-temps (réglée au guichet, annulée) : à traiter par la comptabilité.
    update public.fee_payment_transactions
       set status = 'SUCCESS', confirmed_at = now(), needs_review = true,
           review_reason = 'Paiement confirmé mais la facture ne peut plus le recevoir (reste dû : ' || greatest(v_balance, 0) || ') : rembourser ou affecter manuellement.',
           provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb)), updated_at = now()
     where id = v_tx.id;
    perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'needs_review', 'Paiement confirmé, à traiter : la facture ne peut plus le recevoir');
    for v_user in select * from app.org_users_with_permission(v_tx.organization_id, 'finance.payments.create') loop
      perform app.notify(v_tx.organization_id, v_user, 'payment.online_review', 'Paiement en ligne à traiter',
        app.fee_amount_text(v_tx.amount, v_tx.currency) || ' reçu pour ' || coalesce(v_student, 'un élève') || ' : la facture ' || v_invoice.number || ' ne peut plus le recevoir.',
        '/finances/paiements-en-ligne/' || v_tx.id, jsonb_build_object('transaction_id', v_tx.id));
    end loop;
    return jsonb_build_object('result', 'confirmed_review', 'transaction_id', v_tx.id);
  end if;

  -- Écriture comptable : paiement numéroté (reçu), soldes de la facture et des échéances mis à jour.
  insert into public.payments (organization_id, invoice_id, student_id, amount, method, reference, payer_name, notes, received_by)
  values (v_tx.organization_id, v_tx.invoice_id, v_tx.student_id, v_tx.amount,
          (case v_tx.method when 'mobile_money' then 'mobile_money' when 'card' then 'card' when 'bank_transfer' then 'bank_transfer' else 'other' end)::public.payment_method,
          left('En ligne · ' || v_tx.provider_label || ' · ' || coalesce(p_provider_tx, v_tx.internal_reference), 200),
          v_payer,
          left('Paiement en ligne ' || v_tx.internal_reference || ' — ' || v_tx.purpose || case when v_tx.mode = 'test' then ' (MODE TEST)' else '' end, 500),
          null)
  returning * into v_payment;

  update public.fee_payment_transactions
     set status = 'SUCCESS', confirmed_at = now(), payment_id = v_payment.id, needs_review = false,
         provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb), 'method', p_method),
         updated_at = now()
   where id = v_tx.id;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'confirmed',
    'Paiement confirmé (' || p_source || ') et enregistré en comptabilité : reçu ' || v_payment.number || ', reste dû ' || app.fee_amount_text(coalesce(v_payment.balance_after, 0), v_tx.currency),
    jsonb_build_object('payment_id', v_payment.id, 'receipt', v_payment.number, 'balance_after', v_payment.balance_after));
  perform app.audit(v_tx.organization_id, 'finance.online_payment_confirmed', 'fee_payment_transactions', v_tx.id,
    'Paiement en ligne confirmé ' || v_tx.internal_reference || ' — reçu ' || v_payment.number,
    jsonb_build_object('amount', v_tx.amount, 'currency', v_tx.currency, 'provider', v_tx.provider_label, 'payment_id', v_payment.id, 'mode', v_tx.mode), 'success');
  -- Comptabilité prévenue (la famille l'est par l'enregistrement du paiement).
  for v_user in select * from app.org_users_with_permission(v_tx.organization_id, 'finance.payments.create') loop
    perform app.notify(v_tx.organization_id, v_user, 'payment.online', 'Nouveau paiement en ligne',
      'Nouveau paiement reçu de ' || app.fee_amount_text(v_tx.amount, v_tx.currency) || ' pour ' || coalesce(v_student, 'un élève') || ' (' || v_tx.purpose || ', reçu ' || v_payment.number || ').',
      '/finances/paiements-en-ligne/' || v_tx.id, jsonb_build_object('transaction_id', v_tx.id, 'payment_id', v_payment.id));
  end loop;
  return jsonb_build_object('result', 'confirmed', 'transaction_id', v_tx.id, 'payment_id', v_payment.id, 'receipt', v_payment.number);
end;
$$;

create or replace function public.fee_payment_fail(p_provider uuid, p_provider_tx text, p_reference text, p_status text, p_reason text, p_response jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
begin
  if p_status not in ('FAILED', 'CANCELLED', 'EXPIRED') then
    raise exception 'Statut invalide.' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_tx from public.fee_payment_transactions
   where provider_id = p_provider and ((p_provider_tx is not null and provider_transaction_id = p_provider_tx) or (p_reference is not null and internal_reference = p_reference))
   for update;
  if v_tx.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  if v_tx.status not in ('PENDING', 'PROCESSING') then
    return jsonb_build_object('result', 'duplicate', 'status', v_tx.status);
  end if;
  update public.fee_payment_transactions
     set status = p_status, failure_reason = left(coalesce(p_reason, ''), 300),
         provider_response = provider_response || jsonb_build_object('failure', coalesce(p_response, '{}'::jsonb)), updated_at = now()
   where id = v_tx.id;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'status_change',
    'Statut : ' || case p_status when 'FAILED' then 'échoué' when 'CANCELLED' then 'annulé' else 'expiré' end || coalesce(' — ' || nullif(p_reason, ''), ''));
  return jsonb_build_object('result', lower(p_status), 'transaction_id', v_tx.id);
end;
$$;

-- Demandes restées sans réponse au-delà de leur délai : expirées (une confirmation tardive du fournisseur reste acceptée).
create or replace function public.fee_payment_expire_stale(p_org uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null and not app.has_permission(p_org, 'finance.read') then
    raise exception 'Permission refusée.' using errcode = 'insufficient_privilege';
  end if;
  with expired as (
    update public.fee_payment_transactions set status = 'EXPIRED', failure_reason = coalesce(failure_reason, 'Délai de paiement dépassé'), updated_at = now()
     where organization_id = p_org and status in ('PENDING', 'PROCESSING') and expires_at < now()
    returning id, organization_id, provider_id
  ), logged as (
    insert into public.fee_payment_events (organization_id, transaction_id, provider_id, kind, summary)
    select organization_id, id, provider_id, 'status_change', 'Statut : expiré (délai de paiement dépassé)' from expired
    returning 1
  )
  select count(*) into v_count from logged;
  return v_count;
end;
$$;

create or replace function public.fee_payment_mark_reviewed(p_tx uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
begin
  select * into v_tx from public.fee_payment_transactions where id = p_tx for update;
  if v_tx.id is null or not app.has_permission(v_tx.organization_id, 'finance.payments.create') then
    raise exception 'Transaction introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Indiquez comment le cas a été traité.' using errcode = 'check_violation';
  end if;
  update public.fee_payment_transactions set needs_review = false, review_reason = coalesce(review_reason, '') || ' — Traité : ' || left(btrim(p_note), 200), updated_at = now() where id = p_tx;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'reviewed', 'Cas traité par la comptabilité : ' || left(btrim(p_note), 200));
  perform app.audit(v_tx.organization_id, 'finance.online_payment_reviewed', 'fee_payment_transactions', v_tx.id, 'Paiement en ligne traité ' || v_tx.internal_reference, jsonb_build_object('note', p_note), 'success');
end;
$$;

-- Trace d'une vérification manuelle (rapprochement) faite par le serveur pour le compte d'un comptable.
create or replace function public.fee_payment_log_check(p_tx uuid, p_summary text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
begin
  select * into v_tx from public.fee_payment_transactions where id = p_tx;
  if v_tx.id is null or (auth.uid() is not null and not app.has_permission(v_tx.organization_id, 'finance.read')) then
    raise exception 'Transaction introuvable.' using errcode = 'insufficient_privilege';
  end if;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'reconciliation', left(p_summary, 500));
end;
$$;

-- -----------------------------------------------------------------------------
-- Remboursements (automatiques si le fournisseur le permet, sinon procédure manuelle tracée)
-- -----------------------------------------------------------------------------
create or replace function public.fee_payment_refund_request(p_tx uuid, p_amount numeric, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.fee_payment_transactions;
  v_pending numeric;
  v_id uuid;
begin
  select * into v_tx from public.fee_payment_transactions where id = p_tx for update;
  if v_tx.id is null or not app.has_permission(v_tx.organization_id, 'finance.payments.create') then
    raise exception 'Transaction introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_tx.status not in ('SUCCESS', 'PARTIALLY_REFUNDED') then
    raise exception 'Seul un paiement confirmé peut être remboursé.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(amount), 0) into v_pending from public.fee_payment_refunds where transaction_id = p_tx and status = 'requested';
  if p_amount is null or p_amount <= 0 or p_amount + v_pending > v_tx.amount - v_tx.refunded_amount then
    raise exception 'Montant de remboursement invalide (maximum : %).', app.fee_amount_text(v_tx.amount - v_tx.refunded_amount - v_pending, v_tx.currency) using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif du remboursement.' using errcode = 'check_violation';
  end if;
  insert into public.fee_payment_refunds (organization_id, transaction_id, amount, reason)
  values (v_tx.organization_id, p_tx, p_amount, btrim(p_reason)) returning id into v_id;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'refund_requested', 'Remboursement demandé : ' || app.fee_amount_text(p_amount, v_tx.currency) || ' — ' || btrim(p_reason));
  perform app.audit(v_tx.organization_id, 'finance.online_refund_requested', 'fee_payment_refunds', v_id, 'Remboursement demandé ' || v_tx.internal_reference,
    jsonb_build_object('amount', p_amount, 'reason', p_reason), 'success');
  return v_id;
end;
$$;

create or replace function public.fee_payment_refund_complete(p_refund uuid, p_external_reference text, p_note text, p_automatic boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_refund public.fee_payment_refunds;
  v_tx public.fee_payment_transactions;
  v_old public.payments;
  v_new public.payments;
  v_remaining numeric;
begin
  select * into v_refund from public.fee_payment_refunds where id = p_refund for update;
  if v_refund.id is null or (auth.uid() is not null and not app.has_permission(v_refund.organization_id, 'finance.payments.cancel')) then
    raise exception 'Remboursement introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_refund.status <> 'requested' then
    raise exception 'Ce remboursement est déjà traité.' using errcode = 'check_violation';
  end if;
  if not p_automatic and char_length(btrim(coalesce(p_external_reference, ''))) < 3 then
    raise exception 'Indiquez la référence du remboursement effectué (transaction Mobile Money, virement…).' using errcode = 'check_violation';
  end if;
  select * into v_tx from public.fee_payment_transactions where id = v_refund.transaction_id for update;
  v_remaining := v_tx.amount - v_tx.refunded_amount - v_refund.amount;
  if v_remaining < 0 then
    raise exception 'Le remboursement dépasse le montant restant.' using errcode = 'check_violation';
  end if;
  -- Comptabilité : le paiement en cours est annulé (motif tracé) puis, si remboursement partiel,
  -- un paiement du montant conservé est réenregistré (nouveau reçu), pour que le solde reste exact.
  if v_tx.payment_id is not null then
    select * into v_old from public.payments where id = v_tx.payment_id for update;
    if v_old.status = 'completed' then
      update public.payments set status = 'cancelled',
             cancelled_reason = left('Remboursement ' || case when v_remaining > 0 then 'partiel ' else '' end || 'du paiement en ligne ' || v_tx.internal_reference || ' : ' || v_refund.reason, 300)
       where id = v_old.id;
    end if;
    if v_remaining > 0 then
      insert into public.payments (organization_id, invoice_id, student_id, amount, method, reference, payer_name, notes)
      values (v_tx.organization_id, v_tx.invoice_id, v_tx.student_id, v_remaining, v_old.method, v_old.reference, v_old.payer_name,
              left('Paiement en ligne ' || v_tx.internal_reference || ' après remboursement partiel de ' || app.fee_amount_text(v_refund.amount, v_tx.currency) || ' (remplace ' || v_old.number || ')', 500))
      returning * into v_new;
    end if;
  end if;
  update public.fee_payment_transactions
     set refunded_amount = refunded_amount + v_refund.amount,
         status = case when v_remaining > 0 then 'PARTIALLY_REFUNDED' else 'REFUNDED' end,
         payment_id = case when v_tx.payment_id is null then null when v_remaining > 0 then v_new.id else v_tx.payment_id end,
         updated_at = now()
   where id = v_tx.id;
  update public.fee_payment_refunds
     set status = 'completed', mode = case when p_automatic then 'automatic' else 'manual' end, external_reference = left(btrim(coalesce(p_external_reference, '')), 120),
         note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), cancelled_payment_id = v_old.id, replacement_payment_id = v_new.id,
         processed_by = auth.uid(), processed_at = now()
   where id = v_refund.id;
  perform app.fee_event(v_tx.organization_id, v_tx.id, v_tx.provider_id, 'refunded',
    'Remboursement effectué (' || case when p_automatic then 'automatique' else 'manuel' end || ') : ' || app.fee_amount_text(v_refund.amount, v_tx.currency)
      || coalesce(' — réf. ' || nullif(btrim(p_external_reference), ''), '') || case when v_new.id is not null then ' ; nouveau reçu ' || v_new.number else '' end,
    jsonb_build_object('refund_id', v_refund.id, 'cancelled_payment', v_old.id, 'replacement_payment', v_new.id));
  perform app.audit(v_tx.organization_id, 'finance.online_refund_completed', 'fee_payment_refunds', v_refund.id, 'Remboursement effectué ' || v_tx.internal_reference,
    jsonb_build_object('amount', v_refund.amount, 'automatic', p_automatic, 'external_reference', p_external_reference), 'success');
  return jsonb_build_object('result', 'refunded', 'remaining', v_remaining, 'replacement_payment_id', v_new.id);
end;
$$;

create or replace function public.fee_payment_refund_reject(p_refund uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_refund public.fee_payment_refunds;
begin
  select * into v_refund from public.fee_payment_refunds where id = p_refund for update;
  if v_refund.id is null or not app.has_permission(v_refund.organization_id, 'finance.payments.cancel') then
    raise exception 'Remboursement introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_refund.status <> 'requested' then
    raise exception 'Ce remboursement est déjà traité.' using errcode = 'check_violation';
  end if;
  update public.fee_payment_refunds set status = 'rejected', note = left(btrim(coalesce(p_reason, '')), 500), processed_by = auth.uid(), processed_at = now() where id = p_refund;
  perform app.fee_event(v_refund.organization_id, v_refund.transaction_id, null, 'refund_rejected', 'Demande de remboursement refusée' || coalesce(' : ' || nullif(btrim(p_reason), ''), ''));
end;
$$;

-- -----------------------------------------------------------------------------
-- Tableau de bord comptable (agrégats sous les droits de l'appelant)
-- -----------------------------------------------------------------------------
create or replace function public.fee_payment_stats(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'finance.read') then
    raise exception 'Permission refusée.' using errcode = 'insufficient_privilege';
  end if;
  return (
    with tx as (
      select * from public.fee_payment_transactions
       where organization_id = p_org and created_at >= coalesce(p_from, date '2000-01-01') and created_at < coalesce(p_to, date '2999-01-01') + 1
    )
    select jsonb_build_object(
      'count', (select count(*) from tx),
      'collected', (select coalesce(sum(amount - refunded_amount), 0) from tx where status in ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED')),
      'success', (select count(*) from tx where status in ('SUCCESS', 'PARTIALLY_REFUNDED')),
      'pending', (select count(*) from tx where status in ('PENDING', 'PROCESSING')),
      'failed', (select count(*) from tx where status in ('FAILED', 'CANCELLED', 'EXPIRED')),
      'refunded', (select coalesce(sum(refunded_amount), 0) from tx),
      'review', (select count(*) from tx where needs_review),
      'by_provider', coalesce((select jsonb_agg(jsonb_build_object('label', provider_label, 'amount', s, 'count', c) order by s desc)
                                 from (select provider_label, sum(amount - refunded_amount) s, count(*) c from tx where status in ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED') group by provider_label) x), '[]'::jsonb),
      'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', s, 'count', c) order by s desc)
                               from (select method, sum(amount - refunded_amount) s, count(*) c from tx where status in ('SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED') group by method) x), '[]'::jsonb),
      'currencies', coalesce((select jsonb_agg(distinct currency) from tx), '[]'::jsonb))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke all on function public.platform_set_school_payments(boolean) from public, anon;
revoke all on function public.org_save_payment_settings(uuid, boolean, boolean, numeric, integer) from public, anon;
revoke all on function public.org_save_payment_provider(uuid, uuid, text, text, text, text, text[], text, jsonb, jsonb, text, text, boolean) from public, anon;
revoke all on function public.org_set_payment_provider_state(uuid, boolean, boolean, integer) from public, anon;
revoke all on function public.org_archive_payment_provider(uuid) from public, anon;
revoke all on function public.org_record_payment_provider_test(uuid, boolean, text) from public, anon;
revoke all on function public.fee_payment_options(uuid) from public, anon;
revoke all on function public.fee_payment_start(uuid, uuid, numeric, uuid, text) from public, anon;
revoke all on function public.fee_payment_attach(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fee_payment_confirm(uuid, text, text, numeric, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.fee_payment_fail(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fee_payment_expire_stale(uuid) from public, anon;
revoke all on function public.fee_payment_mark_reviewed(uuid, text) from public, anon;
revoke all on function public.fee_payment_log_check(uuid, text) from public, anon;
revoke all on function public.fee_payment_refund_request(uuid, numeric, text) from public, anon;
revoke all on function public.fee_payment_refund_complete(uuid, text, text, boolean) from public, anon;
revoke all on function public.fee_payment_refund_reject(uuid, text) from public, anon;
revoke all on function public.fee_payment_stats(uuid, date, date) from public, anon;
grant execute on function public.platform_set_school_payments(boolean) to authenticated;
grant execute on function public.org_save_payment_settings(uuid, boolean, boolean, numeric, integer) to authenticated;
grant execute on function public.org_save_payment_provider(uuid, uuid, text, text, text, text, text[], text, jsonb, jsonb, text, text, boolean) to authenticated;
grant execute on function public.org_set_payment_provider_state(uuid, boolean, boolean, integer) to authenticated;
grant execute on function public.org_archive_payment_provider(uuid) to authenticated;
grant execute on function public.org_record_payment_provider_test(uuid, boolean, text) to authenticated;
grant execute on function public.fee_payment_options(uuid) to authenticated;
grant execute on function public.fee_payment_start(uuid, uuid, numeric, uuid, text) to authenticated;
grant execute on function public.fee_payment_attach(uuid, text, text, jsonb) to service_role;
grant execute on function public.fee_payment_confirm(uuid, text, text, numeric, text, text, jsonb, text) to service_role;
grant execute on function public.fee_payment_fail(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.fee_payment_expire_stale(uuid) to authenticated, service_role;
grant execute on function public.fee_payment_mark_reviewed(uuid, text) to authenticated;
grant execute on function public.fee_payment_log_check(uuid, text) to authenticated, service_role;
grant execute on function public.fee_payment_refund_request(uuid, numeric, text) to authenticated;
grant execute on function public.fee_payment_refund_complete(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.fee_payment_refund_reject(uuid, text) to authenticated;
grant execute on function public.fee_payment_stats(uuid, date, date) to authenticated;
