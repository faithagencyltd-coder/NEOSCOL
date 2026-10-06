-- =============================================================================
-- Écosystème public — E5 : NeoScool Opportunities.
-- Recrutements (publiés par les établissements), demandes de répétiteurs et de
-- cours (particuliers), services proposés par des enseignants et formateurs.
--  • Même compte NeoScool pour tous ; un particulier sans établissement peut
--    créer un compte « public » pour postuler, publier ou répondre.
--  • Coordonnées jamais affichées publiquement : les échanges passent par la
--    candidature / réponse ; l'adresse de l'auteur n'est révélée qu'après
--    acceptation.
--  • Modération par la plateforme (si exigée), signalements, expiration.
--  • Module fermé par défaut (Contrôle des modules), ouvert par pays ou
--    par établissement.
-- =============================================================================

create table public.public_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  account_type text not null check (account_type in ('candidate', 'parent', 'teacher', 'trainer', 'other')),
  country text references public.countries (code),
  city text check (city is null or char_length(city) <= 80),
  created_at timestamptz not null default now()
);
alter table public.public_accounts enable row level security;
create policy public_accounts_select on public.public_accounts for select to authenticated using (user_id = auth.uid() or (select app.is_platform_admin()));
revoke insert, update, delete on public.public_accounts from authenticated, anon;

create or replace function public.register_public_account(p_type text, p_country text, p_city text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.public_accounts (user_id, account_type, country, city)
  values (auth.uid(), p_type, nullif(p_country, ''), nullif(btrim(coalesce(p_city, '')), ''))
  on conflict (user_id) do update set account_type = excluded.account_type, country = excluded.country, city = excluded.city;
end;
$$;

create table public.opportunity_categories (
  key text primary key check (key ~ '^[a-z_]{3,40}$'),
  label text not null check (char_length(btrim(label)) between 3 and 80),
  kind text not null check (kind in ('job', 'tutoring_request', 'service', 'other')),
  poster text not null check (poster in ('organization', 'individual', 'both')),
  description text check (description is null or char_length(description) <= 300),
  sort_order integer not null default 100,
  active boolean not null default true
);
-- Catégories de départ (configuration, modifiables par le Super Admin).
insert into public.opportunity_categories (key, label, kind, poster, sort_order) values
  ('recrutement_educatif', 'Recrutement dans le secteur éducatif', 'job', 'organization', 10),
  ('emploi_enseignant', 'Offres d''emploi pour enseignants', 'job', 'organization', 20),
  ('emploi_formateur', 'Offres d''emploi pour formateurs', 'job', 'organization', 30),
  ('recrutement_administratif', 'Recrutement administratif', 'job', 'organization', 40),
  ('personnel_educatif', 'Recrutement de personnel éducatif', 'job', 'organization', 50),
  ('recherche_repetiteur', 'Recherche de répétiteurs', 'tutoring_request', 'individual', 60),
  ('demande_cours', 'Demandes de cours particuliers', 'tutoring_request', 'individual', 70),
  ('cours_particuliers', 'Enseignants proposant des cours particuliers', 'service', 'individual', 80),
  ('services_formateur', 'Formateurs proposant leurs services', 'service', 'individual', 90),
  ('soutien_scolaire', 'Soutien scolaire', 'service', 'both', 100),
  ('services_educatifs', 'Services éducatifs', 'service', 'both', 110),
  ('prestations_pedagogiques', 'Prestations pédagogiques', 'service', 'both', 120)
on conflict (key) do nothing;
alter table public.opportunity_categories enable row level security;
create policy opportunity_categories_select on public.opportunity_categories for select to anon, authenticated using (true);
revoke insert, update, delete on public.opportunity_categories from authenticated, anon;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  category text not null references public.opportunity_categories (key),
  author_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 140),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  country text not null references public.countries (code),
  city text check (city is null or char_length(city) <= 80),
  location text check (location is null or char_length(location) <= 200),
  subject text check (subject is null or char_length(subject) <= 120),
  level text check (level is null or char_length(level) <= 120),
  compensation text check (compensation is null or char_length(compensation) <= 120),
  contract text check (contract is null or char_length(contract) <= 120),
  schedule text check (schedule is null or char_length(schedule) <= 200),
  starts_on date,
  expires_at date not null default (current_date + 30),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'suspended', 'archived', 'rejected')),
  visibility text not null default 'public' check (visibility in ('public', 'members')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  featured_until timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at <= created_at::date + 180)
);
create index opportunities_list_idx on public.opportunities (status, country, category, published_at desc);
alter table public.opportunities enable row level security;
create policy opportunities_select on public.opportunities for select to authenticated
  using (author_id = auth.uid() or (organization_id is not null and app.has_permission(organization_id, 'staff.manage')) or (select app.is_platform_admin()));
revoke insert, update, delete on public.opportunities from authenticated, anon;

create table public.opportunity_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 150),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  content bytea not null check (octet_length(content) = size_bytes),
  created_at timestamptz not null default now()
);
alter table public.opportunity_files enable row level security;
create policy opportunity_files_select on public.opportunity_files for select to authenticated using (owner_id = auth.uid());
-- Le contenu du fichier n'est jamais lisible directement (téléchargement contrôlé par opportunity_file_download).
revoke all on public.opportunity_files from authenticated, anon;
grant select (id, owner_id, file_name, mime_type, size_bytes, created_at) on public.opportunity_files to authenticated;

create table public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  cv_file_id uuid references public.opportunity_files (id) on delete set null,
  status text not null default 'received' check (status in ('received', 'reviewing', 'shortlisted', 'interview', 'accepted', 'rejected', 'withdrawn')),
  author_unread boolean not null default true,
  applicant_unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, applicant_id)
);
create table public.opportunity_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.opportunity_applications (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('status', 'message')),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);

-- Gestion d'une annonce : son auteur, ou les responsables du personnel de l'établissement qui l'a publiée.
create or replace function app.can_manage_opportunity(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.opportunities o where o.id = p_id
                  and (o.author_id = auth.uid() or (o.organization_id is not null and app.has_permission(o.organization_id, 'staff.manage'))));
$$;

alter table public.opportunity_applications enable row level security;
alter table public.opportunity_application_events enable row level security;
create policy opportunity_applications_select on public.opportunity_applications for select to authenticated
  using (applicant_id = auth.uid() or app.can_manage_opportunity(opportunity_id));
create policy opportunity_application_events_select on public.opportunity_application_events for select to authenticated
  using (exists (select 1 from public.opportunity_applications a where a.id = application_id and (a.applicant_id = auth.uid() or app.can_manage_opportunity(a.opportunity_id))));
revoke insert, update, delete on public.opportunity_applications, public.opportunity_application_events from authenticated, anon;

create table public.opportunity_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);
alter table public.opportunity_favorites enable row level security;
create policy opportunity_favorites_select on public.opportunity_favorites for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.opportunity_favorites from authenticated, anon;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('profile', 'campaign', 'opportunity')),
  target_id uuid not null,
  reason text not null check (reason in ('fraud', 'inappropriate', 'misleading', 'personal_data', 'discrimination', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  reporter_id uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.content_reports enable row level security;
create policy content_reports_select on public.content_reports for select to authenticated using ((select app.is_platform_admin()) or reporter_id = auth.uid());
revoke insert, update, delete on public.content_reports from authenticated, anon;

-- Annonce visible : publiée, non expirée, module ouvert (établissement ou pays du particulier).
create or replace function app.opportunity_public(o public.opportunities)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select o.status = 'published' and o.expires_at >= current_date
     and case when o.organization_id is not null
              then app.module_enabled('opportunities', o.organization_id)
                   and exists (select 1 from public.organizations g where g.id = o.organization_id and g.status = 'active' and not g.is_demo)
              else app.module_enabled_in_country('opportunities', o.country) end
     and exists (select 1 from public.profiles p where p.id = o.author_id and p.is_active);
$$;

-- Nom affiché de l'auteur : l'établissement, ou le prénom et l'initiale du particulier (jamais ses coordonnées).
create or replace function app.opportunity_author(o public.opportunities)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.organization_id is not null then
      jsonb_build_object('kind', 'organization', 'name', g.name,
        'verified', exists (select 1 from public.org_public_profiles pp where pp.organization_id = g.id and pp.verification_status = 'verified'),
        'profile_slug', (select pp.slug from public.org_public_profiles pp where pp.organization_id = g.id and app.profile_public(pp)))
    else jsonb_build_object('kind', 'individual', 'name', coalesce(nullif(btrim(p.first_name), ''), 'Particulier') || coalesce(' ' || left(nullif(btrim(p.last_name), ''), 1) || '.', ''), 'verified', false)
    end
  from public.profiles p left join public.organizations g on g.id = o.organization_id
  where p.id = o.author_id;
$$;

create or replace function public.save_opportunity(p_id uuid, p_data jsonb, p_submit boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  c public.opportunity_categories;
  v_org uuid := nullif(p_data ->> 'organization_id', '')::uuid;
  v_country text := upper(coalesce(p_data ->> 'country', ''));
  v_review boolean := (select opportunities_require_review from public.ecosystem_settings where id = 1);
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.opportunity_categories where key = p_data ->> 'category' and active;
  if c.key is null then
    raise exception 'Catégorie inconnue.' using errcode = 'check_violation';
  end if;
  if c.poster = 'organization' and v_org is null then
    raise exception 'Cette catégorie est réservée aux établissements.' using errcode = 'check_violation';
  end if;
  if c.poster = 'individual' and v_org is not null then
    raise exception 'Cette catégorie est réservée aux particuliers.' using errcode = 'check_violation';
  end if;
  if v_org is not null then
    if not app.has_permission(v_org, 'staff.manage') then
      raise exception 'Droit « Personnel » requis pour publier au nom de l''établissement.' using errcode = 'insufficient_privilege';
    end if;
    if not app.module_enabled('opportunities', v_org) then
      raise exception 'NeoScool Opportunities n''est pas encore ouvert pour votre établissement.' using errcode = 'insufficient_privilege';
    end if;
    select country into v_country from public.organizations where id = v_org;
  elsif not app.module_enabled_in_country('opportunities', v_country) then
    raise exception 'NeoScool Opportunities n''est pas encore ouvert dans ce pays.' using errcode = 'insufficient_privilege';
  end if;
  v_status := case when p_submit then case when v_review then 'pending' else 'published' end else 'draft' end;
  if v_id is null then
    insert into public.opportunities (category, author_id, organization_id, title, description, country, city, location, subject, level,
        compensation, contract, schedule, starts_on, expires_at, status, visibility, published_at)
    values (c.key, auth.uid(), v_org, btrim(p_data ->> 'title'), btrim(p_data ->> 'description'), v_country,
        nullif(btrim(p_data ->> 'city'), ''), nullif(btrim(p_data ->> 'location'), ''), nullif(btrim(p_data ->> 'subject'), ''),
        nullif(btrim(p_data ->> 'level'), ''), nullif(btrim(p_data ->> 'compensation'), ''), nullif(btrim(p_data ->> 'contract'), ''),
        nullif(btrim(p_data ->> 'schedule'), ''), nullif(p_data ->> 'starts_on', '')::date,
        coalesce(nullif(p_data ->> 'expires_at', '')::date, current_date + 30), v_status,
        case when p_data ->> 'visibility' = 'members' then 'members' else 'public' end,
        case when v_status = 'published' then now() end)
    returning id into v_id;
  else
    if not app.can_manage_opportunity(v_id) then
      raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
    end if;
    update public.opportunities set
        category = c.key, title = btrim(p_data ->> 'title'), description = btrim(p_data ->> 'description'), country = v_country,
        city = nullif(btrim(p_data ->> 'city'), ''), location = nullif(btrim(p_data ->> 'location'), ''), subject = nullif(btrim(p_data ->> 'subject'), ''),
        level = nullif(btrim(p_data ->> 'level'), ''), compensation = nullif(btrim(p_data ->> 'compensation'), ''), contract = nullif(btrim(p_data ->> 'contract'), ''),
        schedule = nullif(btrim(p_data ->> 'schedule'), ''), starts_on = nullif(p_data ->> 'starts_on', '')::date,
        expires_at = coalesce(nullif(p_data ->> 'expires_at', '')::date, expires_at),
        visibility = case when p_data ->> 'visibility' = 'members' then 'members' else 'public' end,
        status = case when status = 'suspended' then status else v_status end,
        published_at = case when v_status = 'published' then coalesce(published_at, now()) else published_at end,
        moderation_note = null, updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.archive_opportunity(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_opportunity(p_id) then
    raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
  end if;
  update public.opportunities set status = 'archived', updated_at = now() where id = p_id;
end;
$$;

-- Liste publique : uniquement les champs publiables ; aucune coordonnée.
create or replace function public.opportunities_search(p_query text, p_category text, p_kind text, p_country text, p_city text, p_limit integer, p_offset integer)
returns table (id uuid, category text, category_label text, kind text, title text, excerpt text, country text, city text, subject text, level text,
               compensation text, contract text, published_at timestamptz, expires_at date, featured boolean, author jsonb, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.category, c.label, c.kind, o.title, left(o.description, 220), o.country, o.city, o.subject, o.level, o.compensation, o.contract,
         o.published_at, o.expires_at, coalesce(o.featured_until > now(), false), app.opportunity_author(o), count(*) over ()
    from public.opportunities o join public.opportunity_categories c on c.key = o.category
   where app.opportunity_public(o)
     and (o.visibility = 'public' or auth.uid() is not null)
     and (nullif(btrim(p_query), '') is null or o.title ilike '%' || btrim(p_query) || '%' or o.description ilike '%' || btrim(p_query) || '%' or o.subject ilike '%' || btrim(p_query) || '%')
     and (nullif(p_category, '') is null or o.category = p_category)
     and (nullif(p_kind, '') is null or c.kind = p_kind)
     and (nullif(p_country, '') is null or o.country = p_country)
     and (nullif(btrim(p_city), '') is null or lower(o.city) = lower(btrim(p_city)))
   order by coalesce(o.featured_until > now(), false) desc, o.published_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 60) offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.opportunities_search(text, text, text, text, text, integer, integer) to anon, authenticated;

create or replace function public.opportunity_detail(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', o.id, 'category', o.category, 'category_label', c.label, 'kind', c.kind, 'title', o.title, 'description', o.description,
      'country', o.country, 'city', o.city, 'location', o.location, 'subject', o.subject, 'level', o.level, 'compensation', o.compensation,
      'contract', o.contract, 'schedule', o.schedule, 'starts_on', o.starts_on, 'published_at', o.published_at, 'expires_at', o.expires_at,
      'author', app.opportunity_author(o), 'mine', o.author_id = auth.uid(),
      'favorite', exists (select 1 from public.opportunity_favorites f where f.opportunity_id = o.id and f.user_id = auth.uid()),
      'my_application', (select jsonb_build_object('id', a.id, 'status', a.status) from public.opportunity_applications a where a.opportunity_id = o.id and a.applicant_id = auth.uid()))
    from public.opportunities o join public.opportunity_categories c on c.key = o.category
   where o.id = p_id and app.opportunity_public(o) and (o.visibility = 'public' or auth.uid() is not null);
$$;
grant execute on function public.opportunity_detail(uuid) to anon, authenticated;

create or replace function public.upload_opportunity_file(p_name text, p_mime text, p_content bytea)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.opportunity_files where owner_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de fichiers envoyés aujourd''hui.' using errcode = 'check_violation';
  end if;
  insert into public.opportunity_files (owner_id, file_name, mime_type, size_bytes, content)
  values (auth.uid(), left(replace(replace(coalesce(p_name, 'cv'), '/', '_'), '\', '_'), 150), p_mime, octet_length(p_content), p_content)
  returning id into v_id;
  return v_id;
end;
$$;

-- Candidature ou réponse (répétiteur, service) : une seule par annonce et par personne.
create or replace function public.apply_opportunity(p_id uuid, p_message text, p_cv uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.opportunities;
  v_id uuid;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour répondre.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.opportunities where id = p_id;
  if o.id is null or not app.opportunity_public(o) then
    raise exception 'Annonce introuvable ou expirée.' using errcode = 'no_data_found';
  end if;
  if o.author_id = auth.uid() then
    raise exception 'Vous ne pouvez pas répondre à votre propre annonce.' using errcode = 'check_violation';
  end if;
  if p_cv is not null and not exists (select 1 from public.opportunity_files where id = p_cv and owner_id = auth.uid()) then
    raise exception 'Fichier invalide.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.opportunity_applications where opportunity_id = p_id and applicant_id = auth.uid()) then
    raise exception 'Vous avez déjà répondu à cette annonce.' using errcode = 'unique_violation';
  end if;
  insert into public.opportunity_applications (opportunity_id, applicant_id, message, cv_file_id)
  values (p_id, auth.uid(), btrim(p_message), p_cv) returning id into v_id;
  if o.organization_id is not null then
    for r in select distinct m.user_id from public.memberships m
               join public.membership_roles mr on mr.membership_id = m.id
               join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = 'staff.manage'
              where m.organization_id = o.organization_id and m.status = 'active' loop
      perform app.notify(o.organization_id, r.user_id, 'application', 'Nouvelle candidature : ' || left(o.title, 80), null, '/visibilite/opportunites', '{}'::jsonb);
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.update_application_status(p_application uuid, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.opportunity_applications;
begin
  select * into a from public.opportunity_applications where id = p_application for update;
  if a.id is null then
    raise exception 'Candidature introuvable.' using errcode = 'no_data_found';
  end if;
  if p_status = 'withdrawn' then
    if a.applicant_id <> auth.uid() then
      raise exception 'Candidature introuvable.' using errcode = 'no_data_found';
    end if;
  elsif not app.can_manage_opportunity(a.opportunity_id) or p_status not in ('received', 'reviewing', 'shortlisted', 'interview', 'accepted', 'rejected') then
    raise exception 'Candidature introuvable.' using errcode = 'no_data_found';
  end if;
  update public.opportunity_applications
     set status = p_status, updated_at = now(),
         applicant_unread = p_status <> 'withdrawn', author_unread = p_status = 'withdrawn'
   where id = p_application;
  insert into public.opportunity_application_events (application_id, author_id, kind, body)
  values (p_application, auth.uid(), 'status', a.status || ' → ' || p_status || coalesce(' : ' || nullif(btrim(p_note), ''), ''));
end;
$$;

create or replace function public.add_application_message(p_application uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.opportunity_applications;
  v_author boolean;
begin
  select * into a from public.opportunity_applications where id = p_application for update;
  v_author := a.id is not null and app.can_manage_opportunity(a.opportunity_id);
  if a.id is null or (a.applicant_id <> auth.uid() and not v_author) then
    raise exception 'Candidature introuvable.' using errcode = 'no_data_found';
  end if;
  if a.status in ('rejected', 'withdrawn') then
    raise exception 'Échange clos.' using errcode = 'check_violation';
  end if;
  insert into public.opportunity_application_events (application_id, author_id, kind, body) values (p_application, auth.uid(), 'message', btrim(p_body));
  update public.opportunity_applications set updated_at = now(), applicant_unread = v_author, author_unread = not v_author where id = p_application;
end;
$$;

-- Espace personnel : annonces publiées, candidatures envoyées (avec l'adresse de l'auteur une fois acceptée), favoris.
create or replace function public.my_opportunity_space()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'account', (select to_jsonb(pa) from public.public_accounts pa where pa.user_id = auth.uid()),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status, 'expires_at', o.expires_at,
        'organization_id', o.organization_id, 'moderation_note', o.moderation_note, 'expired', o.expires_at < current_date,
        'applications', (select count(*) from public.opportunity_applications a where a.opportunity_id = o.id and a.status <> 'withdrawn'),
        'unread', (select count(*) from public.opportunity_applications a where a.opportunity_id = o.id and a.author_unread)) order by o.created_at desc)
      from public.opportunities o where o.author_id = auth.uid() and o.organization_id is null), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status, 'unread', a.applicant_unread, 'created_at', a.created_at,
        'opportunity_id', o.id, 'title', o.title, 'author', app.opportunity_author(o),
        'author_email', case when a.status = 'accepted' and o.organization_id is null then p.email end) order by a.updated_at desc)
      from public.opportunity_applications a join public.opportunities o on o.id = a.opportunity_id join public.profiles p on p.id = o.author_id
     where a.applicant_id = auth.uid()), '[]'::jsonb),
    'favorites', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'city', o.city, 'expires_at', o.expires_at))
      from public.opportunity_favorites f join public.opportunities o on o.id = f.opportunity_id where f.user_id = auth.uid() and app.opportunity_public(o)), '[]'::jsonb));
$$;

create or replace function public.toggle_opportunity_favorite(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.opportunity_favorites where user_id = auth.uid() and opportunity_id = p_id;
  if found then return false; end if;
  insert into public.opportunity_favorites (user_id, opportunity_id)
  select auth.uid(), o.id from public.opportunities o where o.id = p_id and app.opportunity_public(o);
  return found;
end;
$$;

-- Téléchargement d'un CV : son propriétaire, ou le gestionnaire d'une annonce à laquelle il a été joint.
create or replace function public.opportunity_file_download(p_id uuid)
returns table (file_name text, mime_type text, content bytea)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.opportunity_files f where f.id = p_id and f.owner_id = auth.uid())
     and not exists (select 1 from public.opportunity_applications a where a.cv_file_id = p_id and app.can_manage_opportunity(a.opportunity_id)) then
    raise exception 'Fichier introuvable.' using errcode = 'no_data_found';
  end if;
  return query select f.file_name, f.mime_type, f.content from public.opportunity_files f where f.id = p_id;
end;
$$;

-- Signalement (compte connecté ; limite quotidienne).
create or replace function public.submit_content_report(p_type text, p_target uuid, p_reason text, p_details text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour signaler un contenu.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.content_reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Trop de signalements aujourd''hui.' using errcode = 'check_violation';
  end if;
  insert into public.content_reports (target_type, target_id, reason, details, reporter_id)
  values (p_type, p_target, p_reason, nullif(btrim(coalesce(p_details, '')), ''), auth.uid());
end;
$$;

-- Modération par la plateforme : fiche, campagne ou annonce (motif obligatoire sauf approbation).
create or replace function public.platform_moderate(p_type text, p_id uuid, p_action text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('approve', 'reject', 'suspend', 'restore') then
    raise exception 'Action inconnue.' using errcode = 'check_violation';
  end if;
  if p_action <> 'approve' and p_action <> 'restore' and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_type = 'profile' then
    update public.org_public_profiles
       set review_status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else review_status end,
           moderation = case p_action when 'suspend' then 'suspended' when 'restore' then 'ok' else moderation end,
           moderation_note = nullif(btrim(coalesce(p_note, '')), '')
     where organization_id = p_id returning organization_id into v_org;
  elsif p_type = 'campaign' then
    update public.promo_campaigns
       set status = case p_action when 'approve' then 'published' when 'reject' then 'rejected' when 'suspend' then 'suspended' else 'published' end,
           moderation_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
     where id = p_id returning organization_id into v_org;
  elsif p_type = 'opportunity' then
    update public.opportunities
       set status = case p_action when 'approve' then 'published' when 'reject' then 'rejected' when 'suspend' then 'suspended' else 'published' end,
           published_at = case when p_action in ('approve', 'restore') then coalesce(published_at, now()) else published_at end,
           moderation_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
     where id = p_id returning organization_id into v_org;
  else
    raise exception 'Type inconnu.' using errcode = 'check_violation';
  end if;
  if not found then
    raise exception 'Contenu introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(v_org, 'platform.moderation', p_type, p_id, 'Modération (' || p_type || ') : ' || p_action, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.platform_resolve_report(p_id uuid, p_status text, p_note text)
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
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Statut inconnu.' using errcode = 'check_violation';
  end if;
  update public.content_reports set status = p_status, resolution_note = nullif(btrim(coalesce(p_note, '')), ''), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and status = 'open';
  if not found then
    raise exception 'Signalement introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(null, 'platform.report_resolved', 'content_reports', p_id, 'Signalement ' || p_status, '{}'::jsonb);
end;
$$;

create or replace function public.platform_save_opportunity_category(p_key text, p_label text, p_kind text, p_poster text, p_description text, p_sort integer, p_active boolean)
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
  insert into public.opportunity_categories (key, label, kind, poster, description, sort_order, active)
  values (p_key, btrim(p_label), p_kind, p_poster, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_sort, 100), p_active)
  on conflict (key) do update set label = excluded.label, kind = excluded.kind, poster = excluded.poster, description = excluded.description,
      sort_order = excluded.sort_order, active = excluded.active;
  perform app.audit(null, 'platform.opportunity_category', 'opportunity_categories', null, 'Catégorie d''opportunités : ' || btrim(p_label), '{}'::jsonb);
end;
$$;

revoke all on function public.register_public_account(text, text, text), public.save_opportunity(uuid, jsonb, boolean), public.archive_opportunity(uuid),
  public.upload_opportunity_file(text, text, bytea), public.apply_opportunity(uuid, text, uuid), public.update_application_status(uuid, text, text),
  public.add_application_message(uuid, text), public.my_opportunity_space(), public.toggle_opportunity_favorite(uuid), public.opportunity_file_download(uuid),
  public.submit_content_report(text, uuid, text, text), public.platform_moderate(text, uuid, text, text), public.platform_resolve_report(uuid, text, text),
  public.platform_save_opportunity_category(text, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.register_public_account(text, text, text), public.save_opportunity(uuid, jsonb, boolean), public.archive_opportunity(uuid),
  public.upload_opportunity_file(text, text, bytea), public.apply_opportunity(uuid, text, uuid), public.update_application_status(uuid, text, text),
  public.add_application_message(uuid, text), public.my_opportunity_space(), public.toggle_opportunity_favorite(uuid), public.opportunity_file_download(uuid),
  public.submit_content_report(text, uuid, text, text), public.platform_moderate(text, uuid, text, text), public.platform_resolve_report(uuid, text, text),
  public.platform_save_opportunity_category(text, text, text, text, text, integer, boolean) to authenticated;
