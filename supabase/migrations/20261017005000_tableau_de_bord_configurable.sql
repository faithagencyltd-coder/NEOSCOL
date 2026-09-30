-- =============================================================================
-- Tableau de bord configurable : chaque utilisateur choisit, par établissement,
-- les blocs affichés sur son tableau de bord. Préférence d'affichage seulement :
-- les droits d'accès aux données ne changent pas (un bloc non autorisé reste
-- invisible, qu'il soit coché ou non).
-- =============================================================================

create table public.dashboard_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hidden text[] not null default '{}'
    check (hidden <@ array['stats', 'finance', 'activity', 'alerts', 'lessons', 'teaching', 'by_class', 'averages', 'announcements']),
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);
alter table public.dashboard_preferences enable row level security;
create policy dashboard_preferences_own on public.dashboard_preferences for select to authenticated using (user_id = auth.uid());
revoke all on public.dashboard_preferences from anon, authenticated;
grant select on public.dashboard_preferences to authenticated;

create or replace function public.save_dashboard_preferences(p_org uuid, p_hidden text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hidden text[];
begin
  if auth.uid() is null or not (p_org = any (app.member_org_ids())) then
    raise exception 'Établissement non accessible.' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(array_agg(distinct h order by h), '{}') into v_hidden
    from unnest(coalesce(p_hidden, '{}')) h
   where h = any (array['stats', 'finance', 'activity', 'alerts', 'lessons', 'teaching', 'by_class', 'averages', 'announcements']);
  insert into public.dashboard_preferences (user_id, organization_id, hidden)
  values (auth.uid(), p_org, v_hidden)
  on conflict (user_id, organization_id) do update set hidden = excluded.hidden, updated_at = now();
  return v_hidden;
end;
$$;
revoke all on function public.save_dashboard_preferences(uuid, text[]) from public, anon;
grant execute on function public.save_dashboard_preferences(uuid, text[]) to authenticated;
