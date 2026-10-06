-- =============================================================================
-- Super Admin — SA-11 : confidentialité et protection des données.
--  • Registre des demandes des personnes (accès, rectification, suppression,
--    portabilité, opposition) avec échéance légale de 30 jours.
--  • Export des données d'un établissement (portabilité, fin de contrat) :
--    réservé aux PROPRIÉTAIRES, motif obligatoire, journalisé. Les colonnes
--    secrètes (clés, jetons, empreintes, mots de passe) ne sont jamais
--    exportées. Aucune suppression automatique : une suppression se décide
--    au cas par cas, avec l'établissement.
-- =============================================================================

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  organization_id uuid references public.organizations (id) on delete set null,
  requester_name text not null check (char_length(btrim(requester_name)) between 2 and 120),
  requester_email text check (requester_email is null or requester_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  request_type text not null check (request_type in ('access', 'rectification', 'deletion', 'export', 'opposition', 'other')),
  details text not null check (char_length(btrim(details)) between 5 and 3000),
  status text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'rejected')),
  response text check (response is null or char_length(response) <= 3000),
  due_at date not null default (current_date + 30),
  handled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.privacy_requests enable row level security;
create policy privacy_requests_select on public.privacy_requests for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.privacy_requests from authenticated, anon;

create or replace function public.platform_save_privacy_request(
  p_id uuid, p_org uuid, p_name text, p_email text, p_type text, p_details text, p_status text, p_response text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_number bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if v_id is null then
    insert into public.privacy_requests (organization_id, requester_name, requester_email, request_type, details, created_by)
    values (p_org, btrim(p_name), nullif(btrim(coalesce(p_email, '')), ''), p_type, btrim(p_details), auth.uid())
    returning id, number into v_id, v_number;
    perform app.audit(p_org, 'platform.privacy_request', 'privacy_requests', v_id, 'Demande de confidentialité n° ' || v_number || ' enregistrée (' || p_type || ')', '{}'::jsonb);
  else
    update public.privacy_requests
       set status = p_status, response = nullif(btrim(coalesce(p_response, '')), ''), handled_by = auth.uid(),
           completed_at = case when p_status in ('completed', 'rejected') then coalesce(completed_at, now()) else null end
     where id = v_id
     returning number into v_number;
    if v_number is null then
      raise exception 'Demande introuvable.' using errcode = 'no_data_found';
    end if;
    perform app.audit(null, 'platform.privacy_request_updated', 'privacy_requests', v_id, 'Demande de confidentialité n° ' || v_number || ' : ' || p_status, '{}'::jsonb);
  end if;
  return v_id;
end;
$$;

-- Autorise et journalise un export ; renvoie la liste des tables et colonnes exportables (sans secrets).
create or replace function public.platform_begin_org_export(p_org uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not app.is_platform_owner() then
    raise exception 'Seul un propriétaire de la plateforme peut exporter les données d''un établissement.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Le motif est obligatoire (5 caractères minimum).' using errcode = 'check_violation';
  end if;
  select name into v_name from public.organizations where id = p_org;
  if v_name is null then
    raise exception 'Établissement introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(p_org, 'platform.org_export', 'organizations', p_org, 'Export des données de l''établissement : ' || v_name,
    jsonb_build_object('reason', left(btrim(p_reason), 500)));
  return coalesce((
    select jsonb_object_agg(t.table_name, t.columns)
      from (
        select c.table_name, jsonb_agg(c.column_name order by c.ordinal_position) as columns
          from information_schema.columns c
          join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
         where c.table_schema = 'public'
           and c.column_name !~* '(secret|token|hash|password|ciphertext|salt|otp|webhook_token|api_key)'
           and c.data_type <> 'bytea'
           and c.table_name not in ('audit_logs', 'auth_login_attempts', 'site_visits')
           and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.table_name and k.column_name = 'organization_id')
         group by c.table_name
      ) t), '{}'::jsonb);
end;
$$;

revoke all on function public.platform_save_privacy_request(uuid, uuid, text, text, text, text, text, text), public.platform_begin_org_export(uuid, text) from public, anon;
grant execute on function public.platform_save_privacy_request(uuid, uuid, text, text, text, text, text, text), public.platform_begin_org_export(uuid, text) to authenticated;
