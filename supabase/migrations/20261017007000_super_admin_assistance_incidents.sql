-- =============================================================================
-- Super Admin — SA-5 : assistance et incidents.
--  • Les établissements signalent un problème ou posent une question depuis
--    l'application (« Assistance ») et suivent la réponse.
--  • La plateforme traite les demandes, déclare ses propres incidents
--    (panne, maintenance imprévue), classe par gravité, suit la résolution.
--  • Notes internes de la plateforme invisibles pour l'établissement.
-- Rien n'est créé automatiquement : uniquement de vraies demandes.
-- =============================================================================

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  kind text not null default 'request' check (kind in ('request', 'incident')),
  category text not null check (category in ('connexion', 'paiement', 'donnees', 'documents', 'notifications', 'bug', 'question', 'autre')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null check (char_length(btrim(title)) between 4 and 160),
  description text not null check (char_length(btrim(description)) between 5 and 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (kind = 'incident' or organization_id is not null)
);
create index support_tickets_org_idx on public.support_tickets (organization_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, severity);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_side text not null check (author_side in ('school', 'platform')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  check (not internal or author_side = 'platform')
);
create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

-- Lecture côté établissement : l'auteur de la demande et les responsables (paramètres).
create or replace function app.can_read_ticket(t public.support_tickets)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin()
      or (t.organization_id is not null and app.is_member(t.organization_id)
          and (t.created_by = auth.uid() or app.has_permission(t.organization_id, 'settings.manage')));
$$;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
create policy support_tickets_select on public.support_tickets for select to authenticated using ((select app.can_read_ticket(support_tickets)));
create policy support_ticket_messages_select on public.support_ticket_messages for select to authenticated
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and app.can_read_ticket(t))
    and (not internal or (select app.is_platform_admin()))
  );
revoke insert, update, delete on public.support_tickets, public.support_ticket_messages from authenticated, anon;

-- Établissement : nouvelle demande.
create or replace function public.create_support_ticket(p_org uuid, p_category text, p_severity text, p_title text, p_description text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number bigint;
begin
  if p_org is null or not app.is_member(p_org) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if p_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Gravité inconnue.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.support_tickets where created_by = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de demandes en peu de temps : réessayez plus tard.' using errcode = 'check_violation';
  end if;
  insert into public.support_tickets (organization_id, category, severity, title, description, created_by)
  values (p_org, p_category, p_severity, btrim(p_title), btrim(p_description), auth.uid())
  returning id, number into v_id, v_number;
  perform app.audit(p_org, 'support.ticket_created', 'support_tickets', v_id, 'Demande d''assistance n° ' || v_number || ' : ' || left(btrim(p_title), 120),
    jsonb_build_object('category', p_category, 'severity', p_severity));
  return v_id;
end;
$$;

-- Plateforme : incident déclaré (panne, interruption…), éventuellement lié à un établissement.
create or replace function public.platform_create_incident(p_org uuid, p_category text, p_severity text, p_title text, p_description text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number bigint;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.support_tickets (organization_id, kind, category, severity, title, description, status, created_by, assigned_to)
  values (p_org, 'incident', p_category, p_severity, btrim(p_title), btrim(p_description), 'in_progress', auth.uid(), auth.uid())
  returning id, number into v_id, v_number;
  perform app.audit(null, 'platform.incident_created', 'support_tickets', v_id, 'Incident n° ' || v_number || ' : ' || left(btrim(p_title), 120),
    jsonb_build_object('category', p_category, 'severity', p_severity));
  return v_id;
end;
$$;

-- Message : établissement (auteur ou responsable) ou plateforme (note interne possible).
create or replace function public.add_support_message(p_ticket uuid, p_body text, p_internal boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.support_tickets;
  v_platform boolean := app.is_platform_admin();
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null or not app.can_read_ticket(t) then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  if t.status = 'closed' then
    raise exception 'Demande fermée : ouvrez une nouvelle demande.' using errcode = 'check_violation';
  end if;
  insert into public.support_ticket_messages (ticket_id, author_id, author_side, body, internal)
  values (p_ticket, auth.uid(), case when v_platform then 'platform' else 'school' end, btrim(p_body), v_platform and coalesce(p_internal, false));
  update public.support_tickets
     set updated_at = now(),
         status = case
                    when not v_platform and status in ('waiting', 'resolved') then 'open'
                    when v_platform and not coalesce(p_internal, false) and status = 'open' then 'in_progress'
                    else status end
   where id = p_ticket;
  -- L'auteur est prévenu d'une réponse de la plateforme (pas des notes internes).
  if v_platform and not coalesce(p_internal, false) and t.created_by is not null and t.organization_id is not null then
    perform app.notify(t.organization_id, t.created_by, 'support', 'Réponse à votre demande n° ' || t.number,
      left(btrim(p_body), 200), '/assistance?demande=' || t.id, '{}'::jsonb);
  end if;
end;
$$;

-- Plateforme : statut, gravité, prise en charge.
create or replace function public.platform_update_ticket(p_ticket uuid, p_status text, p_severity text, p_assign_me boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.support_tickets;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('open', 'in_progress', 'waiting', 'resolved', 'closed') or p_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Valeur inconnue.' using errcode = 'check_violation';
  end if;
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  update public.support_tickets
     set status = p_status, severity = p_severity, updated_at = now(),
         assigned_to = case when p_assign_me then auth.uid() else assigned_to end,
         resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
   where id = p_ticket;
  perform app.audit(t.organization_id, 'platform.ticket_updated', 'support_tickets', p_ticket,
    'Demande n° ' || t.number || ' : ' || t.status || ' → ' || p_status, jsonb_build_object('from', t.status, 'to', p_status, 'severity', p_severity));
  if p_status <> t.status and p_status in ('resolved', 'closed') and t.created_by is not null and t.organization_id is not null and t.kind = 'request' then
    perform app.notify(t.organization_id, t.created_by, 'support', 'Demande n° ' || t.number || ' résolue',
      'La plateforme a indiqué votre demande comme résolue. Vous pouvez répondre si le problème persiste.', '/assistance?demande=' || t.id, '{}'::jsonb);
  end if;
end;
$$;

-- Vue d'ensemble de la plateforme : volumes par statut et gravité, catégories récurrentes.
create or replace function public.platform_support_overview()
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
    'open', (select count(*) from public.support_tickets where status in ('open', 'in_progress', 'waiting')),
    'critical_open', (select count(*) from public.support_tickets where status in ('open', 'in_progress', 'waiting') and severity in ('high', 'critical')),
    'unassigned', (select count(*) from public.support_tickets where status = 'open' and assigned_to is null),
    'resolved_30d', (select count(*) from public.support_tickets where resolved_at > now() - interval '30 days'),
    'avg_resolution_hours', (select round(avg(extract(epoch from resolved_at - created_at)) / 3600, 1) from public.support_tickets where resolved_at > now() - interval '30 days'),
    'recurring', coalesce((select jsonb_agg(x order by x.n desc) from (
        select category, count(*) as n, count(distinct organization_id) as organizations
          from public.support_tickets where created_at > now() - interval '30 days'
         group by category having count(*) >= 2 order by 2 desc limit 6) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_support_ticket(uuid, text, text, text, text), public.platform_create_incident(uuid, text, text, text, text),
  public.add_support_message(uuid, text, boolean), public.platform_update_ticket(uuid, text, text, boolean), public.platform_support_overview() from public, anon;
grant execute on function public.create_support_ticket(uuid, text, text, text, text), public.platform_create_incident(uuid, text, text, text, text),
  public.add_support_message(uuid, text, boolean), public.platform_update_ticket(uuid, text, text, boolean), public.platform_support_overview() to authenticated;
