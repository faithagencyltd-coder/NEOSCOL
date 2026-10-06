-- =============================================================================
-- Écosystème public — E1 à E4 : socle, Discover, vérification, Leads, Promotion.
--
--  1. Modules publics (Discover, Promotion, Media Kit, Leads, Opportunities,
--     publicité externe) : DÉSACTIVÉS PAR DÉFAUT. Le Super Admin les ouvre
--     pour toute la plateforme, un pays, un type ou un établissement précis
--     (pilote), éventuellement jusqu'à une date (essai). Mêmes règles que le
--     Contrôle des modules (niveau le plus précis prioritaire), journalisées.
--  2. Fiche publique d'un établissement (Discover) : contenu fourni et validé
--     par l'établissement lui-même ; rien n'est inventé. Publication volontaire.
--  3. Vérification : distincte de toute mise en avant payante ; pièces
--     configurables par pays / type ; décision du Super Admin.
--  4. Leads : demandes reçues par les pages publiques et les campagnes, avec
--     l'origine (Discover, campagne, QR, réseaux…), traitées dans le portail.
--  5. Campagnes de promotion : préparées par l'établissement, aperçu,
--     modération par la plateforme si exigée, statistiques.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Modules publics : désactivés par défaut, ouverture progressive
-- -----------------------------------------------------------------------------
create or replace function app.public_module_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['discover', 'promotion', 'media_kit', 'leads', 'opportunities', 'external_ads'];
$$;

create or replace function app.org_feature_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['parent_portal', 'student_portal', 'messaging', 'assistant', 'voice_checkin', 'medical_records', 'ranking', 'conduct']
         || app.public_module_keys();
$$;

alter table public.platform_feature_rules drop constraint platform_feature_rules_scope_check;
alter table public.platform_feature_rules add constraint platform_feature_rules_scope_check check (scope in ('global', 'country', 'org_type', 'organization'));
alter table public.platform_feature_rules add column until timestamptz;

-- Valeur d'une fonctionnalité pour un établissement selon les règles (null = aucune règle applicable).
create or replace function app.feature_rule_value(p_key text, p_org uuid, p_type text, p_country text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'organization' and r.scope_value = p_org::text and (r.until is null or r.until > now())),
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'org_type' and r.scope_value = p_type and (r.until is null or r.until > now())),
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'country' and r.scope_value = p_country and (r.until is null or r.until > now())),
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'global' and (r.until is null or r.until > now())));
$$;

-- Les modules publics sont fermés tant qu'aucune règle ne les ouvre ; les autres restent ouverts par défaut.
create or replace function public.platform_locked_features(o public.organizations)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.key, false), '{}'::jsonb)
    from unnest(app.org_feature_keys()) as k(key)
   where coalesce(app.feature_rule_value(k.key, o.id, o.type::text, o.country), not (k.key = any (app.public_module_keys()))) = false;
$$;

-- Module public ouvert pour un pays (contenus publiés par des particuliers, hors établissement).
create or replace function app.module_enabled_in_country(p_key text, p_country text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'country' and r.scope_value = p_country and (r.until is null or r.until > now())),
    (select r.enabled from public.platform_feature_rules r where r.feature_key = p_key and r.scope = 'global' and (r.until is null or r.until > now())),
    false);
$$;

-- Module ouvert pour un établissement : règles de la plateforme + arrêt propre + réglage de l'établissement.
create or replace function app.module_enabled(p_key text, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.org_feature_enabled(p_org, p_key), false);
$$;

-- Règle avec portée « établissement » et date de fin facultative (essai / pilote).
create or replace function public.platform_set_feature_rule(p_feature text, p_scope text, p_value text, p_enabled boolean, p_reason text, p_until timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_value text := case when p_scope = 'global' then '' else btrim(coalesce(p_value, '')) end;
  v_label text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if not (p_feature = any (app.org_feature_keys())) then
    raise exception 'Fonctionnalité inconnue.' using errcode = 'check_violation';
  end if;
  if p_scope not in ('global', 'country', 'org_type', 'organization') then
    raise exception 'Niveau inconnu.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'La date de fin doit être dans le futur.' using errcode = 'check_violation';
  end if;
  if p_scope = 'country' and not exists (select 1 from public.countries where code = v_value) then
    raise exception 'Pays inconnu.' using errcode = 'check_violation';
  end if;
  if p_scope = 'org_type' and not (v_value = any (enum_range(null::public.organization_type)::text[])) then
    raise exception 'Type d''établissement inconnu.' using errcode = 'check_violation';
  end if;
  if p_scope = 'organization' and not exists (select 1 from public.organizations where id::text = v_value) then
    raise exception 'Établissement introuvable.' using errcode = 'check_violation';
  end if;
  v_label := case p_scope when 'global' then 'toute la plateforme' when 'country' then 'pays ' || v_value
             when 'org_type' then 'type ' || v_value else 'établissement ' || coalesce((select name from public.organizations where id::text = v_value), v_value) end;
  if p_enabled is null then
    delete from public.platform_feature_rules where feature_key = p_feature and scope = p_scope and scope_value = v_value;
    perform app.audit(null, 'platform.feature_rule_removed', 'platform_feature_rules', null, 'Règle retirée : ' || p_feature || ' — ' || v_label,
      jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'reason', left(btrim(p_reason), 500)));
    return;
  end if;
  insert into public.platform_feature_rules (feature_key, scope, scope_value, enabled, reason, updated_by, until)
  values (p_feature, p_scope, v_value, p_enabled, left(btrim(p_reason), 500), auth.uid(), p_until)
  on conflict (feature_key, scope, scope_value)
  do update set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now(), until = excluded.until;
  perform app.audit(null, 'platform.feature_rule', 'platform_feature_rules', null,
    case when p_enabled then 'Fonctionnalité ouverte : ' else 'Fonctionnalité arrêtée : ' end || p_feature || ' — ' || v_label
      || case when p_until is not null then ' (jusqu''au ' || to_char(p_until, 'DD/MM/YYYY') || ')' else '' end,
    jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'enabled', p_enabled, 'until', p_until, 'reason', left(btrim(p_reason), 500)));
end;
$$;

-- L'ancienne signature reste disponible (sans date de fin).
create or replace function public.platform_set_feature_rule(p_feature text, p_scope text, p_value text, p_enabled boolean, p_reason text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select public.platform_set_feature_rule(p_feature, p_scope, p_value, p_enabled, p_reason, null::timestamptz);
$$;

revoke all on function public.platform_set_feature_rule(text, text, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.platform_set_feature_rule(text, text, text, boolean, text, timestamptz) to authenticated;

-- Réglages de l'écosystème (modération, textes) : un seul enregistrement.
create table public.ecosystem_settings (
  id smallint primary key default 1 check (id = 1),
  campaigns_require_review boolean not null default true,
  opportunities_require_review boolean not null default true,
  profiles_require_review boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.ecosystem_settings (id) values (1) on conflict do nothing;
alter table public.ecosystem_settings enable row level security;
create policy ecosystem_settings_select on public.ecosystem_settings for select to authenticated using (true);
revoke insert, update, delete on public.ecosystem_settings from authenticated, anon;

create or replace function public.platform_save_ecosystem_settings(p_campaigns boolean, p_opportunities boolean, p_profiles boolean)
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
  update public.ecosystem_settings
     set campaigns_require_review = p_campaigns, opportunities_require_review = p_opportunities, profiles_require_review = p_profiles,
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.audit(null, 'platform.ecosystem_settings', 'ecosystem_settings', null, 'Règles de publication de l''écosystème modifiées',
    jsonb_build_object('campaigns', p_campaigns, 'opportunities', p_opportunities, 'profiles', p_profiles));
end;
$$;
revoke all on function public.platform_save_ecosystem_settings(boolean, boolean, boolean) from public, anon;
grant execute on function public.platform_save_ecosystem_settings(boolean, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Campagnes de promotion (créées avant les Leads, qui y font référence)
-- -----------------------------------------------------------------------------
create table public.promo_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 4 and 140),
  description text check (description is null or char_length(description) <= 3000),
  objective text not null check (objective in ('information', 'candidates', 'program', 'enrollments', 'awareness', 'event')),
  target text check (target is null or char_length(target) <= 200),
  media uuid[] not null default '{}' check (cardinality(media) <= 6),
  countries text[] not null default '{}',
  cities text[] not null default '{}',
  audience text check (audience is null or char_length(audience) <= 300),
  starts_on date,
  ends_on date,
  budget_amount integer check (budget_amount is null or budget_amount >= 0),
  budget_currency text check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  destination_url text check (destination_url is null or destination_url ~* '^https?://'),
  contact text check (contact is null or char_length(contact) <= 300),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'suspended', 'ended', 'rejected')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  featured_until timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index promo_campaigns_org_idx on public.promo_campaigns (organization_id, created_at desc);
alter table public.promo_campaigns enable row level security;
create policy promo_campaigns_select on public.promo_campaigns for select to authenticated
  using (app.has_permission(organization_id, 'communication.send') or (select app.is_platform_admin()));
revoke insert, update, delete on public.promo_campaigns from authenticated, anon;

create or replace function public.save_promo_campaign(p_org uuid, p_id uuid, p_data jsonb, p_submit boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_review boolean := (select campaigns_require_review from public.ecosystem_settings where id = 1);
  v_status text;
begin
  if not app.has_permission(p_org, 'communication.send') then
    raise exception 'Droit « Communication » requis.' using errcode = 'insufficient_privilege';
  end if;
  if not app.module_enabled('promotion', p_org) then
    raise exception 'NeoScool Promotion n''est pas encore ouvert pour votre établissement.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from unnest(coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_data -> 'media', '[]'::jsonb)) x), '{}')) m(f)
              where not exists (select 1 from public.file_objects fo where fo.id = m.f and fo.organization_id = p_org and fo.mime_type like 'image/%')) then
    raise exception 'Image invalide.' using errcode = 'check_violation';
  end if;
  v_status := case when p_submit then case when v_review then 'pending_review' else 'published' end else 'draft' end;
  if v_id is null then
    insert into public.promo_campaigns (organization_id, title, description, objective, target, media, countries, cities, audience, starts_on, ends_on,
        budget_amount, budget_currency, destination_url, contact, status, created_by)
    values (p_org, btrim(p_data ->> 'title'), nullif(btrim(p_data ->> 'description'), ''), p_data ->> 'objective', nullif(btrim(p_data ->> 'target'), ''),
        coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_data -> 'media', '[]'::jsonb)) x), '{}'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'countries', '[]'::jsonb)) x), '{}'),
        coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(p_data -> 'cities', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
        nullif(btrim(p_data ->> 'audience'), ''), nullif(p_data ->> 'starts_on', '')::date, nullif(p_data ->> 'ends_on', '')::date,
        nullif(p_data ->> 'budget_amount', '')::integer, nullif(p_data ->> 'budget_currency', ''), nullif(btrim(p_data ->> 'destination_url'), ''),
        nullif(btrim(p_data ->> 'contact'), ''), v_status, auth.uid())
    returning id into v_id;
  else
    update public.promo_campaigns set
        title = btrim(p_data ->> 'title'), description = nullif(btrim(p_data ->> 'description'), ''), objective = p_data ->> 'objective',
        target = nullif(btrim(p_data ->> 'target'), ''),
        media = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_data -> 'media', '[]'::jsonb)) x), '{}'),
        countries = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'countries', '[]'::jsonb)) x), '{}'),
        cities = coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(p_data -> 'cities', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
        audience = nullif(btrim(p_data ->> 'audience'), ''), starts_on = nullif(p_data ->> 'starts_on', '')::date, ends_on = nullif(p_data ->> 'ends_on', '')::date,
        budget_amount = nullif(p_data ->> 'budget_amount', '')::integer, budget_currency = nullif(p_data ->> 'budget_currency', ''),
        destination_url = nullif(btrim(p_data ->> 'destination_url'), ''), contact = nullif(btrim(p_data ->> 'contact'), ''),
        status = case when status in ('suspended') then status else v_status end, moderation_note = null, updated_at = now()
     where id = v_id and organization_id = p_org;
    if not found then
      raise exception 'Campagne introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  perform app.audit(p_org, 'communication.campaign_saved', 'promo_campaigns', v_id, 'Campagne de promotion : ' || btrim(p_data ->> 'title') || ' (' || v_status || ')', '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.end_promo_campaign(p_org uuid, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'communication.send') then
    raise exception 'Droit « Communication » requis.' using errcode = 'insufficient_privilege';
  end if;
  update public.promo_campaigns set status = 'ended', updated_at = now() where id = p_id and organization_id = p_org and status in ('published', 'pending_review', 'draft');
  if not found then
    raise exception 'Campagne introuvable.' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.save_promo_campaign(uuid, uuid, jsonb, boolean), public.end_promo_campaign(uuid, uuid) from public, anon;
grant execute on function public.save_promo_campaign(uuid, uuid, jsonb, boolean), public.end_promo_campaign(uuid, uuid) to authenticated;



-- -----------------------------------------------------------------------------
-- 2. Fiche publique (Discover)
-- -----------------------------------------------------------------------------
create table public.org_public_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  published boolean not null default false,
  review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  moderation text not null default 'ok' check (moderation in ('ok', 'suspended')),
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'suspended', 'rejected')),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  description text check (description is null or char_length(description) <= 5000),
  address text check (address is null or char_length(address) <= 300),
  city text check (city is null or char_length(city) <= 80),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,25}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  website text check (website is null or website ~* '^https?://'),
  socials jsonb not null default '{}'::jsonb check (jsonb_typeof(socials) = 'object'),
  admission text check (admission is null or char_length(admission) <= 3000),
  enrollment_period text check (enrollment_period is null or char_length(enrollment_period) <= 200),
  start_date text check (start_date is null or char_length(start_date) <= 200),
  extra text check (extra is null or char_length(extra) <= 3000),
  programs jsonb not null default '[]'::jsonb check (jsonb_typeof(programs) = 'array' and jsonb_array_length(programs) <= 100),
  cover_file_id uuid references public.file_objects (id) on delete set null,
  gallery uuid[] not null default '{}' check (cardinality(gallery) <= 12),
  translations jsonb not null default '{}'::jsonb check (jsonb_typeof(translations) = 'object'),
  enrollment_url text check (enrollment_url is null or enrollment_url ~* '^https?://'),
  featured_until timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index org_public_profiles_city_idx on public.org_public_profiles (lower(city));
alter table public.org_public_profiles enable row level security;
create policy org_public_profiles_select on public.org_public_profiles for select to authenticated
  using (app.has_permission(organization_id, 'settings.manage') or (select app.is_platform_admin()));
revoke insert, update, delete on public.org_public_profiles from authenticated, anon;

create or replace function app.slugify(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Enregistrement par l'établissement (droit « Paramètres ») ; module Discover ouvert requis.
create or replace function public.save_public_profile(p_org uuid, p_data jsonb, p_publish boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_review boolean := (select profiles_require_review from public.ecosystem_settings where id = 1);
  v_existing public.org_public_profiles;
  v_name text;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Droit « Paramètres » requis.' using errcode = 'insufficient_privilege';
  end if;
  if not app.module_enabled('discover', p_org) then
    raise exception 'NeoScool Discover n''est pas encore ouvert pour votre établissement.' using errcode = 'insufficient_privilege';
  end if;
  select name into v_name from public.organizations where id = p_org;
  select * into v_existing from public.org_public_profiles where organization_id = p_org;
  v_slug := app.slugify(coalesce(nullif(p_data ->> 'slug', ''), v_existing.slug, v_name));
  if char_length(v_slug) < 3 then
    raise exception 'Adresse de la fiche trop courte.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.org_public_profiles where slug = v_slug and organization_id <> p_org) then
    raise exception 'Cette adresse de fiche est déjà utilisée.' using errcode = 'unique_violation';
  end if;
  if p_publish and length(btrim(coalesce(p_data ->> 'description', ''))) < 30 then
    raise exception 'Pour publier, rédigez une présentation d''au moins 30 caractères.' using errcode = 'check_violation';
  end if;
  -- Les images doivent appartenir à l'établissement.
  if exists (
    select 1 from (select nullif(p_data ->> 'cover_file_id', '')::uuid as f
                   union all select (jsonb_array_elements_text(coalesce(p_data -> 'gallery', '[]'::jsonb)))::uuid) x
     where x.f is not null and not exists (select 1 from public.file_objects fo where fo.id = x.f and fo.organization_id = p_org and fo.mime_type like 'image/%')
  ) then
    raise exception 'Image invalide.' using errcode = 'check_violation';
  end if;
  insert into public.org_public_profiles as p (organization_id, slug, published, review_status, tagline, description, address, city, phone, email, website,
      socials, admission, enrollment_period, start_date, extra, programs, cover_file_id, gallery, translations, enrollment_url, published_at, updated_at)
  values (p_org, v_slug, p_publish,
      case when p_publish and v_review then 'pending' else 'approved' end,
      nullif(btrim(p_data ->> 'tagline'), ''), nullif(btrim(p_data ->> 'description'), ''), nullif(btrim(p_data ->> 'address'), ''),
      nullif(btrim(p_data ->> 'city'), ''), nullif(btrim(p_data ->> 'phone'), ''), nullif(lower(btrim(p_data ->> 'email')), ''),
      nullif(btrim(p_data ->> 'website'), ''), coalesce(p_data -> 'socials', '{}'::jsonb), nullif(btrim(p_data ->> 'admission'), ''),
      nullif(btrim(p_data ->> 'enrollment_period'), ''), nullif(btrim(p_data ->> 'start_date'), ''), nullif(btrim(p_data ->> 'extra'), ''),
      coalesce(p_data -> 'programs', '[]'::jsonb), nullif(p_data ->> 'cover_file_id', '')::uuid,
      coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_data -> 'gallery', '[]'::jsonb)) x), '{}'),
      coalesce(p_data -> 'translations', '{}'::jsonb), nullif(btrim(p_data ->> 'enrollment_url'), ''),
      case when p_publish then now() end, now())
  on conflict (organization_id) do update set
      slug = excluded.slug, published = excluded.published,
      review_status = case when excluded.published and v_review and (not p.published or p.review_status <> 'approved') then 'pending'
                           when excluded.published and v_review then p.review_status else 'approved' end,
      tagline = excluded.tagline, description = excluded.description, address = excluded.address, city = excluded.city,
      phone = excluded.phone, email = excluded.email, website = excluded.website, socials = excluded.socials,
      admission = excluded.admission, enrollment_period = excluded.enrollment_period, start_date = excluded.start_date,
      extra = excluded.extra, programs = excluded.programs, cover_file_id = excluded.cover_file_id, gallery = excluded.gallery,
      translations = excluded.translations, enrollment_url = excluded.enrollment_url,
      published_at = case when excluded.published then coalesce(p.published_at, now()) else null end, updated_at = now();
  perform app.audit(p_org, 'settings.public_profile', 'org_public_profiles', p_org,
    case when p_publish then 'Fiche publique enregistrée et publiée' else 'Fiche publique enregistrée (non publiée)' end, jsonb_build_object('slug', v_slug));
  return v_slug;
end;
$$;

-- Fiche visible publiquement : publiée, approuvée, non suspendue, établissement actif, module ouvert.
create or replace function app.profile_public(p public.org_public_profiles)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.published and p.moderation = 'ok' and p.review_status = 'approved'
     and exists (select 1 from public.organizations o where o.id = p.organization_id and o.status = 'active' and not o.is_demo)
     and app.module_enabled('discover', p.organization_id);
$$;

-- Recherche publique (aucune donnée interne : seulement ce que l'établissement a publié).
create or replace function public.discover_search(p_query text, p_country text, p_city text, p_type text, p_program text, p_sort text, p_limit integer, p_offset integer)
returns table (slug text, name text, type text, country text, city text, tagline text, verified boolean, featured boolean,
               has_logo boolean, cover_file_id uuid, programs jsonb, code text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select p.*, o.name, o.type::text as otype, o.country as ocountry, o.code,
           exists (select 1 from public.organization_branding b where b.organization_id = o.id and b.logo_path is not null) as has_logo
      from public.org_public_profiles p join public.organizations o on o.id = p.organization_id
     where app.profile_public(p)
       and (nullif(btrim(p_query), '') is null or o.name ilike '%' || btrim(p_query) || '%' or p.tagline ilike '%' || btrim(p_query) || '%' or p.programs::text ilike '%' || btrim(p_query) || '%')
       and (nullif(p_country, '') is null or o.country = p_country)
       and (nullif(p_city, '') is null or lower(p.city) = lower(btrim(p_city)))
       and (nullif(p_type, '') is null or o.type::text = p_type)
       and (nullif(btrim(p_program), '') is null or p.programs::text ilike '%' || btrim(p_program) || '%')
  )
  select v.slug, v.name, v.otype, v.ocountry, v.city, v.tagline, v.verification_status = 'verified', coalesce(v.featured_until > now(), false),
         v.has_logo, v.cover_file_id, v.programs, v.code, count(*) over ()
    from v
   order by case when coalesce(v.featured_until > now(), false) then 0 else 1 end,
            case when p_sort = 'recent' then extract(epoch from v.published_at) end desc nulls last,
            v.name
   limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.discover_search(text, text, text, text, text, text, integer, integer) to anon, authenticated;

create or replace function public.discover_filters()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'countries', coalesce((select jsonb_agg(distinct o.country) from public.org_public_profiles p join public.organizations o on o.id = p.organization_id where app.profile_public(p)), '[]'::jsonb),
    'cities', coalesce((select jsonb_agg(distinct p.city) from public.org_public_profiles p where app.profile_public(p) and p.city is not null), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(distinct o.type::text) from public.org_public_profiles p join public.organizations o on o.id = p.organization_id where app.profile_public(p)), '[]'::jsonb));
$$;
grant execute on function public.discover_filters() to anon, authenticated;

create or replace function public.discover_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', p.slug, 'name', o.name, 'code', o.code, 'type', o.type, 'country', o.country, 'city', p.city,
    'tagline', p.tagline, 'description', p.description, 'address', p.address, 'phone', p.phone, 'email', p.email, 'website', p.website,
    'socials', p.socials, 'admission', p.admission, 'enrollment_period', p.enrollment_period, 'start_date', p.start_date, 'extra', p.extra,
    'programs', p.programs, 'cover_file_id', p.cover_file_id, 'gallery', to_jsonb(p.gallery), 'translations', p.translations,
    'enrollment_url', p.enrollment_url, 'verified', p.verification_status = 'verified', 'updated_at', p.updated_at,
    'has_logo', exists (select 1 from public.organization_branding b where b.organization_id = o.id and b.logo_path is not null),
    'leads_open', app.module_enabled('leads', o.id),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'objective', c.objective,
          'target', c.target, 'starts_on', c.starts_on, 'ends_on', c.ends_on, 'media', to_jsonb(c.media), 'destination_url', c.destination_url) order by c.starts_on desc nulls last)
        from public.promo_campaigns c where c.organization_id = o.id and c.status = 'published' and (c.ends_on is null or c.ends_on >= current_date)
          and (c.starts_on is null or c.starts_on <= current_date) and app.module_enabled('promotion', o.id)), '[]'::jsonb))
    from public.org_public_profiles p join public.organizations o on o.id = p.organization_id
   where p.slug = p_slug and app.profile_public(p);
$$;
grant execute on function public.discover_profile(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Vérification (indépendante de toute mise en avant payante)
-- -----------------------------------------------------------------------------
create table public.verification_requirements (
  id uuid primary key default gen_random_uuid(),
  country text references public.countries (code),
  org_type text,
  label text not null check (char_length(btrim(label)) between 3 and 160),
  description text check (description is null or char_length(description) <= 500),
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.verification_requirements enable row level security;
create policy verification_requirements_select on public.verification_requirements for select to authenticated using (true);
revoke insert, update, delete on public.verification_requirements from authenticated, anon;

create table public.org_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.org_verification_requests enable row level security;
create policy org_verification_requests_select on public.org_verification_requests for select to authenticated
  using (app.has_permission(organization_id, 'settings.manage') or (select app.is_platform_admin()));
revoke insert, update, delete on public.org_verification_requests from authenticated, anon;

create or replace function public.platform_save_verification_requirement(p_id uuid, p_country text, p_type text, p_label text, p_description text, p_required boolean, p_active boolean)
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
  if p_id is null then
    insert into public.verification_requirements (country, org_type, label, description, required, active)
    values (nullif(p_country, ''), nullif(p_type, ''), btrim(p_label), nullif(btrim(coalesce(p_description, '')), ''), p_required, p_active);
  else
    update public.verification_requirements set country = nullif(p_country, ''), org_type = nullif(p_type, ''), label = btrim(p_label),
           description = nullif(btrim(coalesce(p_description, '')), ''), required = p_required, active = p_active where id = p_id;
  end if;
  perform app.audit(null, 'platform.verification_requirement', 'verification_requirements', p_id, 'Pièce de vérification : ' || btrim(p_label), '{}'::jsonb);
end;
$$;

-- Demande de vérification : chaque pièce exigée doit être fournie (fichier de l'établissement).
create or replace function public.submit_verification_request(p_org uuid, p_documents jsonb, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  o public.organizations;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Droit « Paramètres » requis.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.organizations where id = p_org;
  if not exists (select 1 from public.org_public_profiles where organization_id = p_org) then
    raise exception 'Créez d''abord la fiche publique.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.org_verification_requests where organization_id = p_org and status = 'pending') then
    raise exception 'Une demande est déjà en cours d''examen.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.verification_requirements r
     where r.active and r.required and (r.country is null or r.country = o.country) and (r.org_type is null or r.org_type = o.type::text)
       and not exists (select 1 from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb)) d
                        where (d ->> 'requirement_id')::uuid = r.id
                          and exists (select 1 from public.file_objects f where f.id = (d ->> 'file_id')::uuid and f.organization_id = p_org))
  ) then
    raise exception 'Toutes les pièces obligatoires doivent être jointes.' using errcode = 'check_violation';
  end if;
  insert into public.org_verification_requests (organization_id, documents, message, submitted_by)
  values (p_org, coalesce(p_documents, '[]'::jsonb), nullif(btrim(coalesce(p_message, '')), ''), auth.uid()) returning id into v_id;
  update public.org_public_profiles set verification_status = 'pending' where organization_id = p_org and verification_status <> 'verified';
  perform app.audit(p_org, 'settings.verification_requested', 'org_verification_requests', v_id, 'Demande de vérification envoyée', '{}'::jsonb);
  return v_id;
end;
$$;

-- Décision du Super Admin (motif obligatoire en cas de refus ou de suspension).
create or replace function public.platform_decide_verification(p_org uuid, p_decision text, p_note text)
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
  if p_decision not in ('verified', 'rejected', 'suspended', 'unverified') then
    raise exception 'Décision inconnue.' using errcode = 'check_violation';
  end if;
  if p_decision <> 'verified' and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  update public.org_public_profiles set verification_status = p_decision where organization_id = p_org;
  if not found then
    raise exception 'Fiche introuvable.' using errcode = 'no_data_found';
  end if;
  update public.org_verification_requests
     set status = case when p_decision = 'verified' then 'approved' else 'rejected' end, review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = auth.uid(), reviewed_at = now()
   where organization_id = p_org and status = 'pending';
  perform app.audit(p_org, 'platform.verification_decision', 'org_public_profiles', p_org, 'Vérification : ' || p_decision, jsonb_build_object('note', p_note));
end;
$$;

revoke all on function public.platform_save_verification_requirement(uuid, text, text, text, text, boolean, boolean), public.submit_verification_request(uuid, jsonb, text),
  public.platform_decide_verification(uuid, text, text), public.save_public_profile(uuid, jsonb, boolean) from public, anon;
grant execute on function public.platform_save_verification_requirement(uuid, text, text, text, text, boolean, boolean), public.submit_verification_request(uuid, jsonb, text),
  public.platform_decide_verification(uuid, text, text), public.save_public_profile(uuid, jsonb, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Leads (demandes d'information reçues)
-- -----------------------------------------------------------------------------
create table public.org_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,25}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  program text check (program is null or char_length(program) <= 200),
  subject text not null default 'information' check (subject in ('information', 'enrollment', 'visit', 'fees', 'other')),
  message text check (message is null or char_length(message) <= 3000),
  source text not null default 'profile' check (source in ('discover', 'profile', 'campaign', 'qr', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'link', 'other')),
  campaign_id uuid references public.promo_campaigns (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'contacted', 'interested', 'enrolling', 'converted', 'dropped')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index org_leads_org_idx on public.org_leads (organization_id, created_at desc);
create table public.org_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.org_leads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('note', 'status', 'call', 'email', 'meeting', 'whatsapp')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.org_leads enable row level security;
alter table public.org_lead_events enable row level security;
create policy org_leads_select on public.org_leads for select to authenticated using (app.has_permission(organization_id, 'enrollments.manage'));
create policy org_lead_events_select on public.org_lead_events for select to authenticated
  using (exists (select 1 from public.org_leads l where l.id = lead_id and app.has_permission(l.organization_id, 'enrollments.manage')));
revoke insert, update, delete on public.org_leads, public.org_lead_events from authenticated, anon;

-- Demande publique (sans compte) : fiche publiée + module Leads ouvert ; limites anti-abus.
create or replace function public.submit_org_lead(p_slug text, p_name text, p_phone text, p_email text, p_program text, p_subject text, p_message text, p_source text, p_campaign uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.org_public_profiles;
  v_id uuid;
  v_contact text := lower(coalesce(nullif(btrim(p_email), ''), regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')));
  r record;
begin
  select * into p from public.org_public_profiles where slug = p_slug;
  if p.organization_id is null or not app.profile_public(p) or not app.module_enabled('leads', p.organization_id) then
    raise exception 'Les demandes ne sont pas ouvertes pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_email), '') is null and nullif(btrim(p_phone), '') is null then
    raise exception 'Indiquez un téléphone ou un e-mail.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.org_leads l where l.organization_id = p.organization_id
        and lower(coalesce(l.email, regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'))) = v_contact and l.created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.org_leads l where l.organization_id = p.organization_id and l.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Trop de demandes en peu de temps : réessayez plus tard.' using errcode = 'check_violation';
  end if;
  insert into public.org_leads (organization_id, full_name, phone, email, program, subject, message, source, campaign_id)
  values (p.organization_id, btrim(p_name), nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''), nullif(btrim(p_program), ''),
          coalesce(nullif(p_subject, ''), 'information'), nullif(btrim(p_message), ''),
          case when p_source in ('discover', 'profile', 'campaign', 'qr', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'link', 'other') then p_source else 'profile' end,
          (select c.id from public.promo_campaigns c where c.id = p_campaign and c.organization_id = p.organization_id))
  returning id into v_id;
  -- Notification des personnes chargées des inscriptions (système de notifications existant).
  for r in select distinct m.user_id from public.memberships m
             join public.membership_roles mr on mr.membership_id = m.id
             join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = 'enrollments.manage'
            where m.organization_id = p.organization_id and m.status = 'active' loop
    perform app.notify(p.organization_id, r.user_id, 'lead', 'Nouvelle demande : ' || left(btrim(p_name), 80),
      coalesce(nullif(btrim(p_program), ''), 'Demande d''information'), '/visibilite/demandes', '{}'::jsonb);
  end loop;
end;
$$;
grant execute on function public.submit_org_lead(text, text, text, text, text, text, text, text, uuid) to anon, authenticated;

create or replace function public.update_org_lead(p_id uuid, p_status text, p_assign_me boolean, p_event_kind text, p_event_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.org_leads;
begin
  select * into l from public.org_leads where id = p_id for update;
  if l.id is null or not app.has_permission(l.organization_id, 'enrollments.manage') then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  update public.org_leads set status = p_status, assigned_to = case when p_assign_me then auth.uid() else assigned_to end, updated_at = now() where id = p_id;
  if l.status <> p_status then
    insert into public.org_lead_events (lead_id, author_id, kind, body) values (p_id, auth.uid(), 'status', l.status || ' → ' || p_status);
  end if;
  if length(btrim(coalesce(p_event_body, ''))) > 0 then
    insert into public.org_lead_events (lead_id, author_id, kind, body)
    values (p_id, auth.uid(), case when p_event_kind in ('note', 'call', 'email', 'meeting', 'whatsapp') then p_event_kind else 'note' end, btrim(p_event_body));
  end if;
end;
$$;
revoke all on function public.update_org_lead(uuid, text, boolean, text, text) from public, anon;
grant execute on function public.update_org_lead(uuid, text, boolean, text, text) to authenticated;

-- Image publique de l'établissement (couverture, galerie, campagne) : seulement si référencée par un contenu publié.
create or replace function app.public_media_allowed(p_file uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_public_profiles p
     where p.published and p.moderation = 'ok' and p.review_status = 'approved' and app.module_enabled('discover', p.organization_id)
       and (p.cover_file_id = p_file or p_file = any (p.gallery)))
  or exists (
    select 1 from public.promo_campaigns c
     where c.status = 'published' and p_file = any (c.media) and app.module_enabled('promotion', c.organization_id));
$$;
