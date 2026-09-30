-- =============================================================================
-- Super Admin : communication de la plateforme vers les établissements.
--  1. Annonces (bandeau affiché dans l'application des établissements) :
--     module(s) visé(s), public (tout le personnel ou la direction), dates,
--     ton, lien ; masquables par chaque utilisateur ; notification facultative.
--  2. Envois groupés aux directions : notification dans l'application (et push)
--     et e-mail réel via l'intégration configurée ; historique des envois.
-- Tout est réservé au Super Admin et journalisé. Aucune donnée n'est supprimée.
-- =============================================================================

-- Module d'un établissement : school / training / higher, ou multi pour un
-- groupe Module 4 et ses espaces.
create or replace function app.org_module(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.type = 'school_group' or p.type = 'school_group' then 'multi' else app.org_family(o.type::text) end
    from public.organizations o
    left join public.organizations p on p.id = o.parent_id
   where o.id = p_org;
$$;
revoke all on function app.org_module(uuid) from public, anon, authenticated;

-- Statut d'abonnement d'un établissement (celui du groupe pour un espace Module 4).
create or replace function app.org_subscription_status(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.status from public.subscriptions s where s.organization_id = p_org),
    (select s.status from public.subscriptions s join public.organizations o on o.parent_id = s.organization_id where o.id = p_org));
$$;
revoke all on function app.org_subscription_status(uuid) from public, anon, authenticated;

-- Membres de la direction (administrateur, direction) d'un établissement.
create or replace function app.is_org_direction(p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
     where m.organization_id = p_org and m.user_id = p_user and m.status = 'active' and r.key in ('org_admin', 'director'));
$$;
revoke all on function app.is_org_direction(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Annonces
-- -----------------------------------------------------------------------------
create table public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  tone text not null default 'info' check (tone in ('info', 'success', 'warning', 'danger')),
  modules text[] not null default '{}' check (modules <@ array['school', 'training', 'higher', 'multi']),
  audience text not null default 'staff' check (audience in ('staff', 'direction')),
  link_url text check (link_url is null or link_url ~ '^(/[A-Za-z0-9/_?=&.-]*|https://[^\s]{4,255})$'),
  link_label text check (link_label is null or char_length(btrim(link_label)) between 2 and 40),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  dismissible boolean not null default true,
  notified_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.platform_announcements enable row level security;
create policy platform_announcements_admin_read on public.platform_announcements for select to authenticated using (app.is_platform_admin());
revoke all on public.platform_announcements from anon, authenticated;
grant select on public.platform_announcements to authenticated;

create table public.platform_announcement_dismissals (
  announcement_id uuid not null references public.platform_announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.platform_announcement_dismissals enable row level security;
create policy platform_announcement_dismissals_own on public.platform_announcement_dismissals for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());
revoke all on public.platform_announcement_dismissals from anon, authenticated;
grant select on public.platform_announcement_dismissals to authenticated;

-- Annonce visible par un utilisateur dans un établissement ?
create or replace function app.announcement_targets(a public.platform_announcements, p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = p_user and m.status = 'active')
     and (cardinality(a.modules) = 0 or app.org_module(p_org) = any (a.modules))
     and (a.audience = 'staff' or app.is_org_direction(p_org, p_user));
$$;
revoke all on function app.announcement_targets(public.platform_announcements, uuid, uuid) from public, anon, authenticated;

-- Annonces en cours pour l'utilisateur connecté dans l'établissement actif.
create or replace function public.current_platform_announcements(p_org uuid)
returns table (id uuid, title text, body text, tone text, link_url text, link_label text, dismissible boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title, a.body, a.tone, a.link_url, a.link_label, a.dismissible
    from public.platform_announcements a
   where auth.uid() is not null
     and a.is_active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     and app.announcement_targets(a, p_org, auth.uid())
     and not exists (select 1 from public.platform_announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid())
   order by case a.tone when 'danger' then 0 when 'warning' then 1 else 2 end, a.starts_at desc
   limit 3;
$$;
revoke all on function public.current_platform_announcements(uuid) from public, anon;
grant execute on function public.current_platform_announcements(uuid) to authenticated;

create or replace function public.dismiss_platform_announcement(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.platform_announcements where id = p_id and dismissible) then
    raise exception 'Cette annonce ne peut pas être masquée.' using errcode = 'check_violation';
  end if;
  insert into public.platform_announcement_dismissals (announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end;
$$;
revoke all on function public.dismiss_platform_announcement(uuid) from public, anon;
grant execute on function public.dismiss_platform_announcement(uuid) to authenticated;

-- Création / modification. p_notify : envoie aussi une notification (et un push)
-- aux personnes visées, une seule fois par annonce et par personne.
create or replace function public.platform_save_announcement(
  p_id uuid, p_title text, p_body text, p_tone text, p_modules text[], p_audience text,
  p_link_url text, p_link_label text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_is_active boolean, p_dismissible boolean, p_notify boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.platform_announcements;
  v_notified integer := 0;
begin
  perform app.require_platform_admin();
  if p_id is null then
    insert into public.platform_announcements (title, body, tone, modules, audience, link_url, link_label, starts_at, ends_at, is_active, dismissible, created_by)
    values (btrim(p_title), btrim(p_body), coalesce(p_tone, 'info'), coalesce(p_modules, '{}'), coalesce(p_audience, 'staff'),
            nullif(btrim(p_link_url), ''), nullif(btrim(p_link_label), ''), coalesce(p_starts_at, now()), p_ends_at,
            coalesce(p_is_active, true), coalesce(p_dismissible, true), auth.uid())
    returning * into v;
  else
    update public.platform_announcements
       set title = btrim(p_title), body = btrim(p_body), tone = coalesce(p_tone, 'info'), modules = coalesce(p_modules, '{}'),
           audience = coalesce(p_audience, 'staff'), link_url = nullif(btrim(p_link_url), ''), link_label = nullif(btrim(p_link_label), ''),
           starts_at = coalesce(p_starts_at, starts_at), ends_at = p_ends_at, is_active = coalesce(p_is_active, true),
           dismissible = coalesce(p_dismissible, true), updated_at = now()
     where id = p_id
    returning * into v;
    if v.id is null then
      raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  if (v.link_url is null) <> (v.link_label is null) then
    raise exception 'Le lien et son libellé vont ensemble.' using errcode = 'check_violation';
  end if;

  if coalesce(p_notify, false) and v.is_active then
    insert into public.notifications (organization_id, user_id, type, title, body, link, data)
    select distinct on (m.user_id) m.organization_id, m.user_id, 'platform', v.title, v.body,
           case when v.link_url like '/%' then v.link_url else '/notifications' end,
           jsonb_build_object('announcement_id', v.id)
      from public.memberships m
      join public.organizations o on o.id = m.organization_id and o.status = 'active'
     where m.status = 'active'
       and app.announcement_targets(v, m.organization_id, m.user_id)
       and not exists (select 1 from public.notifications n where n.user_id = m.user_id and n.type = 'platform' and n.data ->> 'announcement_id' = v.id::text)
     order by m.user_id, m.created_at;
    get diagnostics v_notified = row_count;
    update public.platform_announcements set notified_count = notified_count + v_notified where id = v.id;
  end if;

  perform app.audit(null, 'platform.announcement_saved', 'platform_announcements', v.id,
    'Annonce plateforme : ' || v.title, jsonb_build_object('modules', v.modules, 'audience', v.audience, 'active', v.is_active, 'notified', v_notified));
  return jsonb_build_object('id', v.id, 'notified', v_notified);
end;
$$;
revoke all on function public.platform_save_announcement(uuid, text, text, text, text[], text, text, text, timestamptz, timestamptz, boolean, boolean, boolean) from public, anon;
grant execute on function public.platform_save_announcement(uuid, text, text, text, text[], text, text, text, timestamptz, timestamptz, boolean, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Envois groupés aux directions
-- -----------------------------------------------------------------------------
create table public.platform_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(btrim(subject)) between 3 and 150),
  body text not null check (char_length(btrim(body)) between 10 and 5000),
  modules text[] not null default '{}' check (modules <@ array['school', 'training', 'higher', 'multi']),
  statuses text[] not null default '{}'
    check (statuses <@ array['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'CANCELLED', 'EXPIRED']),
  channels text[] not null check (cardinality(channels) > 0 and channels <@ array['in_app', 'email']),
  include_demo boolean not null default false,
  organizations_count integer not null default 0,
  recipients_count integer not null default 0,
  in_app_count integer not null default 0,
  email_sent integer not null default 0,
  email_failed integer not null default 0,
  email_not_configured integer not null default 0,
  status text not null default 'sending' check (status in ('sending', 'done')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.platform_campaigns enable row level security;
create policy platform_campaigns_admin_read on public.platform_campaigns for select to authenticated using (app.is_platform_admin());
revoke all on public.platform_campaigns from anon, authenticated;
grant select on public.platform_campaigns to authenticated;

-- Destinataires : direction des établissements actifs correspondant aux filtres.
create or replace function app.campaign_recipients(p_modules text[], p_statuses text[], p_include_demo boolean)
returns table (organization_id uuid, organization_name text, user_id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (o.id, pr.id) o.id, o.name, pr.id, pr.email, btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))
    from public.organizations o
    join public.memberships m on m.organization_id = o.id and m.status = 'active'
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.key in ('org_admin', 'director')
    join public.profiles pr on pr.id = m.user_id and pr.is_active
   where o.status = 'active'
     and (coalesce(p_include_demo, false) or not o.is_demo)
     and (cardinality(coalesce(p_modules, '{}')) = 0 or app.org_module(o.id) = any (p_modules))
     and (cardinality(coalesce(p_statuses, '{}')) = 0 or app.org_subscription_status(o.id) = any (p_statuses))
   order by o.id, pr.id;
$$;
revoke all on function app.campaign_recipients(text[], text[], boolean) from public, anon, authenticated;

-- Aperçu (nombre d'établissements et de destinataires) avant envoi.
create or replace function public.platform_campaign_preview(p_modules text[], p_statuses text[], p_include_demo boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return (select jsonb_build_object('organizations', count(distinct organization_id), 'recipients', count(distinct user_id),
                                    'with_email', count(distinct user_id) filter (where email is not null and email like '%@%'))
            from app.campaign_recipients(p_modules, p_statuses, p_include_demo));
end;
$$;
revoke all on function public.platform_campaign_preview(text[], text[], boolean) from public, anon;
grant execute on function public.platform_campaign_preview(text[], text[], boolean) to authenticated;

-- Démarre un envoi : notifications dans l'application tout de suite ; renvoie
-- la liste des e-mails à envoyer par le serveur (intégration configurée).
create or replace function public.platform_start_campaign(
  p_subject text, p_body text, p_modules text[], p_statuses text[], p_channels text[], p_include_demo boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.platform_campaigns;
  v_in_app integer := 0;
  v_orgs integer;
  v_recipients integer;
begin
  perform app.require_platform_admin();
  select count(distinct organization_id), count(distinct user_id) into v_orgs, v_recipients
    from app.campaign_recipients(p_modules, p_statuses, p_include_demo);
  if v_recipients = 0 then
    raise exception 'Aucun destinataire ne correspond à ces critères.' using errcode = 'check_violation';
  end if;
  insert into public.platform_campaigns (subject, body, modules, statuses, channels, include_demo, organizations_count, recipients_count, created_by)
  values (btrim(p_subject), btrim(p_body), coalesce(p_modules, '{}'), coalesce(p_statuses, '{}'), coalesce(p_channels, '{}'),
          coalesce(p_include_demo, false), v_orgs, v_recipients, auth.uid())
  returning * into v;

  if 'in_app' = any (v.channels) then
    insert into public.notifications (organization_id, user_id, type, title, body, link, data)
    select r.organization_id, r.user_id, 'platform', v.subject, v.body, '/notifications', jsonb_build_object('campaign_id', v.id)
      from app.campaign_recipients(v.modules, v.statuses, v.include_demo) r;
    get diagnostics v_in_app = row_count;
  end if;
  update public.platform_campaigns
     set in_app_count = v_in_app,
         status = case when 'email' = any (v.channels) then 'sending' else 'done' end,
         completed_at = case when 'email' = any (v.channels) then null else now() end
   where id = v.id;

  perform app.audit(null, 'platform.campaign_started', 'platform_campaigns', v.id, 'Envoi groupé : ' || v.subject,
    jsonb_build_object('channels', v.channels, 'modules', v.modules, 'statuses', v.statuses, 'recipients', v_recipients));
  return jsonb_build_object(
    'id', v.id, 'organizations', v_orgs, 'recipients', v_recipients, 'in_app', v_in_app,
    'emails', case when 'email' = any (v.channels) then coalesce((
      select jsonb_agg(jsonb_build_object('email', e.email, 'name', e.full_name, 'organization_name', e.organization_name))
        from (select distinct on (lower(r.email)) r.email, r.full_name, r.organization_name
                from app.campaign_recipients(v.modules, v.statuses, v.include_demo) r
               where r.email like '%@%' order by lower(r.email)) e), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;
revoke all on function public.platform_start_campaign(text, text, text[], text[], text[], boolean) from public, anon;
grant execute on function public.platform_start_campaign(text, text, text[], text[], text[], boolean) to authenticated;

-- Résultat des e-mails envoyés par le serveur.
create or replace function public.platform_finish_campaign(p_id uuid, p_sent integer, p_failed integer, p_not_configured integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_campaigns
     set email_sent = greatest(coalesce(p_sent, 0), 0), email_failed = greatest(coalesce(p_failed, 0), 0),
         email_not_configured = greatest(coalesce(p_not_configured, 0), 0), status = 'done', completed_at = now()
   where id = p_id and status = 'sending';
  if not found then
    raise exception 'Envoi introuvable ou déjà terminé.' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.platform_finish_campaign(uuid, integer, integer, integer) from public, anon;
grant execute on function public.platform_finish_campaign(uuid, integer, integer, integer) to authenticated;
