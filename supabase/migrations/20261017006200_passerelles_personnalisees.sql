-- =============================================================================
-- Agrégateurs de paiement personnalisés : le Super Admin ajoute lui-même un
-- fournisseur inconnu de NeoScool (adresse de l'API, authentification, création
-- et vérification d'un paiement, statuts, notification), sans toucher au code.
-- La définition ne contient aucune clé : les clés restent chiffrées dans
-- payment_gateway_settings. Un test réussi de la configuration en cours est
-- obligatoire avant de proposer la passerelle aux clients ; toute modification
-- de la définition, des clés ou du mode impose un nouveau test.
-- Aucune donnée existante n'est modifiée.
-- =============================================================================

create table public.custom_payment_gateways (
  provider text primary key references public.payment_providers (code),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and length(definition::text) <= 20000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (provider ~ '^custom_[a-z0-9_]{2,20}$')
);
comment on table public.custom_payment_gateways is
  'Agrégateurs ajoutés par le Super Admin : description des appels HTTP (sans aucune clé).';

alter table public.custom_payment_gateways enable row level security;
revoke all on public.custom_payment_gateways from anon, authenticated;
create policy custom_payment_gateways_platform on public.custom_payment_gateways for select to authenticated using (app.is_platform_admin());
grant select on public.custom_payment_gateways to authenticated;
grant select on public.custom_payment_gateways to service_role;

-- Création ou modification d'un agrégateur personnalisé.
create or replace function public.platform_save_custom_gateway(p_code text, p_name text, p_description text, p_definition jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing public.custom_payment_gateways;
  v_name text := btrim(coalesce(p_name, ''));
  v_changed boolean;
begin
  perform app.require_platform_admin();
  if coalesce(p_code, '') !~ '^custom_[a-z0-9_]{2,20}$' then
    raise exception 'Code invalide (lettres minuscules, chiffres et _ ; 2 à 20 caractères).' using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Nom de l''agrégateur invalide (2 à 60 caractères).' using errcode = 'invalid_parameter_value';
  end if;
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' or length(p_definition::text) > 20000 then
    raise exception 'Définition invalide.' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_existing from public.custom_payment_gateways where provider = p_code for update;
  if v_existing.provider is null then
    if exists (select 1 from public.payment_providers where code = p_code) then
      raise exception 'Ce code est déjà utilisé.' using errcode = 'unique_violation';
    end if;
    insert into public.payment_providers (code, name, description, supports_refund)
      values (p_code, v_name, left(nullif(btrim(coalesce(p_description, '')), ''), 300), false);
    insert into public.payment_gateway_settings (provider, sort_order, public_label) values (p_code, 80, v_name);
    insert into public.custom_payment_gateways (provider, definition, created_by, updated_by) values (p_code, p_definition, auth.uid(), auth.uid());
    perform app.audit(null, 'platform.custom_gateway_created', 'custom_payment_gateways', null,
      'Agrégateur personnalisé ajouté : ' || v_name, jsonb_build_object('provider', p_code), 'success');
    return 'created';
  end if;

  v_changed := v_existing.definition is distinct from p_definition;
  update public.payment_providers
     set name = v_name, description = left(nullif(btrim(coalesce(p_description, '')), ''), 300), is_active = true
   where code = p_code;
  update public.custom_payment_gateways set definition = p_definition, updated_by = auth.uid(), updated_at = now() where provider = p_code;
  if v_changed then
    -- Nouvelle définition : plus proposée aux clients tant qu'elle n'a pas été testée.
    update public.payment_gateway_settings
       set checkout_enabled = false, is_default = false, last_test_at = null, last_test_ok = null, last_test_message = null,
           updated_by = auth.uid(), updated_at = now()
     where provider = p_code;
  end if;
  perform app.audit(null, 'platform.custom_gateway_updated', 'custom_payment_gateways', null,
    'Agrégateur personnalisé modifié : ' || v_name || case when v_changed then ' (nouveau test requis)' else '' end,
    jsonb_build_object('provider', p_code, 'definition_changed', v_changed), 'success');
  return 'updated';
end;
$$;

-- Suppression : définitive s'il n'a jamais servi ; sinon archivé (historique des
-- paiements conservé, plus proposé ni modifiable par les clients).
create or replace function public.platform_delete_custom_gateway(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_used boolean;
begin
  perform app.require_platform_admin();
  select p.name into v_name from public.custom_payment_gateways c join public.payment_providers p on p.code = c.provider where c.provider = p_code for update of c;
  if v_name is null then
    raise exception 'Agrégateur personnalisé introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  v_used := exists (select 1 from public.payment_transactions where provider = p_code)
         or exists (select 1 from public.teacher_access_payments where provider = p_code)
         or exists (select 1 from public.sms_credit_purchases where provider = p_code)
         or exists (select 1 from public.payment_webhooks where provider = p_code)
         or exists (select 1 from public.payment_provider_events where provider = p_code);
  if v_used then
    update public.payment_gateway_settings set checkout_enabled = false, is_default = false, updated_by = auth.uid(), updated_at = now() where provider = p_code;
    update public.payment_providers set is_active = false where code = p_code;
    perform app.audit(null, 'platform.custom_gateway_archived', 'custom_payment_gateways', null,
      'Agrégateur personnalisé archivé (paiements conservés) : ' || v_name, jsonb_build_object('provider', p_code), 'success');
    return 'archived';
  end if;
  delete from public.custom_payment_gateways where provider = p_code;
  delete from public.payment_gateway_settings where provider = p_code;
  delete from public.payment_providers where code = p_code;
  perform app.audit(null, 'platform.custom_gateway_deleted', 'custom_payment_gateways', null,
    'Agrégateur personnalisé supprimé : ' || v_name, jsonb_build_object('provider', p_code), 'success');
  return 'deleted';
end;
$$;

-- Réglage d'une passerelle : identique à la version précédente, avec une règle
-- de plus pour les agrégateurs personnalisés (test réussi obligatoire).
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
  if v_enabled and p_provider like 'custom\_%' then
    if not exists (select 1 from public.payment_providers where code = p_provider and is_active) then
      raise exception 'Cet agrégateur est archivé.' using errcode = 'check_violation';
    end if;
    if not coalesce(v_row.last_test_ok, false) or p_secret_ciphertext is not null or p_mode <> v_row.mode
       or v_row.config is distinct from coalesce(p_config, '{}'::jsonb) then
      raise exception 'Testez d''abord cet agrégateur avec ces réglages (bouton « Tester ») : un test réussi est obligatoire avant de le proposer aux clients.'
        using errcode = 'check_violation';
    end if;
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
    last_test_at = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode or v_row.config is distinct from coalesce(p_config, '{}'::jsonb) then null else last_test_at end,
    last_test_ok = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode or v_row.config is distinct from coalesce(p_config, '{}'::jsonb) then null else last_test_ok end,
    last_test_message = case when p_secret_ciphertext is not null or p_clear_secret or p_mode <> v_row.mode or v_row.config is distinct from coalesce(p_config, '{}'::jsonb) then null else last_test_message end,
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

revoke all on function public.platform_save_custom_gateway(text, text, text, jsonb) from public, anon;
revoke all on function public.platform_delete_custom_gateway(text) from public, anon;
grant execute on function public.platform_save_custom_gateway(text, text, text, jsonb) to authenticated;
grant execute on function public.platform_delete_custom_gateway(text) to authenticated;
