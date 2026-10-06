-- =============================================================================
-- Super Admin — SA-10 : maintenance et versions.
--  • Mode maintenance : activé/désactivé par la plateforme (motif obligatoire,
--    journalisé). Les établissements voient un message clair ; l'équipe de la
--    plateforme garde l'accès pour vérifier. Aucune donnée n'est touchée.
--  • Versions : chaque version réellement démarrée par le serveur est
--    enregistrée (numéro, commit, date de construction, première et dernière
--    mise en service). Aucune mise à jour ni retour arrière n'est déclenché
--    depuis l'application : ces opérations se font chez l'hébergeur.
-- =============================================================================

create table public.platform_maintenance (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  message text not null default 'NeoScool est en cours de maintenance. Le service revient très vite.' check (char_length(message) between 5 and 500),
  ends_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_maintenance (id) values (1) on conflict do nothing;
alter table public.platform_maintenance enable row level security;
create policy platform_maintenance_select on public.platform_maintenance for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.platform_maintenance from authenticated, anon;

-- État public de la maintenance (message affiché aux utilisateurs).
create or replace function public.maintenance_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('enabled', m.enabled and (m.ends_at is null or m.ends_at > now()), 'message', m.message, 'ends_at', m.ends_at)
    from public.platform_maintenance m where m.id = 1;
$$;
grant execute on function public.maintenance_state() to anon, authenticated;

create or replace function public.platform_set_maintenance(p_enabled boolean, p_message text, p_ends_at timestamptz, p_reason text)
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
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'La fin prévue doit être dans le futur.' using errcode = 'check_violation';
  end if;
  update public.platform_maintenance
     set enabled = p_enabled,
         message = coalesce(nullif(btrim(coalesce(p_message, '')), ''), message),
         ends_at = case when p_enabled then p_ends_at end,
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.audit(null, case when p_enabled then 'platform.maintenance_on' else 'platform.maintenance_off' end, 'platform_maintenance', null,
    case when p_enabled then 'Mode maintenance activé' else 'Mode maintenance désactivé' end,
    jsonb_build_object('reason', left(btrim(p_reason), 500), 'ends_at', p_ends_at));
end;
$$;
revoke all on function public.platform_set_maintenance(boolean, text, timestamptz, text) from public, anon;
grant execute on function public.platform_set_maintenance(boolean, text, timestamptz, text) to authenticated;

create table public.platform_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null check (char_length(version) <= 40),
  commit_sha text not null default '' check (char_length(commit_sha) <= 64),
  built_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (version, commit_sha)
);
alter table public.platform_releases enable row level security;
create policy platform_releases_select on public.platform_releases for select to authenticated using ((select app.is_platform_admin()));
revoke insert, update, delete on public.platform_releases from authenticated, anon;

-- Appelée par le serveur à son démarrage (clé de service) : enregistre la version réellement en service.
create or replace function public.record_release(p_version text, p_commit text, p_built_at timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.platform_releases (version, commit_sha, built_at)
  values (left(coalesce(p_version, '?'), 40), left(coalesce(p_commit, ''), 64), p_built_at)
  on conflict (version, commit_sha) do update set last_seen_at = now(), built_at = coalesce(excluded.built_at, public.platform_releases.built_at);
end;
$$;
revoke all on function public.record_release(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_release(text, text, timestamptz) to service_role;

-- Historique des versions avec les erreurs et incidents constatés pendant leur période de service.
create or replace function public.platform_release_history()
returns table (version text, commit_sha text, built_at timestamptz, first_seen_at timestamptz, last_seen_at timestamptz,
               failures bigint, denied bigint, incidents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query
    with r as (
      select x.*, lead(x.first_seen_at) over (order by x.first_seen_at) as next_at from public.platform_releases x
    )
    select r.version, r.commit_sha, r.built_at, r.first_seen_at, r.last_seen_at,
           (select count(*) from public.audit_logs a where a.result = 'failure' and a.created_at >= r.first_seen_at and a.created_at < coalesce(r.next_at, now())),
           (select count(*) from public.audit_logs a where a.result = 'denied' and a.created_at >= r.first_seen_at and a.created_at < coalesce(r.next_at, now())),
           (select count(*) from public.support_tickets t where t.created_at >= r.first_seen_at and t.created_at < coalesce(r.next_at, now()))
      from r order by r.first_seen_at desc limit 30;
end;
$$;
revoke all on function public.platform_release_history() from public, anon;
grant execute on function public.platform_release_history() to authenticated;
