-- =============================================================================
-- Super Admin — SA-9 : mesure d'audience du site public, respectueuse de la vie
-- privée : aucun cookie, aucune adresse IP ni identifiant d'appareil conservé.
-- Le serveur calcule une empreinte jetable (renouvelée chaque jour, non
-- réversible) pour compter les visiteurs uniques d'une journée. Les demandes
-- « ne pas me suivre » (DNT / GPC) et les robots déclarés ne sont pas comptés.
-- Les visites de plus de 13 mois sont supprimées automatiquement.
-- =============================================================================

create table public.site_visits (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  path text not null check (path ~ '^/' and char_length(path) <= 200),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  visitor text not null check (visitor ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create index site_visits_day_idx on public.site_visits (day);
create index site_visits_visitor_idx on public.site_visits (visitor, day);
alter table public.site_visits enable row level security;
create policy site_visits_select on public.site_visits for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.site_visits from authenticated, anon;

-- Enregistrement par le serveur du site (route /api/site/visite) : valeurs déjà nettoyées.
create or replace function public.record_site_visit(p_path text, p_referrer text, p_device text, p_locale text, p_country text, p_visitor text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Limite anti-abus : au plus 120 pages par empreinte et par jour.
  if (select count(*) from public.site_visits where visitor = p_visitor and day = current_date) >= 120 then
    return;
  end if;
  insert into public.site_visits (path, referrer_host, device, locale, country, visitor)
  values (left(p_path, 200), nullif(left(coalesce(p_referrer, ''), 120), ''), p_device, coalesce(p_locale, 'fr'), p_country, p_visitor);
  -- Conservation limitée (13 mois), purgée au fil de l'eau.
  if random() < 0.01 then
    delete from public.site_visits where day < current_date - interval '13 months';
  end if;
end;
$$;
revoke all on function public.record_site_visit(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_site_visit(text, text, text, text, text, text) to service_role;

create or replace function public.platform_visitor_stats(p_from date, p_to date)
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
    with v as (select * from public.site_visits where day between p_from and p_to),
    daily as (select day, count(*) as views, count(distinct visitor) as visitors from v group by day)
    select jsonb_build_object(
      'views', (select count(*) from v),
      'visitors', (select coalesce(sum(visitors), 0) from daily),
      'pages_per_visitor', (select case when sum(visitors) > 0 then round(sum(views)::numeric / sum(visitors), 1) end from daily),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(x.views, 0), 'visitors', coalesce(x.visitors, 0)) order by d)
          from generate_series(p_from::timestamptz, p_to::timestamptz, interval '1 day') d left join daily x on x.day = d::date), '[]'::jsonb),
      'pages', coalesce((select jsonb_agg(x order by x.views desc) from (select path, count(*) as views, count(distinct (visitor, day)) as visitors from v group by path order by 2 desc limit 12) x), '[]'::jsonb),
      'referrers', coalesce((select jsonb_agg(x order by x.views desc) from (select coalesce(referrer_host, 'Accès direct') as source, count(*) as views from v group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
      'devices', coalesce((select jsonb_object_agg(device, n) from (select device, count(distinct (visitor, day)) n from v group by device) x), '{}'::jsonb),
      'countries', coalesce((select jsonb_agg(x order by x.visitors desc) from (select coalesce(country, '—') as country, count(distinct (visitor, day)) as visitors from v group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
      'locales', coalesce((select jsonb_object_agg(locale, n) from (select locale, count(*) n from v group by locale) x), '{}'::jsonb),
      'leads', (select count(*) from public.site_leads l where l.created_at >= p_from::timestamptz and l.created_at < (p_to + 1)::timestamptz and l.status <> 'spam'),
      'demo_requests', (select count(*) from public.site_leads l where l.kind = 'demo' and l.created_at >= p_from::timestamptz and l.created_at < (p_to + 1)::timestamptz and l.status <> 'spam'),
      'signups', (select count(*) from public.organizations o where not o.is_demo and o.created_at >= p_from::timestamptz and o.created_at < (p_to + 1)::timestamptz)
    )
  );
end;
$$;
revoke all on function public.platform_visitor_stats(date, date) from public, anon;
grant execute on function public.platform_visitor_stats(date, date) to authenticated;
