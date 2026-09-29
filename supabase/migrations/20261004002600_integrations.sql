-- =============================================================================
-- P3 — INTÉGRATIONS DE LA PLATEFORME (Super Admin)
-- Brevo (e-mail, SMS), Twilio (SMS), WhatsApp Business Platform (API officielle
-- Meta), Cloudflare Turnstile. Configurées UNE fois par le Super Admin et
-- utilisées par tous les établissements (quotas par établissement).
--
-- Sécurité :
--   * La clé secrète est chiffrée par le serveur (AES-256-GCM) AVANT d'arriver
--     en base ; la colonne chiffrée n'est lisible par AUCUN rôle navigateur
--     (privilèges de colonne) : seul le serveur (service_role) la lit.
--   * Écritures uniquement par fonctions SECURITY DEFINER réservées au Super Admin.
--   * Journal des envois : destinataire masqué, jamais de contenu ni de clé.
-- =============================================================================

create table public.platform_integrations (
  provider text primary key
    check (provider in ('brevo_email', 'brevo_sms', 'twilio_sms', 'whatsapp_meta', 'turnstile')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  secret_ciphertext text,
  secret_hint text check (secret_hint is null or char_length(secret_hint) <= 8),
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on column public.platform_integrations.secret_ciphertext is
  'Clé secrète chiffrée côté serveur (AES-256-GCM). Jamais lisible par le navigateur.';

insert into public.platform_integrations (provider) values
  ('brevo_email'), ('brevo_sms'), ('twilio_sms'), ('whatsapp_meta'), ('turnstile');

-- Modèles WhatsApp approuvés chez Meta (l'API officielle n'envoie que des modèles
-- approuvés en dehors d'une conversation ouverte).
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  language text not null default 'fr' check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  description text check (description is null or char_length(description) <= 300),
  variables_count int not null default 0 check (variables_count between 0 and 20),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, language)
);

-- Quotas mensuels : valeurs par défaut + dérogations par établissement.
create table public.messaging_settings (
  id int primary key default 1 check (id = 1),
  default_email_limit int not null default 2000 check (default_email_limit >= 0),
  default_sms_limit int not null default 200 check (default_sms_limit >= 0),
  default_whatsapp_limit int not null default 500 check (default_whatsapp_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.messaging_settings (id) values (1);

create table public.messaging_quotas (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  email_limit int check (email_limit is null or email_limit >= 0),
  sms_limit int check (sms_limit is null or sms_limit >= 0),
  whatsapp_limit int check (whatsapp_limit is null or whatsapp_limit >= 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  provider text,
  recipient_masked text not null check (char_length(recipient_masked) <= 120),
  purpose text not null default 'notification' check (purpose ~ '^[a-z_]{1,40}$'),
  status text not null check (status in ('sent', 'failed', 'blocked_quota', 'not_configured')),
  error text check (error is null or char_length(error) <= 500),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index message_deliveries_org_month on public.message_deliveries (organization_id, channel, created_at desc);
create index message_deliveries_recent on public.message_deliveries (created_at desc);

-- -----------------------------------------------------------------------------
-- Accès
-- -----------------------------------------------------------------------------
alter table public.platform_integrations enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.messaging_settings enable row level security;
alter table public.messaging_quotas enable row level security;
alter table public.message_deliveries enable row level security;

revoke all on public.platform_integrations, public.whatsapp_templates, public.messaging_settings,
  public.messaging_quotas, public.message_deliveries from anon, authenticated;

-- Colonnes lisibles par le Super Admin (JAMAIS secret_ciphertext).
grant select (provider, enabled, config, secret_hint, last_test_at, last_test_ok, last_test_message, updated_by, updated_at)
  on public.platform_integrations to authenticated;
create policy platform_integrations_read on public.platform_integrations
  for select to authenticated using (app.is_platform_admin());

grant select on public.whatsapp_templates, public.messaging_settings to authenticated;
create policy whatsapp_templates_read on public.whatsapp_templates for select to authenticated using (app.is_platform_admin());
create policy messaging_settings_read on public.messaging_settings for select to authenticated using (app.is_platform_admin());

-- Quotas et envois : Super Admin, et la direction de l'établissement concerné.
grant select on public.messaging_quotas, public.message_deliveries to authenticated;
create policy messaging_quotas_read on public.messaging_quotas for select to authenticated
  using (app.is_platform_admin() or app.has_permission(organization_id, 'settings.manage'));
create policy message_deliveries_read on public.message_deliveries for select to authenticated
  using (app.is_platform_admin() or (organization_id is not null and app.has_permission(organization_id, 'settings.manage')));

-- -----------------------------------------------------------------------------
-- Fonctions du Super Admin
-- -----------------------------------------------------------------------------
create or replace function app.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme NéoScol.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Enregistre une intégration. p_secret_ciphertext : déjà chiffré par le serveur ;
-- null = clé inchangée ; p_clear_secret = true supprime la clé.
create or replace function public.platform_update_integration(
  p_provider text, p_enabled boolean, p_config jsonb,
  p_secret_ciphertext text default null, p_secret_hint text default null, p_clear_secret boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.platform_integrations;
begin
  perform app.require_platform_admin();
  select * into v_row from public.platform_integrations where provider = p_provider for update;
  if v_row.provider is null then
    raise exception 'Intégration inconnue.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(coalesce(p_config, '{}'::jsonb)) <> 'object' or length(p_config::text) > 4000 then
    raise exception 'Configuration invalide.' using errcode = 'invalid_parameter_value';
  end if;
  if p_secret_ciphertext is not null and p_secret_ciphertext !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' then
    raise exception 'La clé doit être chiffrée par le serveur.' using errcode = 'invalid_parameter_value';
  end if;
  if p_enabled and not p_clear_secret and coalesce(p_secret_ciphertext, v_row.secret_ciphertext) is null then
    raise exception 'Renseignez la clé secrète avant d''activer cette intégration.' using errcode = 'check_violation';
  end if;
  update public.platform_integrations set
    enabled = p_enabled and not p_clear_secret,
    config = coalesce(p_config, '{}'::jsonb),
    secret_ciphertext = case when p_clear_secret then null else coalesce(p_secret_ciphertext, secret_ciphertext) end,
    secret_hint = case when p_clear_secret then null when p_secret_ciphertext is not null then p_secret_hint else secret_hint end,
    last_test_at = case when p_secret_ciphertext is not null or p_clear_secret then null else last_test_at end,
    last_test_ok = case when p_secret_ciphertext is not null or p_clear_secret then null else last_test_ok end,
    last_test_message = case when p_secret_ciphertext is not null or p_clear_secret then null else last_test_message end,
    updated_by = auth.uid(),
    updated_at = now()
  where provider = p_provider;
  -- Journal : jamais la clé ni son chiffré.
  perform app.audit(null, 'platform.integration_updated', 'platform_integrations', null,
    'Intégration ' || p_provider || case when p_enabled and not p_clear_secret then ' activée' else ' désactivée' end
      || case when p_secret_ciphertext is not null then ' (clé remplacée)' when p_clear_secret then ' (clé supprimée)' else '' end,
    jsonb_build_object('provider', p_provider, 'enabled', p_enabled and not p_clear_secret, 'secret_changed', p_secret_ciphertext is not null or p_clear_secret), 'success');
end;
$$;

create or replace function public.platform_record_integration_test(p_provider text, p_ok boolean, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_integrations
     set last_test_at = now(), last_test_ok = p_ok, last_test_message = left(coalesce(p_message, ''), 500)
   where provider = p_provider;
  if not found then
    raise exception 'Intégration inconnue.' using errcode = 'invalid_parameter_value';
  end if;
  perform app.audit(null, 'platform.integration_tested', 'platform_integrations', null,
    'Test de l''intégration ' || p_provider || case when p_ok then ' : réussi' else ' : échec' end,
    jsonb_build_object('provider', p_provider, 'ok', p_ok), case when p_ok then 'success' else 'failure' end);
end;
$$;

create or replace function public.platform_update_messaging_settings(p_email int, p_sms int, p_whatsapp int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.messaging_settings
     set default_email_limit = p_email, default_sms_limit = p_sms, default_whatsapp_limit = p_whatsapp, updated_at = now()
   where id = 1;
  perform app.audit(null, 'platform.messaging_quotas', 'messaging_settings', null,
    'Quotas mensuels par défaut : ' || p_email || ' e-mails, ' || p_sms || ' SMS, ' || p_whatsapp || ' WhatsApp',
    jsonb_build_object('email', p_email, 'sms', p_sms, 'whatsapp', p_whatsapp), 'success');
end;
$$;

-- Dérogation de quota d'un établissement (null = valeur par défaut).
create or replace function public.platform_set_messaging_quota(p_org uuid, p_email int, p_sms int, p_whatsapp int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Établissement introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_email, 0) < 0 or coalesce(p_sms, 0) < 0 or coalesce(p_whatsapp, 0) < 0 then
    raise exception 'Quota invalide.' using errcode = 'check_violation';
  end if;
  insert into public.messaging_quotas (organization_id, email_limit, sms_limit, whatsapp_limit, updated_by, updated_at)
  values (p_org, p_email, p_sms, p_whatsapp, auth.uid(), now())
  on conflict (organization_id) do update
    set email_limit = excluded.email_limit, sms_limit = excluded.sms_limit, whatsapp_limit = excluded.whatsapp_limit,
        updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(p_org, 'platform.messaging_quota', 'messaging_quotas', p_org,
    'Quota de messages de l''établissement modifié',
    jsonb_build_object('email', p_email, 'sms', p_sms, 'whatsapp', p_whatsapp), 'success');
end;
$$;

create or replace function public.platform_upsert_whatsapp_template(p_name text, p_language text, p_description text, p_variables int, p_enabled boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_admin();
  insert into public.whatsapp_templates (name, language, description, variables_count, enabled)
  values (lower(trim(p_name)), p_language, nullif(trim(coalesce(p_description, '')), ''), p_variables, p_enabled)
  on conflict (name, language) do update
    set description = excluded.description, variables_count = excluded.variables_count, enabled = excluded.enabled
  returning id into v_id;
  perform app.audit(null, 'platform.whatsapp_template', 'whatsapp_templates', v_id,
    'Modèle WhatsApp « ' || lower(trim(p_name)) || ' » (' || p_language || ')', '{}'::jsonb, 'success');
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Serveur uniquement (service_role) : état du quota et journal des envois.
-- -----------------------------------------------------------------------------
create or replace function public.messaging_quota_state(p_org uuid, p_channel text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', (select count(*)::int from public.message_deliveries d
              where d.organization_id = p_org and d.channel = p_channel and d.status = 'sent'
                and d.created_at >= date_trunc('month', now())),
    'limit', case p_channel
      when 'email' then coalesce(q.email_limit, s.default_email_limit)
      when 'sms' then coalesce(q.sms_limit, s.default_sms_limit)
      else coalesce(q.whatsapp_limit, s.default_whatsapp_limit) end)
  from public.messaging_settings s
  left join public.messaging_quotas q on q.organization_id = p_org
  where s.id = 1;
$$;

-- Tableau des établissements pour la console (envois du mois par canal et quotas).
create or replace function public.platform_messaging_usage()
returns table (organization_id uuid, name text, code text, email_used int, sms_used int, whatsapp_used int,
               email_limit int, sms_limit int, whatsapp_limit int, custom boolean,
               email_override int, sms_override int, whatsapp_override int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
  select o.id, o.name, o.code,
    (count(*) filter (where d.channel = 'email' and d.status = 'sent'))::int,
    (count(*) filter (where d.channel = 'sms' and d.status = 'sent'))::int,
    (count(*) filter (where d.channel = 'whatsapp' and d.status = 'sent'))::int,
    coalesce(q.email_limit, s.default_email_limit), coalesce(q.sms_limit, s.default_sms_limit),
    coalesce(q.whatsapp_limit, s.default_whatsapp_limit), q.organization_id is not null,
    q.email_limit, q.sms_limit, q.whatsapp_limit
  from public.organizations o
  cross join public.messaging_settings s
  left join public.messaging_quotas q on q.organization_id = o.id
  left join public.message_deliveries d on d.organization_id = o.id and d.created_at >= date_trunc('month', now())
  where o.status <> 'archived'
  group by o.id, o.name, o.code, q.organization_id, q.email_limit, q.sms_limit, q.whatsapp_limit,
           s.default_email_limit, s.default_sms_limit, s.default_whatsapp_limit
  order by o.name;
end;
$$;

revoke execute on function app.require_platform_admin() from public, anon;
grant execute on function app.require_platform_admin() to authenticated;
revoke execute on function public.platform_update_integration(text, boolean, jsonb, text, text, boolean) from public, anon;
revoke execute on function public.platform_record_integration_test(text, boolean, text) from public, anon;
revoke execute on function public.platform_update_messaging_settings(int, int, int) from public, anon;
revoke execute on function public.platform_set_messaging_quota(uuid, int, int, int) from public, anon;
revoke execute on function public.platform_upsert_whatsapp_template(text, text, text, int, boolean) from public, anon;
revoke execute on function public.platform_messaging_usage() from public, anon;
grant execute on function public.platform_update_integration(text, boolean, jsonb, text, text, boolean) to authenticated;
grant execute on function public.platform_record_integration_test(text, boolean, text) to authenticated;
grant execute on function public.platform_update_messaging_settings(int, int, int) to authenticated;
grant execute on function public.platform_set_messaging_quota(uuid, int, int, int) to authenticated;
grant execute on function public.platform_upsert_whatsapp_template(text, text, text, int, boolean) to authenticated;
grant execute on function public.platform_messaging_usage() to authenticated;

revoke execute on function public.messaging_quota_state(uuid, text) from public, anon, authenticated;
grant execute on function public.messaging_quota_state(uuid, text) to service_role;
grant select, insert on public.message_deliveries to service_role;
grant select on public.platform_integrations, public.whatsapp_templates, public.messaging_settings, public.messaging_quotas to service_role;
