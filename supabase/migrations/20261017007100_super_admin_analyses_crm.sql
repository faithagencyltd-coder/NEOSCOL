-- =============================================================================
-- Super Admin — SA-6 : analyses économiques et suivi commercial (CRM).
--  • platform_growth : séries mensuelles réelles (établissements, utilisateurs,
--    activité, essais, activations, renouvellements, résiliations, revenus
--    NeoScool — jamais les frais de scolarité des établissements).
--  • Suivi commercial : les demandes du site (site_leads) gagnent un
--    responsable, une prochaine action, un historique des échanges et le lien
--    vers l'établissement créé. Les statuts existants sont conservés.
-- =============================================================================

alter table public.site_leads drop constraint site_leads_status_check;
alter table public.site_leads add constraint site_leads_status_check
  check (status in ('new', 'in_progress', 'contacted', 'demo_planned', 'proposal', 'won', 'lost', 'done', 'spam'));
alter table public.site_leads
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column next_action text check (next_action is null or char_length(next_action) <= 300),
  add column next_action_at date,
  add column organization_id uuid references public.organizations (id) on delete set null,
  add column source text check (source is null or char_length(source) <= 60);

create table public.site_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.site_leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('note', 'status', 'call', 'email', 'meeting')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index site_lead_events_lead_idx on public.site_lead_events (lead_id, created_at);
alter table public.site_lead_events enable row level security;
create policy site_lead_events_select on public.site_lead_events for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.site_lead_events from authenticated, anon;

-- Suivi d'une demande : statut, responsable, prochaine action, établissement converti, échange.
create or replace function public.platform_crm_update_lead(
  p_id uuid, p_status text, p_assign_me boolean, p_next_action text, p_next_action_at date,
  p_organization uuid, p_event_kind text, p_event_body text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select status into v_old from public.site_leads where id = p_id for update;
  if v_old is null then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  if p_status = 'won' and p_organization is null and not exists (select 1 from public.site_leads where id = p_id and organization_id is not null) then
    raise exception 'Pour « Gagné », indiquez l''établissement créé.' using errcode = 'check_violation';
  end if;
  update public.site_leads
     set status = p_status,
         assigned_to = case when p_assign_me then auth.uid() else assigned_to end,
         next_action = nullif(btrim(coalesce(p_next_action, '')), ''),
         next_action_at = p_next_action_at,
         organization_id = coalesce(p_organization, organization_id),
         handled_by = auth.uid(), handled_at = now()
   where id = p_id;
  if v_old <> p_status then
    insert into public.site_lead_events (lead_id, author_id, kind, body) values (p_id, auth.uid(), 'status', v_old || ' → ' || p_status);
  end if;
  if length(btrim(coalesce(p_event_body, ''))) > 0 then
    insert into public.site_lead_events (lead_id, author_id, kind, body)
    values (p_id, auth.uid(), case when p_event_kind in ('note', 'call', 'email', 'meeting') then p_event_kind else 'note' end, btrim(p_event_body));
  end if;
end;
$$;

-- Rapport commercial : entonnoir, conversion, origine, pays, actions en retard.
create or replace function public.platform_crm_report(p_from date, p_to date)
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
  return (
    with l as (select * from public.site_leads where created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz and status <> 'spam')
    select jsonb_build_object(
      'total', (select count(*) from l),
      'won', (select count(*) from l where status = 'won'),
      'lost', (select count(*) from l where status = 'lost'),
      'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from l group by status) x), '{}'::jsonb),
      'by_kind', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from l group by kind) x), '{}'::jsonb),
      'by_country', coalesce((select jsonb_agg(x order by x.n desc) from (select coalesce(country, '—') as country, count(*) n, count(*) filter (where status = 'won') as won from l group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
      'overdue', (select count(*) from public.site_leads where next_action_at < current_date and status not in ('won', 'lost', 'done', 'spam')),
      'unassigned', (select count(*) from public.site_leads where assigned_to is null and status in ('new', 'in_progress', 'contacted'))
    )
  );
end;
$$;

-- Séries mensuelles de croissance (12 derniers mois par défaut).
create or replace function public.platform_growth(p_months integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_months integer := least(greatest(coalesce(p_months, 12), 3), 36);
  v_start date := (date_trunc('month', now()) - make_interval(months => v_months - 1))::date;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'new_organizations', (select count(*) from public.organizations o where not o.is_demo and date_trunc('month', o.created_at) = m),
        'total_organizations', (select count(*) from public.organizations o where not o.is_demo and o.created_at < m + interval '1 month'),
        'new_users', (select count(*) from public.profiles p where date_trunc('month', p.created_at) = m),
        'active_users', (select count(distinct a.actor_id) from public.audit_logs a where a.action in ('auth.login', 'auth.login_mfa') and a.result = 'success' and date_trunc('month', a.created_at) = m),
        'trials', (select count(*) from public.subscription_events e where e.event_type = 'trial_started' and date_trunc('month', e.created_at) = m),
        'activations', (select count(*) from public.subscription_events e where e.event_type = 'subscription_activated' and date_trunc('month', e.created_at) = m),
        'renewals', (select count(*) from public.subscription_events e where e.event_type = 'subscription_renewed' and date_trunc('month', e.created_at) = m),
        'cancellations', (select count(*) from public.subscription_events e where e.event_type in ('subscription_cancelled', 'subscription_expired') and date_trunc('month', e.created_at) = m),
        'revenue', coalesce((select jsonb_object_agg(r.currency, r.amount) from (
            select currency, sum(amount)::bigint as amount from app.revenue_entries(false)
             where date_trunc('month', paid_at) = m group by currency) r), '{}'::jsonb)
      ) order by m)
      from generate_series(v_start::timestamptz, date_trunc('month', now()), interval '1 month') as m
    ),
    'activity', jsonb_build_object(
      'active_organizations_30d', (select count(distinct a.organization_id) from public.audit_logs a
                                    join public.organizations o on o.id = a.organization_id and not o.is_demo
                                   where a.action in ('auth.login', 'auth.login_mfa') and a.created_at > now() - interval '30 days'),
      'organizations', (select count(*) from public.organizations o where not o.is_demo and o.status = 'active'),
      'inactive', coalesce((select jsonb_agg(x order by x.last_login nulls first) from (
          select o.id, o.name, (select max(a.created_at) from public.audit_logs a where a.organization_id = o.id and a.action in ('auth.login', 'auth.login_mfa')) as last_login
            from public.organizations o where not o.is_demo and o.status = 'active'
        ) x where x.last_login is null or x.last_login < now() - interval '30 days'), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.platform_crm_update_lead(uuid, text, boolean, text, date, uuid, text, text), public.platform_crm_report(date, date), public.platform_growth(integer) from public, anon;
grant execute on function public.platform_crm_update_lead(uuid, text, boolean, text, date, uuid, text, text), public.platform_crm_report(date, date), public.platform_growth(integer) to authenticated;
