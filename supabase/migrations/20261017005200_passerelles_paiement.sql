-- =============================================================================
-- Passerelles de paiement réglables par le Super Admin, sans toucher au code :
-- plusieurs agrégateurs (PayDunya, CinetPay, FedaPay, Flutterwave, Paystack,
-- Stripe, Wave) + « paiement par transfert » universel (Mobile Money, virement,
-- lien de paiement de n'importe quel fournisseur), validé par le Super Admin.
-- Clés chiffrées par le serveur (jamais lisibles par le navigateur), mode
-- test / réel, passerelle par défaut, choix du client au moment de payer.
-- Aucune donnée existante n'est modifiée ; la configuration par variables
-- d'environnement reste utilisée tant qu'aucune passerelle n'est activée ici.
-- =============================================================================

insert into public.payment_providers (code, name, description, supports_refund) values
  ('cinetpay', 'CinetPay', 'Mobile Money et cartes en Afrique de l''Ouest et centrale (Orange, MTN, Moov, Wave…).', false),
  ('fedapay', 'FedaPay', 'Mobile Money et cartes au Bénin, Togo, Côte d''Ivoire, Sénégal, Niger…', false),
  ('flutterwave', 'Flutterwave', 'Cartes, Mobile Money et virements dans de nombreux pays africains.', false),
  ('paystack', 'Paystack', 'Cartes et Mobile Money (Nigeria, Ghana, Côte d''Ivoire, Afrique du Sud, Kenya).', false),
  ('stripe', 'Stripe', 'Cartes bancaires internationales (Visa, Mastercard…).', false),
  ('wave', 'Wave', 'Paiement Wave (Sénégal, Côte d''Ivoire…) via l''API Wave Business.', false),
  ('offline', 'Paiement par transfert', 'Mobile Money, virement ou lien de paiement de votre choix ; confirmé par l''administration NeoScool.', false)
on conflict (code) do nothing;

create table public.payment_gateway_settings (
  provider text primary key references public.payment_providers (code),
  checkout_enabled boolean not null default false,
  mode text not null default 'test' check (mode in ('test', 'live')),
  is_default boolean not null default false,
  sort_order integer not null default 100,
  public_label text check (public_label is null or char_length(public_label) <= 80),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  secret_ciphertext text,
  secret_hint text check (secret_hint is null or char_length(secret_hint) <= 40),
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (provider not in ('simulation', 'manual'))
);
create unique index payment_gateway_settings_one_default on public.payment_gateway_settings (is_default) where is_default;
comment on column public.payment_gateway_settings.secret_ciphertext is
  'Clés secrètes (JSON) chiffrées côté serveur (AES-256-GCM). Jamais lisibles par le navigateur.';

insert into public.payment_gateway_settings (provider, sort_order, public_label) values
  ('paydunya', 10, 'Mobile Money / carte (PayDunya)'),
  ('cinetpay', 20, 'Mobile Money / carte (CinetPay)'),
  ('fedapay', 30, 'Mobile Money / carte (FedaPay)'),
  ('flutterwave', 40, 'Carte / Mobile Money (Flutterwave)'),
  ('paystack', 50, 'Carte / Mobile Money (Paystack)'),
  ('stripe', 60, 'Carte bancaire (Stripe)'),
  ('wave', 70, 'Wave'),
  ('offline', 90, 'Paiement par transfert (Mobile Money, virement)');

alter table public.payment_gateway_settings enable row level security;
revoke all on public.payment_gateway_settings from anon, authenticated;
create policy payment_gateway_settings_platform on public.payment_gateway_settings for select to authenticated using (app.is_platform_admin());
grant select (provider, checkout_enabled, mode, is_default, sort_order, public_label, instructions, config, secret_hint,
              last_test_at, last_test_ok, last_test_message, updated_by, updated_at)
  on public.payment_gateway_settings to authenticated;
grant select on public.payment_gateway_settings to service_role;

-- Réglage d'une passerelle (Super Admin). p_secret_ciphertext : déjà chiffré par
-- le serveur ; null = clés inchangées ; p_clear_secret = true supprime les clés.
create or replace function public.platform_update_payment_gateway(
  p_provider text, p_checkout_enabled boolean, p_mode text, p_is_default boolean, p_public_label text,
  p_instructions text, p_config jsonb, p_secret_ciphertext text default null, p_secret_hint text default null,
  p_clear_secret boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.payment_gateway_settings;
  v_enabled boolean;
begin
  perform app.require_platform_admin();
  select * into v_row from public.payment_gateway_settings where provider = p_provider for update;
  if v_row.provider is null then
    raise exception 'Passerelle de paiement inconnue.' using errcode = 'invalid_parameter_value';
  end if;
  if p_mode not in ('test', 'live') then
    raise exception 'Mode invalide (test ou réel).' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' or length(coalesce(p_config, '{}'::jsonb)::text) > 4000 then
    raise exception 'Configuration invalide.' using errcode = 'invalid_parameter_value';
  end if;
  if p_secret_ciphertext is not null and p_secret_ciphertext !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'Les clés doivent être chiffrées par le serveur.' using errcode = 'invalid_parameter_value';
  end if;
  v_enabled := p_checkout_enabled and not (p_clear_secret and p_provider <> 'offline');
  if v_enabled and p_provider <> 'offline' and coalesce(p_secret_ciphertext, case when p_clear_secret then null else v_row.secret_ciphertext end) is null then
    raise exception 'Renseignez les clés de cette passerelle avant de la proposer aux clients.' using errcode = 'check_violation';
  end if;
  if v_enabled and p_provider = 'offline' and char_length(btrim(coalesce(p_instructions, ''))) < 10 then
    raise exception 'Indiquez aux clients comment payer (numéro Mobile Money, compte bancaire ou lien de paiement).' using errcode = 'check_violation';
  end if;
  if p_is_default and not v_enabled then
    raise exception 'Seule une passerelle proposée aux clients peut être la passerelle par défaut.' using errcode = 'check_violation';
  end if;
  if p_is_default then
    update public.payment_gateway_settings set is_default = false where is_default and provider <> p_provider;
  end if;
  update public.payment_gateway_settings set
    checkout_enabled = v_enabled,
    mode = p_mode,
    is_default = p_is_default,
    public_label = nullif(btrim(coalesce(p_public_label, '')), ''),
    instructions = nullif(btrim(coalesce(p_instructions, '')), ''),
    config = coalesce(p_config, '{}'::jsonb),
    secret_ciphertext = case when p_clear_secret then null else coalesce(p_secret_ciphertext, secret_ciphertext) end,
    secret_hint = case when p_clear_secret then null when p_secret_ciphertext is not null then p_secret_hint else secret_hint end,
    last_test_at = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode then null else last_test_at end,
    last_test_ok = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode then null else last_test_ok end,
    last_test_message = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode then null else last_test_message end,
    updated_by = auth.uid(),
    updated_at = now()
  where provider = p_provider;
  perform app.audit(null, 'platform.payment_gateway_updated', 'payment_gateway_settings', null,
    'Passerelle ' || p_provider || case when v_enabled then ' proposée aux clients' else ' non proposée' end
      || ' (mode ' || case when p_mode = 'live' then 'réel' else 'test' end || ')'
      || case when p_is_default then ', par défaut' else '' end
      || case when p_secret_ciphertext is not null then ' — clés remplacées' when p_clear_secret then ' — clés supprimées' else '' end,
    jsonb_build_object('provider', p_provider, 'enabled', v_enabled, 'mode', p_mode, 'default', p_is_default,
                       'secret_changed', p_secret_ciphertext is not null or p_clear_secret), 'success');
end;
$$;

create or replace function public.platform_record_gateway_test(p_provider text, p_ok boolean, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.payment_gateway_settings
     set last_test_at = now(), last_test_ok = p_ok, last_test_message = left(coalesce(p_message, ''), 500)
   where provider = p_provider;
end;
$$;

-- Passerelles proposées au moment de payer (sans aucune clé ni configuration).
create or replace function public.available_payment_gateways()
returns table (provider text, label text, mode text, is_default boolean, instructions text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.provider, coalesce(g.public_label, p.name), g.mode, g.is_default,
         case when g.provider = 'offline' then g.instructions end, g.sort_order
    from public.payment_gateway_settings g
    join public.payment_providers p on p.code = g.provider and p.is_active
   where g.checkout_enabled
   order by g.is_default desc, g.sort_order, g.provider;
$$;

-- Le client déclare avoir payé par transfert : référence de son paiement,
-- en attente de validation par le Super Admin. Rien n'est activé ici.
create or replace function public.billing_declare_offline_payment(p_reference text, p_declared_reference text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions where internal_reference = p_reference and provider = 'offline' for update;
  if v_tx.id is null or not app.has_permission(v_tx.organization_id, 'billing.manage') then
    raise exception 'Paiement introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_tx.status not in ('PENDING', 'PROCESSING') then
    raise exception 'Ce paiement est déjà traité.' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_declared_reference, ''))) < 3 or char_length(p_declared_reference) > 120 then
    raise exception 'Indiquez la référence de votre paiement (numéro de transaction Mobile Money, virement…).' using errcode = 'check_violation';
  end if;
  update public.payment_transactions
     set status = 'PROCESSING',
         provider_response = provider_response || jsonb_build_object('declaration', jsonb_build_object(
           'reference', btrim(p_declared_reference), 'note', left(btrim(coalesce(p_note, '')), 500), 'at', now(), 'by', auth.uid())),
         updated_at = now()
   where id = v_tx.id;
  perform app.audit(v_tx.organization_id, 'billing.offline_declared', 'payment_transactions', v_tx.id,
    'Paiement par transfert déclaré (' || v_tx.internal_reference || ')', jsonb_build_object('reference', v_tx.internal_reference), 'success');
  return jsonb_build_object('result', 'declared', 'reference', v_tx.internal_reference);
end;
$$;

-- Décision du Super Admin sur un paiement par transfert : validation (même
-- circuit que les paiements en ligne : facture payée, abonnement activé) ou refus.
create or replace function public.platform_decide_offline_payment(p_transaction uuid, p_accept boolean, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tx public.payment_transactions;
  v_result jsonb;
begin
  perform app.require_platform_admin();
  select * into v_tx from public.payment_transactions where id = p_transaction and provider = 'offline';
  if v_tx.id is null then
    raise exception 'Paiement par transfert introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  if not p_accept and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indiquez le motif du refus.' using errcode = 'check_violation';
  end if;
  if coalesce(v_tx.provider_transaction_id, '') = '' then
    update public.payment_transactions set provider_transaction_id = 'OFF-' || internal_reference where id = v_tx.id;
    v_tx.provider_transaction_id := 'OFF-' || v_tx.internal_reference;
  end if;
  if p_accept then
    v_result := public.billing_confirm_payment('offline', v_tx.mode, v_tx.provider_transaction_id, v_tx.internal_reference,
      v_tx.amount, v_tx.currency, 'transfer', jsonb_build_object('validated_by', auth.uid(), 'validated_at', now()));
    update public.payment_transactions set confirmed_by = auth.uid() where id = v_tx.id and status = 'SUCCESS';
  else
    v_result := public.billing_fail_payment('offline', v_tx.mode, v_tx.provider_transaction_id, v_tx.internal_reference,
      'FAILED', left('Refusé par NeoScool : ' || btrim(p_reason), 300), jsonb_build_object('refused_by', auth.uid()));
  end if;
  perform app.audit(v_tx.organization_id, case when p_accept then 'platform.offline_accepted' else 'platform.offline_refused' end,
    'payment_transactions', v_tx.id,
    case when p_accept then 'Paiement par transfert validé (' else 'Paiement par transfert refusé (' end || v_tx.internal_reference || ')',
    jsonb_build_object('reference', v_tx.internal_reference, 'amount', v_tx.amount, 'reason', p_reason), 'success');
  return v_result;
end;
$$;

revoke all on function public.platform_update_payment_gateway(text, boolean, text, boolean, text, text, jsonb, text, text, boolean) from public, anon;
revoke all on function public.platform_record_gateway_test(text, boolean, text) from public, anon;
revoke all on function public.available_payment_gateways() from public, anon;
revoke all on function public.billing_declare_offline_payment(text, text, text) from public, anon;
revoke all on function public.platform_decide_offline_payment(uuid, boolean, text) from public, anon;
grant execute on function public.platform_update_payment_gateway(text, boolean, text, boolean, text, text, jsonb, text, text, boolean) to authenticated;
grant execute on function public.platform_record_gateway_test(text, boolean, text) to authenticated;
grant execute on function public.available_payment_gateways() to authenticated, service_role;
grant execute on function public.billing_declare_offline_payment(text, text, text) to authenticated;
grant execute on function public.platform_decide_offline_payment(uuid, boolean, text) to authenticated;
