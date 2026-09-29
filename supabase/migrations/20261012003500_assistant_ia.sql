-- =============================================================================
-- P7g — ASSISTANT IA : clé Claude chiffrée (console), quota mensuel, journal
--
-- Réutilise l'existant : assistant (outils sous RLS, aucune écriture), intégrations
-- de la plateforme (P3 : clé chiffrée AES-256-GCM, jamais réaffichée, test),
-- quotas par établissement.
--   * Fournisseur « anthropic » saisi par le Super Admin (plus de clé en variable
--     d'environnement obligatoire).
--   * Quota mensuel de questions traitées par Claude, par défaut et par
--     établissement ; au-delà, réponse locale (gratuite), jamais de blocage.
--   * Journal de consommation (outils appelés, jetons) — jamais le contenu.
-- =============================================================================

alter table public.platform_integrations drop constraint platform_integrations_provider_check;
alter table public.platform_integrations add constraint platform_integrations_provider_check
  check (provider in ('brevo_email', 'brevo_sms', 'twilio_sms', 'whatsapp_meta', 'turnstile', 'anthropic'));
insert into public.platform_integrations (provider) values ('anthropic') on conflict do nothing;

alter table public.messaging_settings add column default_ai_limit int not null default 300 check (default_ai_limit >= 0);
alter table public.messaging_quotas add column ai_limit int check (ai_limit is null or ai_limit >= 0);

create table public.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  provider text not null check (provider in ('claude', 'local')),
  tools text[] not null default '{}',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index assistant_usage_org_month on public.assistant_usage (organization_id, created_at desc);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;
grant select on public.assistant_usage to authenticated;
create policy assistant_usage_read on public.assistant_usage for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('settings.manage'))::uuid[]) or app.is_platform_admin());

create or replace function app.ai_quota(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', (select count(*)::int from public.assistant_usage u
              where u.organization_id = p_org and u.provider = 'claude' and u.created_at >= date_trunc('month', now())),
    'limit', coalesce(q.ai_limit, s.default_ai_limit))
  from public.messaging_settings s
  left join public.messaging_quotas q on q.organization_id = p_org
  where s.id = 1;
$$;

-- Quota de l'établissement (avant d'appeler Claude).
create or replace function public.assistant_quota(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'assistant.use') then
    raise exception 'Permission refusée : assistant.' using errcode = 'insufficient_privilege';
  end if;
  return app.ai_quota(p_org);
end;
$$;

-- Consommation d'une question (outils et jetons ; jamais le texte).
create or replace function public.record_assistant_usage(p_org uuid, p_provider text, p_tools text[], p_input_tokens int, p_output_tokens int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'assistant.use') then
    raise exception 'Permission refusée : assistant.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.assistant_usage (organization_id, provider, tools, input_tokens, output_tokens)
  values (p_org, p_provider, coalesce(p_tools[1:20], '{}'), greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0));
end;
$$;

-- Super Admin : quota par défaut et dérogations, consommation par établissement.
create or replace function public.platform_set_ai_quota(p_org uuid, p_limit int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if p_limit is not null and p_limit < 0 then
    raise exception 'Quota invalide.' using errcode = 'check_violation';
  end if;
  if p_org is null then
    if p_limit is null then
      raise exception 'Quota par défaut obligatoire.' using errcode = 'check_violation';
    end if;
    update public.messaging_settings set default_ai_limit = p_limit, updated_at = now() where id = 1;
  else
    if not exists (select 1 from public.organizations where id = p_org) then
      raise exception 'Établissement introuvable.' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.messaging_quotas (organization_id, ai_limit, updated_by, updated_at)
    values (p_org, p_limit, auth.uid(), now())
    on conflict (organization_id) do update set ai_limit = excluded.ai_limit, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform app.audit(p_org, 'platform.ai_quota', 'messaging_settings', p_org,
    case when p_org is null then 'Quota IA mensuel par défaut : ' || p_limit || ' question(s)'
         else 'Quota IA de l''établissement : ' || coalesce(p_limit::text, 'valeur par défaut') end,
    jsonb_build_object('limit', p_limit), 'success');
end;
$$;

create or replace function public.platform_ai_usage()
returns table (organization_id uuid, name text, code text, used int, local_answers int, input_tokens bigint, output_tokens bigint, ai_limit int, override int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
  select o.id, o.name, o.code,
    (count(u.id) filter (where u.provider = 'claude'))::int,
    (count(u.id) filter (where u.provider = 'local'))::int,
    coalesce(sum(u.input_tokens), 0)::bigint, coalesce(sum(u.output_tokens), 0)::bigint,
    coalesce(q.ai_limit, s.default_ai_limit), q.ai_limit
  from public.organizations o
  cross join public.messaging_settings s
  left join public.messaging_quotas q on q.organization_id = o.id
  left join public.assistant_usage u on u.organization_id = o.id and u.created_at >= date_trunc('month', now())
  where o.status <> 'archived'
  group by o.id, o.name, o.code, q.ai_limit, s.default_ai_limit
  order by count(u.id) desc, o.name;
end;
$$;

revoke execute on function app.ai_quota(uuid) from public, anon, authenticated;
revoke execute on function public.assistant_quota(uuid) from public, anon;
revoke execute on function public.record_assistant_usage(uuid, text, text[], int, int) from public, anon;
revoke execute on function public.platform_set_ai_quota(uuid, int) from public, anon;
revoke execute on function public.platform_ai_usage() from public, anon;
grant execute on function public.assistant_quota(uuid) to authenticated;
grant execute on function public.record_assistant_usage(uuid, text, text[], int, int) to authenticated;
grant execute on function public.platform_set_ai_quota(uuid, int) to authenticated;
grant execute on function public.platform_ai_usage() to authenticated;
