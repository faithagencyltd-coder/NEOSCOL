-- =============================================================================
-- Analytics (console Super Admin) : mesure d'audience détaillée du site public
-- et suivi d'usage des établissements, à partir d'événements réellement reçus.
--
-- Confidentialité :
--  • aucune adresse IP, aucun mot de passe, aucune saisie de formulaire, aucune
--    donnée scolaire : seulement la page, l'élément cliqué (libellé de bouton ou
--    adresse du lien), la durée de la page, l'appareil, le pays / la ville
--    approximatifs fournis par l'hébergeur ;
--  • visiteur anonyme par défaut (empreinte renouvelée chaque jour) ; identifiant
--    durable seulement après consentement (bandeau), pour reconnaître les
--    visiteurs qui reviennent ;
--  • lecture réservée à l'administration de la plateforme ; conservation limitée
--    (13 mois par défaut, réglable), purge automatique.
-- =============================================================================

create table public.analytics_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  consent_required boolean not null default true,
  track_clicks boolean not null default true,
  track_duration boolean not null default true,
  track_app_usage boolean not null default true,
  retention_months integer not null default 13 check (retention_months between 1 and 25),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.analytics_settings (id) values (1);
alter table public.analytics_settings enable row level security;
create policy analytics_settings_select on public.analytics_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.analytics_settings from anon, authenticated;

create table public.analytics_sessions (
  id uuid primary key,
  visitor text not null check (visitor ~ '^[a-f0-9]{64}$'),
  consented boolean not null default false,
  is_returning boolean not null default false,
  day date not null default current_date,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  entry_path text check (entry_path is null or char_length(entry_path) <= 200),
  exit_path text check (exit_path is null or char_length(exit_path) <= 200),
  pages integer not null default 0,
  converted boolean not null default false,
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  os text not null check (os in ('android', 'ios', 'windows', 'macos', 'linux', 'other')),
  browser text not null check (browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  region text check (region is null or char_length(region) <= 80),
  city text check (city is null or char_length(city) <= 80),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 80),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 80),
  locale text not null default 'fr' check (locale in ('fr', 'en'))
);
create index analytics_sessions_day_idx on public.analytics_sessions (day);
create index analytics_sessions_seen_idx on public.analytics_sessions (last_seen_at);
create index analytics_sessions_visitor_idx on public.analytics_sessions (visitor, day);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.analytics_sessions (id) on delete cascade,
  day date not null default current_date,
  type text not null check (type in ('pageview', 'click', 'leave', 'conversion')),
  path text not null check (path ~ '^/' and char_length(path) <= 200),
  label text check (label is null or char_length(label) <= 80),
  target text check (target is null or char_length(target) <= 200),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  created_at timestamptz not null default now()
);
create index analytics_events_session_idx on public.analytics_events (session_id, id);
create index analytics_events_day_type_idx on public.analytics_events (day, type);

-- Usage des établissements : pages de l'application consultées, par module (aucun contenu).
create table public.analytics_app_usage (
  day date not null default current_date,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  module text not null check (module ~ '^[a-z0-9-]{1,40}$'),
  views integer not null default 1,
  last_at timestamptz not null default now(),
  primary key (day, organization_id, user_id, module)
);
create index analytics_app_usage_org_idx on public.analytics_app_usage (organization_id, day);

alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_app_usage enable row level security;
create policy analytics_sessions_select on public.analytics_sessions for select to authenticated using ((select app.is_platform_admin()));
create policy analytics_events_select on public.analytics_events for select to authenticated using ((select app.is_platform_admin()));
create policy analytics_app_usage_select on public.analytics_app_usage for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.analytics_sessions, public.analytics_events, public.analytics_app_usage from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enregistrement (serveur du site, clé de service) : valeurs déjà nettoyées.
-- -----------------------------------------------------------------------------
create or replace function public.record_analytics(p_session jsonb, p_events jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.analytics_settings;
  v_id uuid := (p_session ->> 'id')::uuid;
  v_visitor text := p_session ->> 'visitor';
  v_existing public.analytics_sessions;
  v_pageviews jsonb;
  v_last_path text;
begin
  select * into s from public.analytics_settings where id = 1;
  if not s.enabled then return; end if;
  select * into v_existing from public.analytics_sessions where id = v_id;
  if v_existing.id is not null and v_existing.visitor <> v_visitor then
    return; -- identifiant de session d'un autre visiteur : ignoré
  end if;
  if v_existing.id is null and jsonb_array_length(p_events) = 0 then
    return; -- signe de vie d'une session inconnue (aucune page mesurée) : ignoré
  end if;
  if v_existing.id is not null and (select count(*) from public.analytics_events where session_id = v_id) >= 1000 then
    return; -- limite anti-abus par session
  end if;
  v_pageviews := coalesce((select jsonb_agg(e) from jsonb_array_elements(p_events) e where e ->> 'type' = 'pageview'), '[]'::jsonb);
  v_last_path := (select e ->> 'path' from jsonb_array_elements(v_pageviews) e order by (e ->> 'n')::int desc nulls last limit 1);
  if v_existing.id is null then
    insert into public.analytics_sessions (id, visitor, consented, is_returning, entry_path, exit_path, pages, device, os, browser, country, region, city,
                                           referrer_host, utm_source, utm_campaign, locale)
    values (v_id, v_visitor, coalesce((p_session ->> 'consented')::boolean, false),
            coalesce((p_session ->> 'consented')::boolean, false)
              and exists (select 1 from public.analytics_sessions x where x.visitor = v_visitor and x.day < current_date),
            coalesce((select e ->> 'path' from jsonb_array_elements(v_pageviews) e order by (e ->> 'n')::int nulls last limit 1), p_session ->> 'path'),
            coalesce(v_last_path, p_session ->> 'path'), jsonb_array_length(v_pageviews),
            p_session ->> 'device', p_session ->> 'os', p_session ->> 'browser', nullif(p_session ->> 'country', ''), nullif(p_session ->> 'region', ''),
            nullif(p_session ->> 'city', ''), nullif(p_session ->> 'referrer', ''), nullif(p_session ->> 'utm_source', ''), nullif(p_session ->> 'utm_campaign', ''),
            coalesce(p_session ->> 'locale', 'fr'));
  else
    update public.analytics_sessions
       set last_seen_at = now(), pages = pages + jsonb_array_length(v_pageviews), exit_path = coalesce(v_last_path, exit_path)
     where id = v_id;
  end if;

  insert into public.analytics_events (session_id, type, path, label, target, duration_ms)
  select v_id, e ->> 'type', e ->> 'path', nullif(e ->> 'label', ''), nullif(e ->> 'target', ''),
         case when s.track_duration then (e ->> 'duration_ms')::integer end
    from (select e from jsonb_array_elements(p_events) e limit 50) x(e)
   where e ->> 'type' in ('pageview', 'leave', 'conversion') or (e ->> 'type' = 'click' and s.track_clicks);

  if exists (select 1 from jsonb_array_elements(p_events) e where e ->> 'type' = 'conversion') then
    update public.analytics_sessions set converted = true where id = v_id;
  end if;
end;
$$;
revoke all on function public.record_analytics(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_analytics(jsonb, jsonb) to service_role;

create or replace function public.record_app_usage(p_org uuid, p_user uuid, p_module text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select enabled and track_app_usage from public.analytics_settings where id = 1) then return; end if;
  if not exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = p_user) then return; end if;
  insert into public.analytics_app_usage (organization_id, user_id, module)
  values (p_org, p_user, p_module)
  on conflict (day, organization_id, user_id, module) do update set views = public.analytics_app_usage.views + 1, last_at = now();
end;
$$;
revoke all on function public.record_app_usage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_app_usage(uuid, uuid, text) to service_role;

-- Purge selon la durée de conservation (tâche quotidienne, ou bouton de la console).
create or replace function public.analytics_purge()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit date := current_date - make_interval(months => (select retention_months from public.analytics_settings where id = 1));
  v_sessions integer;
  v_usage integer;
begin
  delete from public.analytics_sessions where day < v_limit;
  get diagnostics v_sessions = row_count;
  delete from public.analytics_app_usage where day < v_limit;
  get diagnostics v_usage = row_count;
  return jsonb_build_object('sessions', v_sessions, 'app_usage', v_usage, 'before', v_limit);
end;
$$;
revoke all on function public.analytics_purge() from public, anon, authenticated;
grant execute on function public.analytics_purge() to service_role;

-- -----------------------------------------------------------------------------
-- Console : réglages
-- -----------------------------------------------------------------------------
create or replace function public.platform_save_analytics_settings(p_enabled boolean, p_consent boolean, p_clicks boolean, p_duration boolean, p_app boolean, p_retention integer)
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
  if p_retention not between 1 and 25 then
    raise exception 'Durée de conservation : entre 1 et 25 mois.' using errcode = 'check_violation';
  end if;
  update public.analytics_settings
     set enabled = p_enabled, consent_required = p_consent, track_clicks = p_clicks, track_duration = p_duration,
         track_app_usage = p_app, retention_months = p_retention, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  perform app.audit(null, 'platform.analytics_settings', 'analytics_settings', null,
    'Réglages Analytics : ' || case when p_enabled then 'activé' else 'désactivé' end || ', conservation ' || p_retention || ' mois', '{}'::jsonb);
end;
$$;
revoke all on function public.platform_save_analytics_settings(boolean, boolean, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.platform_save_analytics_settings(boolean, boolean, boolean, boolean, boolean, integer) to authenticated;

create or replace function public.platform_purge_analytics()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  v := public.analytics_purge();
  perform app.audit(null, 'platform.analytics_purge', 'analytics_sessions', null, 'Purge des données Analytics anciennes', v);
  return v;
end;
$$;
revoke all on function public.platform_purge_analytics() from public, anon;
grant execute on function public.platform_purge_analytics() to authenticated;

-- -----------------------------------------------------------------------------
-- Console : statistiques (filtres : période, pays, type d'appareil)
-- -----------------------------------------------------------------------------
create or replace function app.analytics_guard()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.platform_analytics_overview(p_from date, p_to date, p_country text, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len integer := p_to - p_from + 1;
begin
  perform app.analytics_guard();
  return (
    with f as (
      select * from public.analytics_sessions s
       where (nullif(p_country, '') is null or s.country = p_country) and (nullif(p_device, '') is null or s.device = p_device)
    ),
    cur as (select * from f where day between p_from and p_to),
    prev as (select * from f where day between p_from - v_len and p_from - 1),
    ev as (select e.* from public.analytics_events e join cur on cur.id = e.session_id),
    daily as (
      select d::date as day,
             (select count(distinct visitor) from cur where cur.day = d::date) as visitors,
             (select count(*) from cur where cur.day = d::date) as sessions,
             (select count(*) from ev where ev.day = d::date and ev.type = 'pageview') as pageviews
        from generate_series(p_from::timestamptz, p_to::timestamptz, interval '1 day') d
    )
    select jsonb_build_object(
      'realtime', (select count(distinct visitor) from f where last_seen_at > now() - interval '5 minutes'),
      'realtime_pages', coalesce((select jsonb_agg(x) from (select exit_path as path, count(*) as n from f where last_seen_at > now() - interval '5 minutes' group by 1 order by 2 desc limit 8) x), '[]'::jsonb),
      'today', (select count(distinct visitor) from f where day = current_date),
      'week', (select count(distinct (visitor, day)) from f where day > current_date - 7),
      'month', (select count(distinct (visitor, day)) from f where day > current_date - 30),
      'visitors', (select count(distinct (visitor, day)) from cur),
      'sessions', (select count(*) from cur),
      'pageviews', (select count(*) from ev where type = 'pageview'),
      'avg_duration_ms', (select round(avg(duration_ms)) from ev where type = 'leave' and duration_ms is not null),
      'bounce_rate', (select case when count(*) > 0 then round(100.0 * count(*) filter (where pages <= 1) / count(*), 1) end from cur),
      'consented_sessions', (select count(*) from cur where consented),
      'returning_sessions', (select count(*) from cur where consented and is_returning),
      'new_sessions', (select count(*) from cur where consented and not is_returning),
      'conversions', (select count(*) from cur where converted),
      'previous', jsonb_build_object(
        'visitors', (select count(distinct (visitor, day)) from prev),
        'sessions', (select count(*) from prev),
        'pageviews', (select count(*) from public.analytics_events e join prev on prev.id = e.session_id where e.type = 'pageview'),
        'conversions', (select count(*) from prev where converted)),
      'by_day', coalesce((select jsonb_agg(to_jsonb(daily) order by daily.day) from daily), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.platform_analytics_geo(p_from date, p_to date, p_country text, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.analytics_guard();
  return (
    with cur as (
      select * from public.analytics_sessions s
       where s.day between p_from and p_to
         and (nullif(p_country, '') is null or s.country = p_country) and (nullif(p_device, '') is null or s.device = p_device)
    )
    select jsonb_build_object(
      'countries', coalesce((select jsonb_agg(x order by x.visitors desc) from (
          select coalesce(country, '—') as country, count(distinct (visitor, day)) as visitors, count(*) as sessions, count(*) filter (where converted) as conversions
            from cur group by 1) x), '[]'::jsonb),
      'cities', coalesce((select jsonb_agg(x order by x.visitors desc) from (
          select country, city, count(distinct (visitor, day)) as visitors from cur where city is not null group by 1, 2 order by 3 desc limit 30) x), '[]'::jsonb),
      'unknown_country', (select count(*) from cur where country is null)
    )
  );
end;
$$;

create or replace function public.platform_analytics_behavior(p_from date, p_to date, p_country text, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.analytics_guard();
  return (
    with cur as (
      select * from public.analytics_sessions s
       where s.day between p_from and p_to
         and (nullif(p_country, '') is null or s.country = p_country) and (nullif(p_device, '') is null or s.device = p_device)
    ),
    ev as (select e.* from public.analytics_events e join cur on cur.id = e.session_id),
    seq as (
      select session_id, string_agg(path, ' → ' order by id) as route
        from (select session_id, path, id, row_number() over (partition by session_id order by id) as n from ev where type = 'pageview') p
       where n <= 3 group by session_id
    )
    select jsonb_build_object(
      'pages', coalesce((select jsonb_agg(x order by x.views desc) from (
          select path, count(*) filter (where type = 'pageview') as views, count(distinct session_id) filter (where type = 'pageview') as sessions,
                 round(avg(duration_ms) filter (where type = 'leave')) as avg_duration_ms
            from ev group by path having count(*) filter (where type = 'pageview') > 0 order by 2 desc limit 40) x), '[]'::jsonb),
      'clicks', coalesce((select jsonb_agg(x order by x.clicks desc) from (
          select label, path, count(*) as clicks from ev where type = 'click' and target is null and label is not null group by 1, 2 order by 3 desc limit 30) x), '[]'::jsonb),
      'links', coalesce((select jsonb_agg(x order by x.clicks desc) from (
          select target, max(label) as label, count(*) as clicks from ev where type = 'click' and target is not null group by 1 order by 3 desc limit 30) x), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(x order by x.sessions desc) from (
          select entry_path as path, count(*) as sessions from cur where entry_path is not null group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
      'exits', coalesce((select jsonb_agg(x order by x.sessions desc) from (
          select exit_path as path, count(*) as sessions from cur where exit_path is not null group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
      'routes', coalesce((select jsonb_agg(x order by x.sessions desc) from (
          select route, count(*) as sessions from seq group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
      'referrers', coalesce((select jsonb_agg(x order by x.sessions desc) from (
          select coalesce(referrer_host, 'Accès direct') as source, count(*) as sessions from cur group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(x order by x.sessions desc) from (
          select coalesce(utm_source, '—') as source, coalesce(utm_campaign, '—') as campaign, count(*) as sessions, count(*) filter (where converted) as conversions
            from cur where utm_source is not null or utm_campaign is not null group by 1, 2 order by 3 desc limit 15) x), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.platform_analytics_devices(p_from date, p_to date, p_country text, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.analytics_guard();
  return (
    with cur as (
      select * from public.analytics_sessions s
       where s.day between p_from and p_to
         and (nullif(p_country, '') is null or s.country = p_country) and (nullif(p_device, '') is null or s.device = p_device)
    )
    select jsonb_build_object(
      'devices', coalesce((select jsonb_object_agg(device, n) from (select device, count(*) n from cur group by 1) x), '{}'::jsonb),
      'os', coalesce((select jsonb_object_agg(os, n) from (select os, count(*) n from cur group by 1) x), '{}'::jsonb),
      'browsers', coalesce((select jsonb_object_agg(browser, n) from (select browser, count(*) n from cur group by 1) x), '{}'::jsonb),
      'conversion_by_device', coalesce((select jsonb_object_agg(device, rate) from (
          select device, round(100.0 * count(*) filter (where converted) / count(*), 1) as rate from cur group by 1) x), '{}'::jsonb)
    )
  );
end;
$$;

create or replace function public.platform_analytics_conversion(p_from date, p_to date, p_country text, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  perform app.analytics_guard();
  return (
    with cur as (
      select * from public.analytics_sessions s
       where s.day between p_from and p_to
         and (nullif(p_country, '') is null or s.country = p_country) and (nullif(p_device, '') is null or s.device = p_device)
    ),
    ev as (select e.* from public.analytics_events e join cur on cur.id = e.session_id)
    select jsonb_build_object(
      'sessions', (select count(*) from cur),
      'converted_sessions', (select count(*) from cur where converted),
      'events', coalesce((select jsonb_object_agg(label, n) from (select label, count(distinct session_id) n from ev where type = 'conversion' group by 1) x), '{}'::jsonb),
      'signup_started_sessions', (select count(distinct session_id) from ev where type = 'pageview' and (path = '/inscription' or path like '/inscription/%')),
      -- Chiffres des tables métier (font foi) : non filtrés par pays / appareil.
      'business', jsonb_build_object(
        'demo_requests', (select count(*) from public.site_leads l where l.kind = 'demo' and l.status <> 'spam' and l.created_at >= v_from and l.created_at < v_to),
        'contact_requests', (select count(*) from public.site_leads l where l.kind = 'contact' and l.status <> 'spam' and l.created_at >= v_from and l.created_at < v_to),
        'discover_requests', (select count(*) from public.org_leads l where l.created_at >= v_from and l.created_at < v_to),
        'signups_completed', (select count(*) from public.organizations o where not o.is_demo and o.parent_id is null and o.created_at >= v_from and o.created_at < v_to),
        'public_accounts', (select count(*) from public.public_accounts a where a.created_at >= v_from and a.created_at < v_to),
        'paid_subscriptions', (select count(distinct t.organization_id) from public.payment_transactions t where t.status = 'SUCCESS' and t.created_at >= v_from and t.created_at < v_to)
      )
    )
  );
end;
$$;

-- Surveillance des établissements (activité réelle : connexions, pages par module, actions).
create or replace function public.platform_analytics_organizations(p_from date, p_to date, p_country text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
begin
  perform app.analytics_guard();
  return (
    with orgs as (
      select o.id, o.name, o.type::text as type, o.country, o.status::text as status
        from public.organizations o
       where not o.is_demo and (nullif(p_country, '') is null or o.country = p_country)
    ),
    logins as (
      select a.organization_id, count(*) as logins, count(distinct a.actor_id) as users
        from public.audit_logs a where a.action = 'auth.login' and a.created_at >= v_from and a.created_at < v_to group by 1
    ),
    last_login as (select a.organization_id, max(a.created_at) as last_at from public.audit_logs a where a.action = 'auth.login' group by 1),
    actions as (
      select a.organization_id, count(*) as actions from public.audit_logs a
       where a.created_at >= v_from and a.created_at < v_to and a.action not like 'auth.%' group by 1
    ),
    usage as (
      select u.organization_id, sum(u.views) as views, count(distinct u.user_id) as users
        from public.analytics_app_usage u where u.day between p_from and p_to group by 1
    ),
    top_modules as (
      select organization_id, jsonb_agg(module order by views desc) filter (where rn <= 3) as modules
        from (select organization_id, module, sum(views) as views, row_number() over (partition by organization_id order by sum(views) desc) as rn
                from public.analytics_app_usage where day between p_from and p_to group by 1, 2) m
       group by 1
    )
    select jsonb_build_object(
      'active_organizations', (select count(*) from orgs where status = 'active'),
      'organizations_with_activity', (select count(*) from orgs join logins l on l.organization_id = orgs.id),
      'logins', (select coalesce(sum(l.logins), 0) from logins l join orgs on orgs.id = l.organization_id),
      'active_users', (select count(distinct a.actor_id) from public.audit_logs a join orgs on orgs.id = a.organization_id
                        where a.action = 'auth.login' and a.created_at >= v_from and a.created_at < v_to),
      'modules', coalesce((select jsonb_agg(x order by x.views desc) from (
          select u.module, sum(u.views) as views, count(distinct u.organization_id) as organizations, count(distinct u.user_id) as users
            from public.analytics_app_usage u join orgs on orgs.id = u.organization_id where u.day between p_from and p_to group by 1) x), '[]'::jsonb),
      'rows', coalesce((select jsonb_agg(x order by x.logins desc nulls last, x.name) from (
          select orgs.id, orgs.name, orgs.type, orgs.country, orgs.status, coalesce(l.logins, 0) as logins, coalesce(l.users, 0) as login_users,
                 ll.last_at as last_login, coalesce(ac.actions, 0) as actions, coalesce(us.views, 0) as page_views, coalesce(us.users, 0) as usage_users,
                 coalesce(tm.modules, '[]'::jsonb) as top_modules
            from orgs left join logins l on l.organization_id = orgs.id left join last_login ll on ll.organization_id = orgs.id
                      left join actions ac on ac.organization_id = orgs.id left join usage us on us.organization_id = orgs.id
                      left join top_modules tm on tm.organization_id = orgs.id) x), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.platform_analytics_overview(date, date, text, text), public.platform_analytics_geo(date, date, text, text),
  public.platform_analytics_behavior(date, date, text, text), public.platform_analytics_devices(date, date, text, text),
  public.platform_analytics_conversion(date, date, text, text), public.platform_analytics_organizations(date, date, text) from public, anon;
grant execute on function public.platform_analytics_overview(date, date, text, text), public.platform_analytics_geo(date, date, text, text),
  public.platform_analytics_behavior(date, date, text, text), public.platform_analytics_devices(date, date, text, text),
  public.platform_analytics_conversion(date, date, text, text), public.platform_analytics_organizations(date, date, text) to authenticated;
