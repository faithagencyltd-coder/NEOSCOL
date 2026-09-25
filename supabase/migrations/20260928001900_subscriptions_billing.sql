-- =============================================================================
-- Abonnements NéoScol (« SYSTÈME A » : l'établissement paie NéoScol).
--
-- À NE PAS CONFONDRE avec les finances de l'établissement (« SYSTÈME B » :
-- fee_*, invoices, payments, expenses…) : aucune table, aucune fonction, aucune
-- permission n'est partagée entre les deux systèmes.
--
-- Principes :
--   * formules officielles et montants fixes (XOF, entiers) ; le prix appliqué
--     est copié sur l'abonnement et sur chaque facture (aucune rétroactivité) ;
--   * essai gratuit de 14 jours à la création de chaque établissement ;
--   * statuts et transitions uniquement côté base (fonctions SECURITY DEFINER) :
--     le navigateur ne fixe jamais un statut ni un montant ;
--   * paiement confirmé uniquement par le serveur (service role), après
--     vérification auprès du fournisseur ; confirmation idempotente ;
--   * impayé : l'établissement passe en LECTURE SEULE (aucune donnée supprimée),
--     appliqué par app.permitted_org_ids, donc par toutes les politiques RLS ;
--   * mode test / production stocké sur chaque transaction, jamais mélangé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('billing.read', 'billing', 'Consulter l''abonnement NéoScol, ses factures et ses paiements', 95),
  ('billing.manage', 'billing', 'Gérer l''abonnement NéoScol (formule, paiement, annulation)', 96);

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join (values ('billing.read', 'org_admin'), ('billing.read', 'director'), ('billing.read', 'accountant'),
             ('billing.manage', 'org_admin'), ('billing.manage', 'director')) as p(code, role_key)
  on p.role_key = r.key
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Paramètres de facturation de la plateforme (délais d'impayé configurables)
--   jours écoulés après l'échéance :
--   [0, past_due_days)                 → PAST_DUE      (accès complet)
--   [past_due_days, restrict_after)    → GRACE_PERIOD  (accès complet)
--   [restrict_after, expire_after)     → RESTRICTED    (lecture seule)
--   [expire_after, ∞)                  → EXPIRED       (lecture seule)
-- -----------------------------------------------------------------------------
create table public.platform_billing_settings (
  id smallint primary key default 1 check (id = 1),
  past_due_days integer not null default 3 check (past_due_days between 0 and 60),
  restrict_after_days integer not null default 10 check (restrict_after_days between 0 and 120),
  expire_after_days integer not null default 60 check (expire_after_days between 1 and 730),
  renewal_notice_days integer not null default 7 check (renewal_notice_days between 1 and 60),
  checkout_expiry_hours integer not null default 48 check (checkout_expiry_hours between 1 and 720),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  check (past_due_days <= restrict_after_days and restrict_after_days < expire_after_days)
);
insert into public.platform_billing_settings (id) values (1);

-- -----------------------------------------------------------------------------
-- Formules
-- -----------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z_]{2,39}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text,
  audience text,
  monthly_price integer not null check (monthly_price > 0),
  annual_price integer not null check (annual_price > 0),
  -- Prix annuel théorique (12 mois) et économie : valeurs exactes, jamais arrondies.
  annual_list_price integer generated always as (monthly_price * 12) stored,
  annual_savings integer generated always as (monthly_price * 12 - annual_price) stored,
  annual_discount_percent numeric(5, 2) not null default 30 check (annual_discount_percent between 0 and 100),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  trial_days integer not null default 14 check (trial_days between 0 and 90),
  org_types public.organization_type[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (annual_price <= monthly_price * 12)
);
comment on table public.subscription_plans is
  'Formules NéoScol. Les prix sont copiés sur les abonnements et les factures : les modifier n''a aucun effet rétroactif.';

insert into public.subscription_plans (code, name, description, audience, monthly_price, annual_price, org_types, sort_order) values
  ('MATERNELLE_PRIMAIRE', 'Maternelle & Primaire',
   'Gestion complète des écoles maternelles et primaires.', 'Écoles maternelles et primaires',
   8000, 67200, '{primary_school}', 1),
  ('COLLEGE_LYCEE', 'Collège & Lycée',
   'Collèges et lycées : notes, bulletins, emplois du temps, finances.', 'Collèges, lycées, écoles privées',
   15000, 126000, '{middle_school,high_school,private_school}', 2),
  ('CENTRE_FORMATION', 'Centre de formation',
   'Centres de formation professionnelle et technique : sessions, apprenants, certificats.', 'Centres de formation professionnelle et technique',
   15000, 126000, '{vocational_center,technical_center}', 3),
  ('UNIVERSITE', 'Université',
   'Universités et instituts : promotions, crédits ECTS, relevés.', 'Universités, instituts, écoles supérieures',
   20000, 168000, '{university,institute}', 4),
  ('ENTERPRISE', 'Enterprise',
   'Grands groupes scolaires, réseaux et groupes multi-établissements.', 'Groupes scolaires, réseaux, structures multi-sites',
   28000, 235200, '{school_complex,school_group}', 5);

-- Fonctionnalités (et limites éventuelles) par formule. limit_value NULL = illimité.
create table public.subscription_features (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  feature_code text not null check (feature_code ~ '^[a-z][a-z_]{1,49}$'),
  enabled boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, feature_code)
);
comment on column public.subscription_features.limit_value is
  'Limite (max_students, max_users, max_establishments, max_storage…) ; NULL = aucune limite. Aucune limite n''est imposée à ce jour.';

insert into public.subscription_features (plan_id, feature_code, enabled)
select p.id, f.code, (f.code <> 'multi_establishment' or p.code = 'ENTERPRISE')
from public.subscription_plans p
cross join unnest(array['students', 'teachers', 'parents', 'finance', 'attendance', 'grades', 'bulletins', 'documents',
                        'qr', 'reports', 'assistant', 'communication', 'pwa', 'multi_establishment']) as f(code);

-- -----------------------------------------------------------------------------
-- Fournisseurs de paiement
-- -----------------------------------------------------------------------------
create table public.payment_providers (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  supports_refund boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.payment_providers (code, name, description, supports_refund) values
  ('paydunya', 'PayDunya', 'Mobile money et cartes (Afrique de l''Ouest), dont MTN, Moov et Celtiis Cash au Bénin.', false),
  ('simulation', 'Paiement simulé', 'Mode test local sans fournisseur : aucun argent réel. Refusé en production.', false),
  ('manual', 'Paiement manuel', 'Paiement hors plateforme validé par l''administration NéoScol.', false);

-- -----------------------------------------------------------------------------
-- Abonnements (un par établissement ; l'historique est dans les événements et factures)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  billing_interval text not null default 'MONTHLY' check (billing_interval in ('MONTHLY', 'YEARLY')),
  status text not null default 'TRIALING'
    check (status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'CANCELLED', 'EXPIRED')),
  monthly_price integer not null check (monthly_price > 0),
  annual_price integer not null check (annual_price > 0),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  status_changed_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (trial_end is null or trial_start is null or trial_end > trial_start),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create index subscriptions_status_idx on public.subscriptions (status);

create sequence public.subscription_invoice_number_seq;
create sequence public.payment_reference_seq;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null,
  invoice_number text not null unique check (invoice_number ~ '^NSC-[0-9]{4}-[0-9]{6,}$'),
  plan_id uuid not null references public.subscription_plans (id),
  plan_code text not null,
  plan_name text not null,
  billing_interval text not null check (billing_interval in ('MONTHLY', 'YEARLY')),
  -- Instantané des prix au moment de la facture.
  unit_monthly_price integer not null check (unit_monthly_price > 0),
  unit_annual_price integer not null check (unit_annual_price > 0),
  list_amount integer not null check (list_amount > 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  kind text not null default 'subscription' check (kind in ('subscription', 'renewal', 'plan_change', 'manual')),
  status text not null default 'PENDING' check (status in ('DRAFT', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  issued_at timestamptz not null default now(),
  due_at timestamptz not null default now(),
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  payment_method text,
  payment_transaction_id uuid,
  pdf_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, subscription_id) references public.subscriptions (organization_id, id) on delete cascade,
  check (amount = list_amount - discount_amount),
  check (status <> 'PAID' or paid_at is not null)
);
create index subscription_invoices_org_idx on public.subscription_invoices (organization_id, issued_at desc);
create index subscription_invoices_status_idx on public.subscription_invoices (status);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null,
  invoice_id uuid not null,
  provider text not null references public.payment_providers (code),
  mode text not null check (mode in ('test', 'live')),
  provider_transaction_id text,
  internal_reference text not null unique check (internal_reference ~ '^NEO-[0-9]{4}-[0-9]{6,}$'),
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED')),
  payment_method text,
  checkout_url text,
  provider_response jsonb not null default '{}'::jsonb,
  failure_reason text,
  paid_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (provider, mode, provider_transaction_id),
  foreign key (organization_id, subscription_id) references public.subscriptions (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.subscription_invoices (organization_id, id) on delete cascade,
  check (status <> 'SUCCESS' or paid_at is not null),
  check (provider <> 'simulation' or mode = 'test')
);
create index payment_transactions_org_idx on public.payment_transactions (organization_id, created_at desc);
create index payment_transactions_status_idx on public.payment_transactions (status, created_at);

alter table public.subscription_invoices
  add constraint subscription_invoices_tx_fk foreign key (organization_id, payment_transaction_id)
  references public.payment_transactions (organization_id, id);

-- Registre des paiements confirmés : un seul paiement par transaction (idempotence).
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null,
  invoice_id uuid not null,
  transaction_id uuid not null unique,
  amount integer not null check (amount > 0),
  currency text not null,
  provider text not null,
  mode text not null,
  method text,
  reference text not null,
  paid_at timestamptz not null,
  recorded_by uuid references public.profiles (id) on delete set null,
  note text,
  duplicate_of_invoice boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (organization_id, subscription_id) references public.subscriptions (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.subscription_invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, transaction_id) references public.payment_transactions (organization_id, id) on delete cascade
);
create index subscription_payments_org_idx on public.subscription_payments (organization_id, paid_at desc);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid,
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (event_type in (
    'trial_started', 'plan_selected', 'checkout_created', 'payment_pending', 'payment_success', 'payment_failed',
    'payment_cancelled', 'invoice_created', 'invoice_paid', 'invoice_cancelled', 'subscription_activated',
    'subscription_renewed', 'subscription_cancelled', 'subscription_resumed', 'subscription_past_due',
    'subscription_grace_period', 'subscription_restricted', 'subscription_expired', 'subscription_reactivated',
    'plan_changed', 'manual_payment', 'notification_sent'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index subscription_events_org_idx on public.subscription_events (organization_id, created_at desc);
create index subscription_events_key_idx on public.subscription_events (organization_id, (metadata ->> 'key')) where event_type = 'notification_sent';

-- Réceptions brutes des webhooks (journal technique, jamais de secret).
create table public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  mode text,
  received_at timestamptz not null default now(),
  ip text,
  payload jsonb not null default '{}'::jsonb,
  provider_transaction_id text,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'duplicate', 'ignored', 'rejected', 'error')),
  result jsonb,
  error text,
  organization_id uuid references public.organizations (id) on delete set null,
  transaction_id uuid references public.payment_transactions (id) on delete set null
);
create index payment_webhooks_received_idx on public.payment_webhooks (received_at desc);

-- Événements VÉRIFIÉS auprès du fournisseur : clé unique = idempotence.
create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  mode text not null check (mode in ('test', 'live')),
  event_key text not null,
  provider_transaction_id text,
  status text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  transaction_id uuid references public.payment_transactions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, mode, event_key)
);

-- État « côté fournisseur » du paiement simulé (mode test local, service role uniquement).
create table public.payment_simulations (
  reference text primary key,
  outcome text not null check (outcome in ('completed', 'cancelled', 'failed')),
  amount integer not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Horodatage, audit
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['subscription_plans', 'subscriptions', 'subscription_invoices', 'payment_transactions']
  loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['subscription_plans', 'subscriptions', 'subscription_invoices']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
create trigger payment_transactions_audit after insert or update or delete on public.payment_transactions
  for each row execute function app.audit_row('redact');
create trigger subscription_features_audit after insert or update or delete on public.subscription_features
  for each row execute function app.audit_row();

-- -----------------------------------------------------------------------------
-- Fonctions internes
-- -----------------------------------------------------------------------------
create or replace function app.default_plan_code(p_type public.organization_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'primary_school' then 'MATERNELLE_PRIMAIRE'
    when 'vocational_center' then 'CENTRE_FORMATION'
    when 'technical_center' then 'CENTRE_FORMATION'
    when 'university' then 'UNIVERSITE'
    when 'institute' then 'UNIVERSITE'
    when 'school_complex' then 'ENTERPRISE'
    when 'school_group' then 'ENTERPRISE'
    else 'COLLEGE_LYCEE'
  end;
$$;

create or replace function app.billing_event(p_org uuid, p_sub uuid, p_type text, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.subscription_events (organization_id, subscription_id, user_id, event_type, metadata)
  values (p_org, p_sub, auth.uid(), p_type, coalesce(p_metadata, '{}'::jsonb));
$$;

-- Notification in-app aux responsables de l'abonnement (billing.read), dédupliquée par clé.
create or replace function app.billing_notify(p_org uuid, p_sub uuid, p_key text, p_title text, p_body text, p_link text default '/abonnement')
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is not null and exists (
    select 1 from public.subscription_events e
    where e.organization_id = p_org and e.event_type = 'notification_sent' and e.metadata ->> 'key' = p_key
  ) then
    return false;
  end if;
  insert into public.notifications (organization_id, user_id, type, title, body, link, data)
  select distinct p_org, m.user_id, 'billing', p_title, p_body, p_link, jsonb_build_object('key', p_key)
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = 'billing.read'
  where m.organization_id = p_org and m.status = 'active';
  perform app.billing_event(p_org, p_sub, 'notification_sent', jsonb_build_object('key', p_key, 'title', p_title));
  return true;
end;
$$;

create or replace function app.billing_period_end(p_start timestamptz, p_interval text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_start + case p_interval when 'YEARLY' then interval '1 year' else interval '1 month' end;
$$;

-- Échéance de référence : fin d'essai, sinon fin de période payée.
create or replace function app.subscription_end_at(s public.subscriptions)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when s.status = 'TRIALING' or s.current_period_end is null then s.trial_end else s.current_period_end end;
$$;

-- Accès de l'établissement : 'full' ou 'read_only' (données toujours conservées).
-- Calculé sur les dates : reste exact même si la tâche planifiée n'a pas encore tourné.
-- Un établissement rattaché à un groupe couvert par une formule multi-établissements
-- bénéficie de l'accès du groupe.
create or replace function app.org_billing_access(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (select * from public.platform_billing_settings where id = 1),
  candidates as (
    select s.* from public.subscriptions s where s.organization_id = p_org
    union all
    select s.* from public.subscriptions s
    join public.organizations o on o.parent_id = s.organization_id and o.id = p_org
    join public.subscription_features f on f.plan_id = s.plan_id and f.feature_code = 'multi_establishment' and f.enabled
  )
  select case
    when not exists (select 1 from candidates) then 'full'
    when exists (
      select 1 from candidates c, cfg
      where c.status not in ('RESTRICTED', 'EXPIRED')
        and now() < (case when c.status = 'TRIALING' or c.current_period_end is null then c.trial_end else c.current_period_end end)
                    + case when c.cancel_at_period_end or c.status = 'CANCELLED' then interval '0'
                           else make_interval(days => cfg.restrict_after_days) end
    ) then 'full'
    else 'read_only'
  end;
$$;

-- Permissions conservées en lecture seule : consultation, exports, portails, abonnement.
create or replace function app.permission_allowed_read_only(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_code ~ '\.read$' or p_code in ('portal.parent', 'portal.student', 'reports.export', 'reports.finance', 'billing.manage');
$$;

-- Les helpers RLS tiennent compte de l'abonnement : un établissement restreint
-- ou expiré garde la lecture, perd l'écriture. Rien n'est supprimé.
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
    and (app.permission_allowed_read_only(p_permission) or app.org_billing_access(m.organization_id) = 'full');
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
    and (app.permission_allowed_read_only(rp.permission_code) or app.org_billing_access(p_org) = 'full');
$$;

-- Création de l'abonnement d'un établissement : essai de 14 jours (ou démonstration).
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
  select * into v_plan from public.subscription_plans where code = app.default_plan_code(v_org.type);
  if v_org.is_demo then
    -- Établissement de démonstration (données fictives) : abonnement de démonstration, sans facture.
    insert into public.subscriptions (organization_id, plan_id, billing_interval, status, monthly_price, annual_price, currency,
                                      current_period_start, current_period_end, next_billing_date, is_demo)
    values (p_org, v_plan.id, 'YEARLY', 'ACTIVE', v_plan.monthly_price, v_plan.annual_price, v_plan.currency,
            now(), now() + interval '1 year', now() + interval '1 year', true)
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

create or replace function app.organization_subscription_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.subscription_bootstrap(new.id);
  return new;
end;
$$;
create trigger organizations_subscription
  after insert on public.organizations
  for each row execute function app.organization_subscription_after_insert();

-- Établissements existants.
select app.subscription_bootstrap(o.id) from public.organizations o
where not exists (select 1 from public.subscriptions s where s.organization_id = o.id);

-- Facture d'abonnement : montant TOUJOURS calculé ici, à partir de la formule.
create or replace function app.billing_create_invoice(p_org uuid, p_plan_code text, p_interval text, p_kind text)
returns public.subscription_invoices
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_list integer;
  v_amount integer;
  v_inv public.subscription_invoices;
begin
  if p_interval not in ('MONTHLY', 'YEARLY') then
    raise exception 'Périodicité invalide.' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if v_sub.id is null then
    raise exception 'Abonnement introuvable.' using errcode = 'no_data_found';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active;
  if v_plan.id is null then
    raise exception 'Formule inconnue ou indisponible.' using errcode = 'check_violation';
  end if;
  -- Même formule et même périodicité que l'abonnement en cours : prix d'origine conservé.
  if v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then
    v_list := case p_interval when 'YEARLY' then v_sub.monthly_price * 12 else v_sub.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_sub.annual_price else v_sub.monthly_price end;
  else
    v_list := case p_interval when 'YEARLY' then v_plan.annual_list_price else v_plan.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_plan.annual_price else v_plan.monthly_price end;
  end if;
  insert into public.subscription_invoices (
    organization_id, subscription_id, invoice_number, plan_id, plan_code, plan_name, billing_interval,
    unit_monthly_price, unit_annual_price, list_amount, discount_amount, amount, currency, kind, status,
    due_at, created_by
  ) values (
    p_org, v_sub.id,
    'NSC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscription_invoice_number_seq')::text, 6, '0'),
    v_plan.id, v_plan.code, v_plan.name, p_interval,
    case when v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then v_sub.monthly_price else v_plan.monthly_price end,
    case when v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then v_sub.annual_price else v_plan.annual_price end,
    v_list, v_list - v_amount, v_amount, v_plan.currency, p_kind, 'PENDING',
    greatest(now(), coalesce(app.subscription_end_at(v_sub), now())), auth.uid()
  ) returning * into v_inv;
  update public.subscription_invoices set pdf_url = '/api/abonnement/factures/' || v_inv.id where id = v_inv.id;
  perform app.billing_event(p_org, v_sub.id, 'invoice_created',
    jsonb_build_object('invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_amount, 'plan', v_plan.code, 'interval', p_interval, 'kind', p_kind));
  return v_inv;
end;
$$;

-- Application d'un paiement confirmé : facture payée, abonnement actif, période prolongée.
create or replace function app.billing_apply_payment(p_tx uuid, p_method text, p_recorded_by uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
  v_inv public.subscription_invoices;
  v_sub public.subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_status text;
  v_event text;
  v_duplicate boolean := false;
  v_superseded integer;
begin
  select * into v_tx from public.payment_transactions where id = p_tx for update;
  select * into v_inv from public.subscription_invoices where id = v_tx.invoice_id for update;
  select * into v_sub from public.subscriptions where id = v_tx.subscription_id for update;
  v_prev_status := v_sub.status;

  update public.payment_transactions
     set status = 'SUCCESS', paid_at = coalesce(paid_at, now()), payment_method = coalesce(p_method, payment_method),
         confirmed_by = p_recorded_by, failure_reason = null
   where id = v_tx.id;

  -- Facture déjà réglée par une autre transaction : paiement enregistré, période NON prolongée deux fois.
  v_duplicate := v_inv.status = 'PAID';
  insert into public.subscription_payments (organization_id, subscription_id, invoice_id, transaction_id, amount, currency,
                                            provider, mode, method, reference, paid_at, recorded_by, note, duplicate_of_invoice)
  values (v_tx.organization_id, v_tx.subscription_id, v_tx.invoice_id, v_tx.id, v_tx.amount, v_tx.currency,
          v_tx.provider, v_tx.mode, coalesce(p_method, v_tx.payment_method), v_tx.internal_reference, now(), p_recorded_by, p_note, v_duplicate);
  perform app.billing_event(v_tx.organization_id, v_sub.id, 'payment_success',
    jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'amount', v_tx.amount,
                       'provider', v_tx.provider, 'mode', v_tx.mode, 'duplicate', v_duplicate));
  if v_duplicate then
    perform app.billing_notify(v_tx.organization_id, v_sub.id, 'duplicate:' || v_tx.id, 'Paiement en double détecté',
      'La facture ' || v_inv.invoice_number || ' était déjà réglée. L''administration NéoScol va régulariser ce paiement.');
    return jsonb_build_object('result', 'confirmed', 'duplicate_invoice', true, 'organization_id', v_tx.organization_id);
  end if;

  -- Début de période : fin de l'essai en cours, prolongation d'un abonnement actif identique, sinon maintenant.
  if v_sub.status = 'TRIALING' and v_sub.trial_end > now() then
    v_start := v_sub.trial_end;
  elsif v_sub.status in ('ACTIVE', 'PAST_DUE', 'GRACE_PERIOD') and v_sub.plan_id = v_inv.plan_id
        and v_sub.billing_interval = v_inv.billing_interval and v_sub.current_period_end is not null
        and v_sub.current_period_end > now() - interval '60 days' then
    v_start := v_sub.current_period_end;
  else
    v_start := now();
  end if;
  v_end := app.billing_period_end(v_start, v_inv.billing_interval);

  update public.subscription_invoices
     set status = 'PAID', paid_at = now(), payment_method = coalesce(p_method, v_tx.payment_method),
         payment_transaction_id = v_tx.id, period_start = v_start, period_end = v_end
   where id = v_inv.id;

  update public.subscriptions
     set plan_id = v_inv.plan_id, billing_interval = v_inv.billing_interval,
         monthly_price = v_inv.unit_monthly_price, annual_price = v_inv.unit_annual_price, currency = v_inv.currency,
         status = 'ACTIVE', status_changed_at = case when status <> 'ACTIVE' then now() else status_changed_at end,
         current_period_start = v_start, current_period_end = v_end, next_billing_date = v_end,
         cancel_at_period_end = false, cancelled_at = null, cancellation_reason = null, is_demo = false
   where id = v_sub.id;

  perform app.billing_event(v_tx.organization_id, v_sub.id, 'invoice_paid',
    jsonb_build_object('invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'period_start', v_start, 'period_end', v_end));
  -- Autres factures en attente devenues sans objet (remplacées par ce paiement).
  with superseded as (
    update public.subscription_invoices set status = 'CANCELLED'
     where organization_id = v_tx.organization_id and status = 'PENDING' and id <> v_inv.id
    returning id, invoice_number
  )
  select count(*) into v_superseded from (
    select app.billing_event(v_tx.organization_id, v_sub.id, 'invoice_cancelled',
             jsonb_build_object('invoice_id', x.id, 'invoice_number', x.invoice_number, 'reason', 'remplacée par ' || v_inv.invoice_number))
    from superseded x
  ) y;
  if v_sub.plan_id <> v_inv.plan_id or v_sub.billing_interval <> v_inv.billing_interval then
    perform app.billing_event(v_tx.organization_id, v_sub.id, 'plan_changed',
      jsonb_build_object('from_plan_id', v_sub.plan_id, 'to_plan', v_inv.plan_code, 'from_interval', v_sub.billing_interval,
                         'to_interval', v_inv.billing_interval, 'proration', false));
  end if;
  v_event := case
    when v_prev_status = 'TRIALING' then 'subscription_activated'
    when v_prev_status = 'ACTIVE' then 'subscription_renewed'
    else 'subscription_reactivated' end;
  perform app.billing_event(v_tx.organization_id, v_sub.id, v_event,
    jsonb_build_object('previous_status', v_prev_status, 'period_end', v_end));
  perform app.billing_notify(v_tx.organization_id, v_sub.id, null, 'Paiement confirmé',
    'Paiement de ' || v_tx.amount || ' ' || v_tx.currency || ' reçu (' || v_tx.internal_reference || '). Abonnement actif jusqu''au '
      || to_char(v_end at time zone 'UTC', 'DD/MM/YYYY') || '.');
  if v_prev_status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'EXPIRED', 'CANCELLED') then
    perform app.billing_notify(v_tx.organization_id, v_sub.id, null, 'Abonnement réactivé',
      'Toutes les fonctionnalités de votre formule sont de nouveau disponibles.');
  end if;
  return jsonb_build_object('result', 'confirmed', 'organization_id', v_tx.organization_id, 'period_end', v_end, 'event', v_event);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC : établissement
-- -----------------------------------------------------------------------------

-- État d'accès (bandeaux) : tout membre de l'établissement, sans montant.
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
begin
  if not (app.is_member(p_org) or app.is_platform_admin()) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if v_sub.id is null then
    return jsonb_build_object('status', null, 'access', 'full');
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
    'is_demo', v_sub.is_demo
  );
end;
$$;

-- Début du paiement : facture + transaction locale PENDING. Montant calculé en base.
-- Le fournisseur et le mode viennent de la configuration serveur ; une transaction
-- ne peut être confirmée que par le serveur configuré dans le même mode.
create or replace function public.billing_start_checkout(p_org uuid, p_plan_code text, p_interval text, p_provider text, p_mode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.subscription_invoices;
  v_tx public.payment_transactions;
  v_sub public.subscriptions;
  v_kind text;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  if p_mode not in ('test', 'live') then
    raise exception 'Mode de paiement invalide.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.payment_providers where code = p_provider and is_active and code <> 'manual') then
    raise exception 'Fournisseur de paiement indisponible.' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  v_kind := case
    when v_sub.status = 'TRIALING' then 'subscription'
    when v_sub.plan_id = (select id from public.subscription_plans where code = p_plan_code) and v_sub.billing_interval = p_interval then 'renewal'
    else 'plan_change' end;
  -- Facture en attente pour la même formule et la même périodicité (ex. renouvellement) : réutilisée.
  select * into v_inv from public.subscription_invoices
   where organization_id = p_org and status = 'PENDING' and plan_code = p_plan_code and billing_interval = p_interval
   order by issued_at desc limit 1;
  if v_inv.id is null then
    v_inv := app.billing_create_invoice(p_org, p_plan_code, p_interval, v_kind);
  end if;
  perform app.billing_event(p_org, v_sub.id, 'plan_selected', jsonb_build_object('plan', p_plan_code, 'interval', p_interval));
  insert into public.payment_transactions (organization_id, subscription_id, invoice_id, provider, mode, internal_reference,
                                           amount, currency, status, created_by)
  values (p_org, v_inv.subscription_id, v_inv.id, p_provider, p_mode,
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          v_inv.amount, v_inv.currency, 'PENDING', auth.uid())
  returning * into v_tx;
  perform app.billing_event(p_org, v_sub.id, 'payment_pending',
    jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'amount', v_tx.amount, 'provider', p_provider, 'mode', p_mode));
  perform app.billing_notify(p_org, v_sub.id, null, 'Facture ' || v_inv.invoice_number || ' créée',
    'Montant : ' || v_inv.amount || ' ' || v_inv.currency || ' — ' || v_inv.plan_name
      || case p_interval when 'YEARLY' then ' (annuel)' else ' (mensuel)' end || '.');
  return jsonb_build_object(
    'transaction_id', v_tx.id, 'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number,
    'reference', v_tx.internal_reference, 'amount', v_tx.amount, 'currency', v_tx.currency,
    'plan_name', v_inv.plan_name, 'interval', p_interval
  );
end;
$$;

-- Essai en cours : changer de formule sans paiement.
create or replace function public.billing_change_trial_plan(p_org uuid, p_plan_code text, p_interval text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_from text;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  if p_interval not in ('MONTHLY', 'YEARLY') then
    raise exception 'Périodicité invalide.' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org for update;
  if v_sub.status <> 'TRIALING' then
    raise exception 'Hors période d''essai : le changement de formule passe par un paiement.' using errcode = 'check_violation';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active;
  if v_plan.id is null then
    raise exception 'Formule inconnue ou indisponible.' using errcode = 'check_violation';
  end if;
  select code into v_from from public.subscription_plans where id = v_sub.plan_id;
  update public.subscriptions
     set plan_id = v_plan.id, billing_interval = p_interval, monthly_price = v_plan.monthly_price,
         annual_price = v_plan.annual_price, currency = v_plan.currency
   where id = v_sub.id;
  perform app.billing_event(p_org, v_sub.id, 'plan_changed',
    jsonb_build_object('from_plan', v_from, 'to_plan', v_plan.code, 'from_interval', v_sub.billing_interval, 'to_interval', p_interval, 'during_trial', true));
end;
$$;

-- Annulation : l'accès est conservé jusqu'à la fin de la période payée (ou de l'essai).
create or replace function public.billing_cancel(p_org uuid, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org for update;
  if v_sub.status in ('CANCELLED', 'EXPIRED') or v_sub.cancel_at_period_end then
    raise exception 'Abonnement déjà annulé.' using errcode = 'check_violation';
  end if;
  update public.subscriptions
     set cancel_at_period_end = true, cancelled_at = now(), cancellation_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = v_sub.id;
  perform app.billing_event(p_org, v_sub.id, 'subscription_cancelled',
    jsonb_build_object('reason', left(p_reason, 500), 'access_until', app.subscription_end_at(v_sub), 'at_period_end', true));
  perform app.audit(p_org, 'billing.subscription_cancelled', 'subscriptions', v_sub.id, 'Annulation de l''abonnement NéoScol demandée');
end;
$$;

create or replace function public.billing_resume(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org for update;
  if not v_sub.cancel_at_period_end or v_sub.status in ('CANCELLED', 'EXPIRED') then
    raise exception 'Aucune annulation en attente : souscrivez une formule pour réactiver.' using errcode = 'check_violation';
  end if;
  update public.subscriptions set cancel_at_period_end = false, cancelled_at = null, cancellation_reason = null where id = v_sub.id;
  perform app.billing_event(p_org, v_sub.id, 'subscription_resumed', '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC : serveur uniquement (service role) — fournisseur de paiement
-- -----------------------------------------------------------------------------
create or replace function public.billing_attach_checkout(p_transaction uuid, p_provider_tx text, p_checkout_url text, p_response jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
begin
  update public.payment_transactions
     set provider_transaction_id = p_provider_tx, checkout_url = p_checkout_url, status = 'PROCESSING',
         provider_response = coalesce(p_response, '{}'::jsonb)
   where id = p_transaction and status = 'PENDING'
  returning * into v_tx;
  if v_tx.id is null then
    raise exception 'Transaction introuvable ou déjà traitée.' using errcode = 'no_data_found';
  end if;
  perform app.billing_event(v_tx.organization_id, v_tx.subscription_id, 'checkout_created',
    jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'provider', v_tx.provider, 'mode', v_tx.mode));
end;
$$;

-- Confirmation d'un paiement VÉRIFIÉ auprès du fournisseur par le serveur.
-- Contrôles : fournisseur, mode, référence, montant, devise. Idempotente.
create or replace function public.billing_confirm_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_amount integer, p_currency text,
  p_method text default null, p_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
  v_reason text;
begin
  select * into v_tx from public.payment_transactions
   where provider = p_provider and (internal_reference = p_reference or (p_reference is null and provider_transaction_id = p_provider_tx))
   for update;
  if v_tx.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  v_reason := case
    when v_tx.mode <> p_mode then 'mode_different'
    when p_provider_tx is not null and v_tx.provider_transaction_id is not null and v_tx.provider_transaction_id <> p_provider_tx then 'identifiant_fournisseur_different'
    when p_amount is distinct from v_tx.amount then 'montant_different'
    when p_currency is distinct from v_tx.currency then 'devise_differente'
  end;
  if v_reason is not null then
    update public.payment_transactions
       set provider_response = provider_response || jsonb_build_object('rejected', jsonb_build_object('reason', v_reason, 'at', now(), 'amount', p_amount, 'currency', p_currency))
     where id = v_tx.id;
    perform app.billing_event(v_tx.organization_id, v_tx.subscription_id, 'payment_failed',
      jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'reason', v_reason, 'received_amount', p_amount, 'expected_amount', v_tx.amount));
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'organization_id', v_tx.organization_id, 'transaction_id', v_tx.id);
  end if;
  if v_tx.status = 'SUCCESS' then
    return jsonb_build_object('result', 'duplicate', 'organization_id', v_tx.organization_id, 'transaction_id', v_tx.id);
  end if;
  if v_tx.status = 'REFUNDED' then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_remboursee', 'transaction_id', v_tx.id);
  end if;
  update public.payment_transactions
     set provider_transaction_id = coalesce(provider_transaction_id, p_provider_tx),
         provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb))
   where id = v_tx.id;
  return app.billing_apply_payment(v_tx.id, p_method, null) || jsonb_build_object('transaction_id', v_tx.id);
end;
$$;

-- Échec ou abandon constaté auprès du fournisseur.
create or replace function public.billing_fail_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_status text, p_reason text, p_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
begin
  if p_status not in ('FAILED', 'CANCELLED') then
    raise exception 'Statut invalide.' using errcode = 'check_violation';
  end if;
  select * into v_tx from public.payment_transactions
   where provider = p_provider and mode = p_mode
     and (internal_reference = p_reference or (p_reference is null and provider_transaction_id = p_provider_tx))
   for update;
  if v_tx.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  if v_tx.status not in ('PENDING', 'PROCESSING') then
    return jsonb_build_object('result', 'duplicate', 'status', v_tx.status, 'transaction_id', v_tx.id);
  end if;
  update public.payment_transactions
     set status = p_status, failure_reason = left(p_reason, 300),
         provider_response = provider_response || jsonb_build_object('failure', coalesce(p_response, '{}'::jsonb))
   where id = v_tx.id;
  perform app.billing_event(v_tx.organization_id, v_tx.subscription_id,
    case p_status when 'FAILED' then 'payment_failed' else 'payment_cancelled' end,
    jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'reason', left(p_reason, 300)));
  if p_status = 'FAILED' then
    perform app.billing_notify(v_tx.organization_id, v_tx.subscription_id, null, 'Paiement échoué',
      'Le paiement ' || v_tx.internal_reference || ' n''a pas abouti. Vous pouvez réessayer depuis « Mon abonnement ».');
  end if;
  return jsonb_build_object('result', lower(p_status), 'transaction_id', v_tx.id, 'organization_id', v_tx.organization_id);
end;
$$;

-- Cycle de vie quotidien : statuts d'impayé, fin d'essai, rappels, factures de renouvellement.
create or replace function public.billing_process_lifecycle()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg public.platform_billing_settings;
  s public.subscriptions;
  v_end timestamptz;
  v_days numeric;
  v_left integer;
  v_target text;
  v_rank constant text[] := array['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'EXPIRED'];
  v_plan public.subscription_plans;
  v_changes integer := 0;
  v_notices integer := 0;
  v_invoices integer := 0;
  v_expired_tx integer := 0;
  v_inv public.subscription_invoices;
begin
  select * into cfg from public.platform_billing_settings where id = 1;

  for s in select * from public.subscriptions for update loop
    v_end := app.subscription_end_at(s);
    continue when v_end is null;
    v_days := extract(epoch from (now() - v_end)) / 86400;
    v_left := greatest(0, ceil(-v_days))::int;
    select * into v_plan from public.subscription_plans where id = s.plan_id;

    -- Annulation à échéance.
    if s.cancel_at_period_end and s.status not in ('CANCELLED', 'EXPIRED') and v_days >= 0 then
      update public.subscriptions set status = 'CANCELLED', status_changed_at = now() where id = s.id;
      perform app.billing_notify(s.organization_id, s.id, 'cancelled:' || v_end, 'Abonnement terminé',
        'Votre abonnement a pris fin comme demandé. Vos données sont conservées, en lecture seule. Souscrivez à tout moment pour réactiver.');
      v_changes := v_changes + 1;
      continue;
    end if;

    -- Rappels de fin d'essai : J-7, J-3, J-1, jour J.
    if s.status = 'TRIALING' and v_days < 0 and v_left in (7, 3, 1) then
      if app.billing_notify(s.organization_id, s.id, 'trial:' || v_left || ':' || v_end, 'Essai gratuit : plus que ' || v_left || ' jour(s)',
           'Votre essai gratuit se termine le ' || to_char(v_end at time zone 'UTC', 'DD/MM/YYYY') || '. Choisissez votre formule pour continuer sans interruption.') then
        v_notices := v_notices + 1;
      end if;
    end if;
    if s.status = 'TRIALING' and v_days >= 0 and v_days < 1 then
      if app.billing_notify(s.organization_id, s.id, 'trial:0:' || v_end, 'Votre essai gratuit se termine aujourd''hui',
           'Souscrivez dès maintenant pour conserver l''accès complet. Vos données sont conservées.') then
        v_notices := v_notices + 1;
      end if;
    end if;

    -- Renouvellement : facture et rappel quelques jours avant l'échéance.
    if s.status = 'ACTIVE' and not s.cancel_at_period_end and not s.is_demo and v_days < 0 and v_left <= cfg.renewal_notice_days then
      if not exists (
        select 1 from public.subscription_invoices i
        where i.subscription_id = s.id and i.kind = 'renewal' and i.status in ('PENDING', 'PAID') and i.issued_at >= s.current_period_start
      ) then
        v_inv := app.billing_create_invoice(s.organization_id, v_plan.code, s.billing_interval, 'renewal');
        v_invoices := v_invoices + 1;
      end if;
      if app.billing_notify(s.organization_id, s.id, 'renewal:' || v_end, 'Renouvellement de votre abonnement',
           'Votre abonnement ' || v_plan.name || ' arrive à échéance le ' || to_char(v_end at time zone 'UTC', 'DD/MM/YYYY')
             || '. La facture de renouvellement est disponible dans « Mon abonnement ».') then
        v_notices := v_notices + 1;
      end if;
    end if;

    -- Impayés : progression PAST_DUE → GRACE_PERIOD → RESTRICTED → EXPIRED (jamais de retour arrière ici).
    if s.status in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED') and not s.is_demo and v_days >= 0 then
      v_target := case
        when v_days < cfg.past_due_days then 'PAST_DUE'
        when v_days < cfg.restrict_after_days then 'GRACE_PERIOD'
        when v_days < cfg.expire_after_days then 'RESTRICTED'
        else 'EXPIRED' end;
      if array_position(v_rank, v_target) > coalesce(array_position(v_rank, s.status), 1) then
        update public.subscriptions set status = v_target, status_changed_at = now() where id = s.id;
        perform app.billing_event(s.organization_id, s.id, 'subscription_' || lower(v_target),
          jsonb_build_object('previous_status', s.status, 'due_at', v_end, 'days_overdue', floor(v_days)));
        perform app.billing_notify(s.organization_id, s.id, 'status:' || v_target || ':' || v_end,
          case v_target
            when 'PAST_DUE' then case when s.status = 'TRIALING' then 'Essai gratuit terminé' else 'Abonnement à renouveler' end
            when 'GRACE_PERIOD' then 'Délai de grâce en cours'
            when 'RESTRICTED' then 'Accès restreint : lecture seule'
            else 'Abonnement expiré' end,
          case v_target
            when 'PAST_DUE' then 'Réglez votre abonnement pour éviter toute restriction. Vos données sont conservées.'
            when 'GRACE_PERIOD' then 'Sans paiement, l''établissement passera en lecture seule le '
              || to_char((v_end + make_interval(days => cfg.restrict_after_days)) at time zone 'UTC', 'DD/MM/YYYY') || '.'
            when 'RESTRICTED' then 'L''établissement est en lecture seule jusqu''au paiement. Aucune donnée n''est supprimée ; tout est rétabli dès le paiement confirmé.'
            else 'L''abonnement a expiré. Les données restent conservées et consultables ; un paiement réactive immédiatement l''accès complet.' end);
        v_changes := v_changes + 1;
      end if;
    end if;
  end loop;

  -- Paiements abandonnés : transactions non confirmées au-delà du délai.
  with expired as (
    update public.payment_transactions
       set status = 'CANCELLED', failure_reason = 'Paiement non finalisé dans le délai'
     where status in ('PENDING', 'PROCESSING') and created_at < now() - make_interval(hours => cfg.checkout_expiry_hours)
    returning id, organization_id, subscription_id, internal_reference
  )
  select count(*) into v_expired_tx from (
    select app.billing_event(e.organization_id, e.subscription_id, 'payment_cancelled',
             jsonb_build_object('transaction_id', e.id, 'reference', e.internal_reference, 'reason', 'expiré'))
    from expired e
  ) x;

  return jsonb_build_object('status_changes', v_changes, 'notifications', v_notices, 'renewal_invoices', v_invoices, 'expired_checkouts', v_expired_tx);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC : création d'un établissement par son responsable (inscription publique)
-- Appelée par le serveur (service role) après création du compte utilisateur.
-- -----------------------------------------------------------------------------
create or replace function public.signup_create_organization(
  p_user uuid, p_name text, p_code_base text, p_type public.organization_type, p_city text, p_country text,
  p_phone text, p_email text, p_plan_code text, p_interval text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_org uuid;
  v_membership uuid;
  v_base text := left(regexp_replace(upper(coalesce(p_code_base, '')), '[^A-Z0-9]', '', 'g'), 6);
  v_try integer := 0;
begin
  if length(v_base) < 2 then v_base := 'ECOLE'; end if;
  loop
    v_code := case when v_try = 0 then v_base else left(v_base, 6) || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0') end;
    exit when not exists (select 1 from public.organizations where code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Code établissement indisponible.'; end if;
  end loop;
  insert into public.organizations (name, code, slug, type, city, country, phone, email)
  values (btrim(p_name), v_code, lower(v_code) || '-' || substr(md5(random()::text), 1, 6), p_type,
          nullif(btrim(p_city), ''), coalesce(nullif(upper(p_country), ''), 'CI'), nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''))
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, status, joined_at)
  values (v_org, p_user, 'active', now())
  returning id into v_membership;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  select v_org, v_membership, r.id from public.roles r where r.organization_id = v_org and r.key = 'org_admin';
  update public.profiles set last_organization_id = v_org where id = p_user;

  -- Formule choisie pour l'essai (le trigger a créé l'essai avec la formule par défaut du type).
  if p_plan_code is not null then
    update public.subscriptions s
       set plan_id = p.id, billing_interval = coalesce(p_interval, 'MONTHLY'), monthly_price = p.monthly_price,
           annual_price = p.annual_price, currency = p.currency
      from public.subscription_plans p
     where s.organization_id = v_org and p.code = p_plan_code and p.is_active and s.status = 'TRIALING';
  end if;
  insert into public.subscription_events (organization_id, subscription_id, user_id, event_type, metadata)
  select v_org, s.id, p_user, 'plan_selected', jsonb_build_object('plan', p_plan_code, 'interval', p_interval, 'source', 'inscription')
  from public.subscriptions s where s.organization_id = v_org;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values (v_org, p_user, 'settings.organization_signup', 'organizations', v_org, 'Création de l''établissement par inscription en ligne',
          jsonb_build_object('source', 'signup', 'plan', p_plan_code, 'interval', p_interval));
  return jsonb_build_object('organization_id', v_org, 'code', v_code);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC : console de la plateforme (super administrateur)
-- -----------------------------------------------------------------------------
create or replace function public.platform_billing_overview()
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
  return jsonb_build_object(
    'organizations_active', (select count(*) from public.organizations where status = 'active' and not is_demo),
    'trialing', (select count(*) from public.subscriptions where status = 'TRIALING' and not is_demo),
    'active', (select count(*) from public.subscriptions where status = 'ACTIVE' and not is_demo),
    'unpaid', (select count(*) from public.subscriptions where status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED') and not is_demo),
    'restricted', (select count(*) from public.subscriptions where status = 'RESTRICTED' and not is_demo),
    'expired', (select count(*) from public.subscriptions where status in ('EXPIRED', 'CANCELLED') and not is_demo),
    'demo', (select count(*) from public.subscriptions where is_demo),
    -- Revenu récurrent mensuel (MRR) et annuel (ARR) des abonnements payés actifs, en XOF.
    'mrr', (select coalesce(sum(case billing_interval when 'YEARLY' then annual_price / 12.0 else monthly_price end), 0)::bigint
            from public.subscriptions where status in ('ACTIVE', 'PAST_DUE', 'GRACE_PERIOD') and not is_demo),
    'arr', (select coalesce(sum(case billing_interval when 'YEARLY' then annual_price else monthly_price * 12 end), 0)::bigint
            from public.subscriptions where status in ('ACTIVE', 'PAST_DUE', 'GRACE_PERIOD') and not is_demo),
    'revenue_month', (select coalesce(sum(amount), 0) from public.subscription_payments
                      where mode = 'live' and paid_at >= date_trunc('month', now())),
    'revenue_year', (select coalesce(sum(amount), 0) from public.subscription_payments
                     where mode = 'live' and paid_at >= date_trunc('year', now())),
    'revenue_test', (select coalesce(sum(amount), 0) from public.subscription_payments where mode = 'test'),
    'payments_success', (select count(*) from public.payment_transactions where status = 'SUCCESS'),
    'payments_failed', (select count(*) from public.payment_transactions where status = 'FAILED'),
    'payments_pending', (select count(*) from public.payment_transactions where status in ('PENDING', 'PROCESSING')),
    'webhook_errors', (select count(*) from public.payment_webhooks where processing_status in ('rejected', 'error'))
  );
end;
$$;

-- Facture émise par la plateforme (ex. avant un paiement manuel).
create or replace function public.platform_issue_invoice(p_org uuid, p_plan_code text, p_interval text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.subscription_invoices;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  v_inv := app.billing_create_invoice(p_org, p_plan_code, p_interval, 'manual');
  return v_inv.id;
end;
$$;

-- Paiement manuel (hors plateforme) validé par le super administrateur : montant exact exigé.
create or replace function public.platform_record_manual_payment(p_invoice uuid, p_reference text, p_amount integer, p_method text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.subscription_invoices;
  v_tx public.payment_transactions;
  v_result jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_inv from public.subscription_invoices where id = p_invoice for update;
  if v_inv.id is null then
    raise exception 'Facture introuvable.' using errcode = 'no_data_found';
  end if;
  if v_inv.status not in ('PENDING', 'FAILED') then
    raise exception 'Cette facture n''est pas en attente de paiement.' using errcode = 'check_violation';
  end if;
  if p_amount is distinct from v_inv.amount then
    raise exception 'Montant différent de la facture (% % attendus).', v_inv.amount, v_inv.currency using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Référence du paiement obligatoire.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payment_transactions where provider = 'manual' and mode = 'live' and provider_transaction_id = left(btrim(p_reference), 120)) then
    raise exception 'Cette référence de paiement a déjà été enregistrée : un même versement ne peut pas être compté deux fois.' using errcode = 'unique_violation';
  end if;
  insert into public.payment_transactions (organization_id, subscription_id, invoice_id, provider, mode, provider_transaction_id,
                                           internal_reference, amount, currency, status, payment_method, created_by, provider_response)
  values (v_inv.organization_id, v_inv.subscription_id, v_inv.id, 'manual', 'live', left(btrim(p_reference), 120),
          'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          v_inv.amount, v_inv.currency, 'PROCESSING', left(coalesce(nullif(btrim(p_method), ''), 'manuel'), 60), auth.uid(),
          jsonb_build_object('manual', true, 'external_reference', left(btrim(p_reference), 120)))
  returning * into v_tx;
  v_result := app.billing_apply_payment(v_tx.id, v_tx.payment_method, auth.uid(), left(p_note, 500));
  perform app.billing_event(v_inv.organization_id, v_inv.subscription_id, 'manual_payment',
    jsonb_build_object('transaction_id', v_tx.id, 'invoice_number', v_inv.invoice_number, 'external_reference', left(btrim(p_reference), 120),
                       'amount', p_amount, 'validated_by', auth.uid(), 'validated_by_email', auth.jwt() ->> 'email'));
  perform app.audit(v_inv.organization_id, 'billing.manual_payment', 'payment_transactions', v_tx.id,
    'Paiement manuel validé par la plateforme : ' || v_inv.invoice_number);
  return v_result || jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference);
end;
$$;

create or replace function public.platform_update_plan(p_plan uuid, p_description text, p_audience text, p_is_active boolean, p_features jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.subscription_plans
     set description = left(nullif(btrim(p_description), ''), 1000), audience = left(nullif(btrim(p_audience), ''), 200), is_active = p_is_active
   where id = p_plan;
  if not found then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  if p_features is not null then
    for v_key in select jsonb_object_keys(p_features) loop
      update public.subscription_features set enabled = (p_features ->> v_key)::boolean
       where plan_id = p_plan and feature_code = v_key;
    end loop;
  end if;
end;
$$;

create or replace function public.platform_update_billing_settings(p_past_due integer, p_restrict integer, p_expire integer, p_renewal_notice integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.platform_billing_settings
     set past_due_days = p_past_due, restrict_after_days = p_restrict, expire_after_days = p_expire,
         renewal_notice_days = p_renewal_notice, updated_at = now(), updated_by = auth.uid()
   where id = 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function public.billing_access_state(uuid) from public, anon;
revoke execute on function public.billing_start_checkout(uuid, text, text, text, text) from public, anon;
revoke execute on function public.billing_change_trial_plan(uuid, text, text) from public, anon;
revoke execute on function public.billing_cancel(uuid, text) from public, anon;
revoke execute on function public.billing_resume(uuid) from public, anon;
revoke execute on function public.platform_billing_overview() from public, anon;
revoke execute on function public.platform_issue_invoice(uuid, text, text) from public, anon;
revoke execute on function public.platform_record_manual_payment(uuid, text, integer, text, text) from public, anon;
revoke execute on function public.platform_update_plan(uuid, text, text, boolean, jsonb) from public, anon;
revoke execute on function public.platform_update_billing_settings(integer, integer, integer, integer) from public, anon;
grant execute on function public.billing_access_state(uuid) to authenticated;
grant execute on function public.billing_start_checkout(uuid, text, text, text, text) to authenticated;
grant execute on function public.billing_change_trial_plan(uuid, text, text) to authenticated;
grant execute on function public.billing_cancel(uuid, text) to authenticated;
grant execute on function public.billing_resume(uuid) to authenticated;
grant execute on function public.platform_billing_overview() to authenticated;
grant execute on function public.platform_issue_invoice(uuid, text, text) to authenticated;
grant execute on function public.platform_record_manual_payment(uuid, text, integer, text, text) to authenticated;
grant execute on function public.platform_update_plan(uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.platform_update_billing_settings(integer, integer, integer, integer) to authenticated;

-- Serveur uniquement : confirmation des paiements, cycle de vie, inscription.
revoke execute on function public.billing_attach_checkout(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_confirm_payment(text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_fail_payment(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_process_lifecycle() from public, anon, authenticated;
revoke execute on function public.signup_create_organization(uuid, text, text, public.organization_type, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_attach_checkout(uuid, text, text, jsonb) to service_role;
grant execute on function public.billing_confirm_payment(text, text, text, text, integer, text, text, jsonb) to service_role;
grant execute on function public.billing_fail_payment(text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.billing_process_lifecycle() to service_role;
grant execute on function public.signup_create_organization(uuid, text, text, public.organization_type, text, text, text, text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- RLS : lecture seule côté établissement (billing.read), tout pour la plateforme.
-- Aucune écriture directe : uniquement par les fonctions ci-dessus.
-- -----------------------------------------------------------------------------
alter table public.platform_billing_settings enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscription_features enable row level security;
alter table public.payment_providers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_events enable row level security;
alter table public.payment_webhooks enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.payment_simulations enable row level security;

-- Offre publique (page Tarifs, inscription) : formules actives lisibles sans connexion.
grant select on public.subscription_plans, public.subscription_features to anon;
create policy plans_public_read on public.subscription_plans for select to anon using (is_active);
create policy features_public_read on public.subscription_features for select to anon
  using (exists (select 1 from public.subscription_plans p where p.id = plan_id and p.is_active));
create policy plans_read on public.subscription_plans for select to authenticated
  using (is_active or (select app.is_platform_admin()));
create policy features_read on public.subscription_features for select to authenticated
  using (exists (select 1 from public.subscription_plans p where p.id = plan_id and (p.is_active or (select app.is_platform_admin()))));
create policy providers_read on public.payment_providers for select to authenticated using (true);
create policy billing_settings_read on public.platform_billing_settings for select to authenticated using (true);

create policy subscriptions_read on public.subscriptions for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('billing.read'))::uuid[]) or (select app.is_platform_admin()));
create policy subscription_invoices_read on public.subscription_invoices for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('billing.read'))::uuid[]) or (select app.is_platform_admin()));
create policy payment_transactions_read on public.payment_transactions for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('billing.read'))::uuid[]) or (select app.is_platform_admin()));
create policy subscription_payments_read on public.subscription_payments for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('billing.read'))::uuid[]) or (select app.is_platform_admin()));
create policy subscription_events_read on public.subscription_events for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('billing.read'))::uuid[]) or (select app.is_platform_admin()));
create policy payment_webhooks_read on public.payment_webhooks for select to authenticated
  using ((select app.is_platform_admin()));
create policy payment_provider_events_read on public.payment_provider_events for select to authenticated
  using ((select app.is_platform_admin()));

revoke insert, update, delete, truncate on public.platform_billing_settings, public.subscription_plans, public.subscription_features,
  public.payment_providers, public.subscriptions, public.subscription_invoices, public.payment_transactions,
  public.subscription_payments, public.subscription_events, public.payment_webhooks, public.payment_provider_events,
  public.payment_simulations
  from anon, authenticated;
revoke select on public.payment_simulations from anon, authenticated;
revoke all on sequence public.subscription_invoice_number_seq, public.payment_reference_seq from anon, authenticated;
