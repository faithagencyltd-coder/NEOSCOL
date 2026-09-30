-- =============================================================================
-- SMS payants.
--   - Le Super Admin fixe le prix d'un SMS (par défaut, par pays, ou pour un
--     établissement), avec historique ; il active ou non la facturation.
--   - L'établissement achète du crédit SMS avec le même système de paiement que
--     l'abonnement (vérification serveur, idempotence) ; chaque SMS envoyé
--     consomme du crédit (un SMS long compte pour plusieurs), un échec chez
--     l'opérateur est recrédité.
--   - Le crédit est compté en SMS : un changement de prix ne touche jamais le
--     crédit déjà acheté.
-- =============================================================================

create table public.platform_sms_pricing (
  id smallint primary key default 1 check (id = 1),
  billing_enabled boolean not null default false,
  default_price integer not null default 25 check (default_price between 1 and 100000),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  min_purchase integer not null default 100 check (min_purchase between 1 and 1000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_sms_pricing (id) values (1);

create table public.sms_country_prices (
  country_code text primary key references public.countries (code) on delete cascade,
  price integer not null check (price between 1 and 100000),
  updated_at timestamptz not null default now()
);

create table public.sms_org_prices (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  price integer not null check (price between 1 and 100000),
  note text check (note is null or char_length(note) <= 300),
  updated_at timestamptz not null default now()
);

create table public.sms_price_history (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('default', 'country', 'organization')),
  target text,
  old_price integer,
  new_price integer,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create table public.sms_wallets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.sms_wallet_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (reason in ('purchase', 'send', 'refund', 'grant', 'adjustment')),
  reference text check (reference is null or char_length(reference) <= 120),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index sms_wallet_movements_org on public.sms_wallet_movements (organization_id, created_at desc);

create table public.sms_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  internal_reference text not null unique check (internal_reference ~ '^NEO-[0-9]{4}-[0-9]{6,}$'),
  provider text not null,
  mode text not null check (mode in ('test', 'live')),
  sms_count integer not null check (sms_count > 0),
  unit_price integer not null check (unit_price > 0),
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  provider_transaction_id text,
  checkout_url text,
  payment_method text,
  failure_reason text,
  provider_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (amount = sms_count * unit_price)
);
create index sms_credit_purchases_org on public.sms_credit_purchases (organization_id, created_at desc);
create unique index sms_credit_purchases_provider_tx on public.sms_credit_purchases (provider, provider_transaction_id) where provider_transaction_id is not null;

-- Nouveaux statuts d'envoi : bloqué faute de crédit, ou SMS non inclus dans la formule.
alter table public.message_deliveries drop constraint message_deliveries_status_check;
alter table public.message_deliveries add constraint message_deliveries_status_check
  check (status in ('sent', 'failed', 'blocked_quota', 'not_configured', 'blocked_credit', 'blocked_plan'));

-- Lecture : l'établissement voit son crédit, ses achats et ses mouvements ; la plateforme voit tout.
alter table public.platform_sms_pricing enable row level security;
alter table public.sms_country_prices enable row level security;
alter table public.sms_org_prices enable row level security;
alter table public.sms_price_history enable row level security;
alter table public.sms_wallets enable row level security;
alter table public.sms_wallet_movements enable row level security;
alter table public.sms_credit_purchases enable row level security;
revoke all on public.platform_sms_pricing, public.sms_country_prices, public.sms_org_prices, public.sms_price_history,
  public.sms_wallets, public.sms_wallet_movements, public.sms_credit_purchases from anon, authenticated;
grant select on public.platform_sms_pricing, public.sms_country_prices, public.sms_org_prices, public.sms_price_history,
  public.sms_wallets, public.sms_wallet_movements, public.sms_credit_purchases to authenticated;
create policy sms_pricing_read on public.platform_sms_pricing for select to authenticated using (true);
create policy sms_country_prices_read on public.sms_country_prices for select to authenticated using ((select app.is_platform_admin()));
create policy sms_org_prices_read on public.sms_org_prices for select to authenticated using ((select app.is_platform_admin()));
create policy sms_price_history_read on public.sms_price_history for select to authenticated using ((select app.is_platform_admin()));
create policy sms_wallets_read on public.sms_wallets for select to authenticated
  using ((select app.is_platform_admin()) or organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[])
         or organization_id = any ((select app.permitted_org_ids('billing.manage'))::uuid[]));
create policy sms_movements_read on public.sms_wallet_movements for select to authenticated
  using ((select app.is_platform_admin()) or organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[])
         or organization_id = any ((select app.permitted_org_ids('billing.manage'))::uuid[]));
create policy sms_purchases_read on public.sms_credit_purchases for select to authenticated
  using ((select app.is_platform_admin()) or organization_id = any ((select app.permitted_org_ids('billing.manage'))::uuid[]));

-- -----------------------------------------------------------------------------
-- Prix et devis
-- -----------------------------------------------------------------------------
create or replace function app.sms_unit_price(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select price from public.sms_org_prices where organization_id = p_org),
    (select c.price from public.sms_country_prices c join public.organizations o on o.country = c.country_code where o.id = p_org),
    (select default_price from public.platform_sms_pricing where id = 1));
$$;

-- Devis avant envoi : nombre de SMS × prix d'un SMS, crédit disponible, manque éventuel.
create or replace function public.sms_quote(p_org uuid, p_sms integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set public.platform_sms_pricing;
  v_price integer;
  v_balance integer;
  v_needed integer := greatest(coalesce(p_sms, 0), 0);
begin
  if not (app.has_permission(p_org, 'communication.send') or app.has_permission(p_org, 'billing.manage') or app.is_platform_admin()) then
    raise exception 'Permission refusée : SMS.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_set from public.platform_sms_pricing where id = 1;
  v_price := app.sms_unit_price(p_org);
  select coalesce((select balance from public.sms_wallets where organization_id = p_org), 0) into v_balance;
  return jsonb_build_object(
    'billing_enabled', v_set.billing_enabled,
    'included_in_plan', app.org_plan_allows(p_org, 'sms'),
    'unit_price', v_price,
    'currency', v_set.currency,
    'min_purchase', v_set.min_purchase,
    'balance', v_balance,
    'sms', v_needed,
    'amount', v_needed * v_price,
    'missing', case when v_set.billing_enabled then greatest(v_needed - v_balance, 0) else 0 end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Consommation (serveur uniquement, clé de service)
-- -----------------------------------------------------------------------------
create or replace function app.sms_move(p_org uuid, p_delta integer, p_reason text, p_reference text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  insert into public.sms_wallets (organization_id) values (p_org) on conflict (organization_id) do nothing;
  update public.sms_wallets set balance = balance + p_delta, updated_at = now()
   where organization_id = p_org and balance + p_delta >= 0
  returning balance into v_balance;
  if v_balance is null then
    return null; -- crédit insuffisant
  end if;
  insert into public.sms_wallet_movements (organization_id, delta, balance_after, reason, reference, note, created_by)
  values (p_org, p_delta, v_balance, p_reason, left(p_reference, 120), left(p_note, 300), auth.uid());
  return v_balance;
end;
$$;

-- Débit d'un envoi : sans facturation active, rien n'est décompté ; SMS hors formule refusés.
create or replace function public.sms_debit(p_org uuid, p_count integer, p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_sms_pricing;
  v_balance integer;
begin
  if coalesce(p_count, 0) <= 0 then
    raise exception 'Nombre de SMS invalide.' using errcode = 'check_violation';
  end if;
  if not app.org_plan_allows(p_org, 'sms') then
    return jsonb_build_object('ok', false, 'reason', 'plan');
  end if;
  select * into v_set from public.platform_sms_pricing where id = 1;
  if not v_set.billing_enabled then
    return jsonb_build_object('ok', true, 'billed', false);
  end if;
  v_balance := app.sms_move(p_org, -p_count, 'send', p_reference);
  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'credit', 'balance', coalesce((select balance from public.sms_wallets where organization_id = p_org), 0));
  end if;
  return jsonb_build_object('ok', true, 'billed', true, 'balance', v_balance);
end;
$$;

-- Recrédit d'un SMS débité puis refusé par l'opérateur.
create or replace function public.sms_refund(p_org uuid, p_count integer, p_reference text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.sms_move(p_org, p_count, 'refund', p_reference, 'SMS non délivré par l''opérateur : recrédité') where coalesce(p_count, 0) > 0;
$$;

-- -----------------------------------------------------------------------------
-- Achat de crédit (même circuit que les autres paiements)
-- -----------------------------------------------------------------------------
create or replace function public.sms_credit_start_checkout(p_org uuid, p_sms integer, p_provider text, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set public.platform_sms_pricing;
  v_price integer;
  v_pay public.sms_credit_purchases;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission refusée : achat de crédit SMS (gestion de l''abonnement).' using errcode = 'insufficient_privilege';
  end if;
  select * into v_set from public.platform_sms_pricing where id = 1;
  if not v_set.billing_enabled then
    raise exception 'Les SMS ne sont pas facturés actuellement : aucun achat nécessaire.' using errcode = 'check_violation';
  end if;
  if not app.org_plan_allows(p_org, 'sms') then
    raise exception 'L''envoi de SMS n''est pas inclus dans votre formule.' using errcode = 'check_violation';
  end if;
  if coalesce(p_sms, 0) < v_set.min_purchase or p_sms > 1000000 then
    raise exception 'Achat minimum : % SMS.', v_set.min_purchase using errcode = 'check_violation';
  end if;
  if p_mode not in ('test', 'live') then
    raise exception 'Mode de paiement invalide.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.payment_providers where code = p_provider and is_active and code not in ('manual', 'offline')) then
    raise exception 'Fournisseur de paiement indisponible.' using errcode = 'check_violation';
  end if;
  v_price := app.sms_unit_price(p_org);
  update public.sms_credit_purchases
     set status = 'CANCELLED', failure_reason = 'Remplacé par un nouveau paiement'
   where organization_id = p_org and status in ('PENDING', 'PROCESSING') and provider = p_provider and mode = p_mode;
  insert into public.sms_credit_purchases (organization_id, internal_reference, provider, mode, sms_count, unit_price, amount, currency, created_by)
  values (p_org, 'NEO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.payment_reference_seq')::text, 6, '0'),
          p_provider, p_mode, p_sms, v_price, p_sms * v_price, v_set.currency, auth.uid())
  returning * into v_pay;
  perform app.audit(p_org, 'sms.checkout', 'sms_credit_purchases', v_pay.id,
    'Achat de ' || p_sms || ' SMS commencé (' || v_pay.amount || ' ' || v_pay.currency || ')');
  return jsonb_build_object('payment_id', v_pay.id, 'reference', v_pay.internal_reference, 'sms', v_pay.sms_count,
                            'unit_price', v_pay.unit_price, 'amount', v_pay.amount, 'currency', v_pay.currency);
end;
$$;

create or replace function public.sms_credit_attach_checkout(p_payment uuid, p_provider_tx text, p_checkout_url text, p_response jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sms_credit_purchases
     set provider_transaction_id = p_provider_tx, checkout_url = p_checkout_url, status = 'PROCESSING',
         provider_response = provider_response || jsonb_build_object('checkout', coalesce(p_response, '{}'::jsonb))
   where id = p_payment and status = 'PENDING';
$$;

create or replace function public.sms_credit_confirm_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_amount integer, p_currency text,
  p_method text default null, p_response jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.sms_credit_purchases;
  v_reason text;
  v_balance integer;
begin
  select * into v_pay from public.sms_credit_purchases
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
    update public.sms_credit_purchases
       set provider_response = provider_response || jsonb_build_object('rejected', jsonb_build_object('reason', v_reason, 'at', now(), 'amount', p_amount, 'currency', p_currency))
     where id = v_pay.id;
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
  end if;
  if v_pay.status = 'SUCCESS' then
    return jsonb_build_object('result', 'duplicate', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
  end if;
  v_balance := app.sms_move(v_pay.organization_id, v_pay.sms_count, 'purchase', v_pay.internal_reference);
  update public.sms_credit_purchases
     set status = 'SUCCESS', paid_at = now(), payment_method = left(coalesce(p_method, payment_method), 60),
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_tx), failure_reason = null,
         provider_response = provider_response || jsonb_build_object('confirmation', coalesce(p_response, '{}'::jsonb))
   where id = v_pay.id;
  perform app.audit(v_pay.organization_id, 'sms.paid', 'sms_credit_purchases', v_pay.id,
    v_pay.sms_count || ' SMS achetés (' || v_pay.amount || ' ' || v_pay.currency || ') : crédit ' || v_balance || ' SMS',
    jsonb_build_object('reference', v_pay.internal_reference, 'amount', v_pay.amount));
  return jsonb_build_object('result', 'confirmed', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id, 'balance', v_balance);
end;
$$;

create or replace function public.sms_credit_fail_payment(
  p_provider text, p_mode text, p_provider_tx text, p_reference text, p_status text, p_reason text, p_response jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.sms_credit_purchases;
begin
  select * into v_pay from public.sms_credit_purchases
   where provider = p_provider and (internal_reference = p_reference or (p_reference is null and provider_transaction_id = p_provider_tx))
   for update;
  if v_pay.id is null then
    return jsonb_build_object('result', 'rejected', 'reason', 'transaction_inconnue');
  end if;
  if v_pay.status in ('SUCCESS', 'FAILED', 'CANCELLED') then
    return jsonb_build_object('result', 'duplicate', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
  end if;
  update public.sms_credit_purchases
     set status = case when p_status = 'CANCELLED' then 'CANCELLED' else 'FAILED' end, failure_reason = left(p_reason, 300),
         provider_response = provider_response || jsonb_build_object('failure', coalesce(p_response, '{}'::jsonb))
   where id = v_pay.id;
  return jsonb_build_object('result', 'updated', 'organization_id', v_pay.organization_id, 'payment_id', v_pay.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Console Super Admin
-- -----------------------------------------------------------------------------
create or replace function public.platform_save_sms_pricing(p_enabled boolean, p_default_price integer, p_min_purchase integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.platform_sms_pricing;
begin
  perform app.require_platform_admin();
  if p_default_price is null or p_default_price not between 1 and 100000 then
    raise exception 'Prix d''un SMS invalide (1 à 100 000).' using errcode = 'check_violation';
  end if;
  if p_min_purchase is null or p_min_purchase not between 1 and 1000000 then
    raise exception 'Achat minimum invalide.' using errcode = 'check_violation';
  end if;
  select * into v_before from public.platform_sms_pricing where id = 1;
  update public.platform_sms_pricing
     set billing_enabled = coalesce(p_enabled, false), default_price = p_default_price, min_purchase = p_min_purchase,
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  if v_before.default_price is distinct from p_default_price then
    insert into public.sms_price_history (scope, target, old_price, new_price, changed_by) values ('default', null, v_before.default_price, p_default_price, auth.uid());
  end if;
  perform app.audit(null, 'platform.sms_pricing', 'platform_sms_pricing', null,
    'SMS : ' || case when p_enabled then 'facturés' else 'non facturés' end || ', ' || p_default_price || ' ' || v_before.currency || ' le SMS',
    jsonb_build_object('before', to_jsonb(v_before) - 'updated_by', 'enabled', p_enabled, 'default_price', p_default_price, 'min_purchase', p_min_purchase));
end;
$$;

create or replace function public.platform_set_country_sms_price(p_country text, p_price integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer;
begin
  perform app.require_platform_admin();
  select price into v_old from public.sms_country_prices where country_code = p_country;
  if p_price is null then
    delete from public.sms_country_prices where country_code = p_country;
  else
    if p_price not between 1 and 100000 then
      raise exception 'Prix d''un SMS invalide (1 à 100 000).' using errcode = 'check_violation';
    end if;
    insert into public.sms_country_prices (country_code, price) values (p_country, p_price)
    on conflict (country_code) do update set price = excluded.price, updated_at = now();
  end if;
  insert into public.sms_price_history (scope, target, old_price, new_price, changed_by) values ('country', p_country, v_old, p_price, auth.uid());
  perform app.audit(null, 'platform.sms_pricing', 'sms_country_prices', null,
    'Prix du SMS pour ' || p_country || ' : ' || coalesce(p_price::text, 'prix par défaut'), jsonb_build_object('old', v_old, 'new', p_price));
end;
$$;

create or replace function public.platform_set_org_sms_price(p_org uuid, p_price integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer;
begin
  perform app.require_platform_admin();
  select price into v_old from public.sms_org_prices where organization_id = p_org;
  if p_price is null then
    delete from public.sms_org_prices where organization_id = p_org;
  else
    if p_price not between 1 and 100000 then
      raise exception 'Prix d''un SMS invalide (1 à 100 000).' using errcode = 'check_violation';
    end if;
    insert into public.sms_org_prices (organization_id, price, note) values (p_org, p_price, left(nullif(btrim(p_note), ''), 300))
    on conflict (organization_id) do update set price = excluded.price, note = excluded.note, updated_at = now();
  end if;
  insert into public.sms_price_history (scope, target, old_price, new_price, changed_by) values ('organization', p_org::text, v_old, p_price, auth.uid());
  perform app.audit(p_org, 'platform.sms_pricing', 'sms_org_prices', p_org,
    'Prix particulier du SMS : ' || coalesce(p_price::text, 'retiré'), jsonb_build_object('old', v_old, 'new', p_price));
end;
$$;

-- Crédit offert ou correction par la plateforme (motif obligatoire, tracé).
create or replace function public.platform_adjust_sms_credit(p_org uuid, p_delta integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  perform app.require_platform_admin();
  if coalesce(p_delta, 0) = 0 or abs(p_delta) > 1000000 then
    raise exception 'Nombre de SMS invalide.' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif.' using errcode = 'check_violation';
  end if;
  v_balance := app.sms_move(p_org, p_delta, case when p_delta > 0 then 'grant' else 'adjustment' end, null, btrim(p_reason));
  if v_balance is null then
    raise exception 'Le crédit ne peut pas devenir négatif.' using errcode = 'check_violation';
  end if;
  perform app.audit(p_org, 'platform.sms_credit', 'sms_wallets', p_org,
    case when p_delta > 0 then p_delta || ' SMS offerts' else (-p_delta) || ' SMS retirés' end || ' : ' || btrim(p_reason),
    jsonb_build_object('delta', p_delta, 'balance', v_balance));
  return v_balance;
end;
$$;

revoke execute on function public.sms_quote(uuid, integer), public.sms_debit(uuid, integer, text), public.sms_refund(uuid, integer, text),
  public.sms_credit_start_checkout(uuid, integer, text, text), public.sms_credit_attach_checkout(uuid, text, text, jsonb),
  public.sms_credit_confirm_payment(text, text, text, text, integer, text, text, jsonb), public.sms_credit_fail_payment(text, text, text, text, text, text, jsonb),
  public.platform_save_sms_pricing(boolean, integer, integer), public.platform_set_country_sms_price(text, integer),
  public.platform_set_org_sms_price(uuid, integer, text), public.platform_adjust_sms_credit(uuid, integer, text),
  app.sms_unit_price(uuid), app.sms_move(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.sms_quote(uuid, integer), public.sms_credit_start_checkout(uuid, integer, text, text),
  public.platform_save_sms_pricing(boolean, integer, integer), public.platform_set_country_sms_price(text, integer),
  public.platform_set_org_sms_price(uuid, integer, text), public.platform_adjust_sms_credit(uuid, integer, text) to authenticated;
-- Service serveur uniquement (clé de service) : jamais appelables depuis le navigateur.
grant execute on function public.sms_debit(uuid, integer, text), public.sms_refund(uuid, integer, text),
  public.sms_credit_attach_checkout(uuid, text, text, jsonb), public.sms_credit_confirm_payment(text, text, text, text, integer, text, text, jsonb),
  public.sms_credit_fail_payment(text, text, text, text, text, text, jsonb) to service_role;
