-- =============================================================================
-- Site web officiel NeoScool : contenus administrables par le Super Admin.
--  - Réglages du site : slogan, référencement, bouton WhatsApp (activation,
--    message par défaut, texte, position), sections de l'accueil.
--  - Réseaux sociaux (ajout, ordre, activation) : aucune adresse dans le code.
--  - Pays affichés : contenu par pays lié aux pays configurés, systèmes
--    institutionnels affichés seulement s'ils sont marqués « vérifiés ».
--  - Vidéos, témoignages (publiés seulement avec accord confirmé).
--  - Demandes reçues (contact, démonstration) : dépôt public limité, lecture
--    et suivi par le Super Admin seulement.
-- Aucune donnée n'est supprimée ; les éléments se désactivent.
-- =============================================================================

alter table public.platform_site_settings
  add column slogan text check (slogan is null or char_length(slogan) <= 120),
  add column slogan_en text check (slogan_en is null or char_length(slogan_en) <= 120),
  add column seo_description text check (seo_description is null or char_length(seo_description) <= 300),
  add column seo_description_en text check (seo_description_en is null or char_length(seo_description_en) <= 300),
  add column whatsapp_enabled boolean not null default true,
  add column whatsapp_message text check (whatsapp_message is null or char_length(whatsapp_message) <= 300),
  add column whatsapp_label text check (whatsapp_label is null or char_length(whatsapp_label) <= 40),
  add column whatsapp_position text not null default 'right' check (whatsapp_position in ('right', 'left')),
  add column home_sections jsonb not null default '{}'::jsonb check (jsonb_typeof(home_sections) = 'object');

create table public.site_social_links (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'whatsapp', 'telegram', 'other')),
  label text not null check (char_length(btrim(label)) between 2 and 40),
  url text not null check (url ~ '^https://[^\s]{4,250}$'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.site_country_profiles (
  country_code text primary key references public.countries (code) on update cascade,
  is_displayed boolean not null default false,
  availability text not null default 'configurable' check (availability in ('configurable', 'preparing', 'available')),
  education_context text check (education_context is null or char_length(education_context) <= 1000),
  education_context_en text check (education_context_en is null or char_length(education_context_en) <= 1000),
  academic_structure text check (academic_structure is null or char_length(academic_structure) <= 300),
  academic_structure_en text check (academic_structure_en is null or char_length(academic_structure_en) <= 300),
  -- [{ "name": "...", "description": "...", "verified": true }] ; seuls les systèmes vérifiés sont publiés.
  institutional_systems jsonb not null default '[]'::jsonb check (jsonb_typeof(institutional_systems) = 'array'),
  marketing_text text check (marketing_text is null or char_length(marketing_text) <= 600),
  marketing_text_en text check (marketing_text_en is null or char_length(marketing_text_en) <= 600),
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);
-- Pays demandés pour le site (configuration seulement : jamais « déployés »).
insert into public.site_country_profiles (country_code, is_displayed, sort_order)
select code, true, s from (values ('BJ', 1), ('CI', 2), ('BF', 3), ('TG', 4), ('NE', 5), ('GA', 6)) v(code, s)
where exists (select 1 from public.countries c where c.code = v.code)
on conflict do nothing;

create table public.site_videos (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('school', 'university', 'training', 'badge', 'ai', 'steering', 'portals', 'other')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  title_en text check (title_en is null or char_length(btrim(title_en)) between 3 and 120),
  description text check (description is null or char_length(description) <= 400),
  video_url text not null check ((video_url ~ '^https://[^\s]{4,}$' and char_length(video_url) <= 400)),
  poster_url text check (poster_url is null or (poster_url ~ '^https://[^\s]{4,}$' and char_length(poster_url) <= 400)),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.site_testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(btrim(author_name)) between 2 and 80),
  author_role text check (author_role is null or char_length(author_role) <= 80),
  organization text check (organization is null or char_length(organization) <= 120),
  quote text not null check (char_length(btrim(quote)) between 10 and 600),
  photo_url text check (photo_url is null or (photo_url ~ '^https://[^\s]{4,}$' and char_length(photo_url) <= 400)),
  consent_confirmed boolean not null default false,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  -- Un témoignage n'est publié qu'avec l'accord confirmé de la personne.
  check (not is_published or consent_confirmed)
);

create table public.site_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contact', 'demo')),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,25}$'),
  organization text check (organization is null or char_length(organization) <= 160),
  organization_type text check (organization_type is null or organization_type in ('school', 'university', 'training', 'group', 'other')),
  country text check (country is null or char_length(country) <= 80),
  message text check (message is null or char_length(message) <= 3000),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'spam')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz
);
create index site_leads_created_idx on public.site_leads (created_at desc);
create index site_leads_email_idx on public.site_leads (lower(email), created_at desc);

do $$
declare t text;
begin
  foreach t in array array['site_social_links', 'site_country_profiles', 'site_videos', 'site_testimonials', 'site_leads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_platform_admin())', t || '_admin_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lecture publique du contenu du site
-- -----------------------------------------------------------------------------
create or replace function public.site_public_content()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object(
        'slogan', slogan, 'slogan_en', slogan_en, 'seo_description', seo_description, 'seo_description_en', seo_description_en,
        'whatsapp', case when whatsapp_enabled then whatsapp end, 'whatsapp_message', whatsapp_message,
        'whatsapp_label', whatsapp_label, 'whatsapp_position', whatsapp_position, 'home_sections', home_sections)
      from public.platform_site_settings where id = 1),
    'social_links', coalesce((select jsonb_agg(jsonb_build_object('network', network, 'label', label, 'url', url) order by sort_order, label)
      from public.site_social_links where is_active), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object(
        'code', c.code, 'name', c.name, 'name_en', c.name_en, 'currency', c.default_currency, 'languages', c.languages,
        'timezone', c.timezone, 'date_format', c.date_format, 'grading_scale', c.settings ->> 'grading_scale',
        'school_periods', c.settings ->> 'school_periods', 'availability', p.availability,
        'education_context', p.education_context, 'education_context_en', p.education_context_en,
        'academic_structure', p.academic_structure, 'academic_structure_en', p.academic_structure_en,
        'marketing_text', p.marketing_text, 'marketing_text_en', p.marketing_text_en,
        'institutional_systems', coalesce((select jsonb_agg(jsonb_build_object('name', s ->> 'name', 'description', s ->> 'description'))
          from jsonb_array_elements(p.institutional_systems) s where (s ->> 'verified')::boolean is true), '[]'::jsonb))
        order by p.sort_order, c.name)
      from public.site_country_profiles p join public.countries c on c.code = p.country_code
      where p.is_displayed and c.is_active), '[]'::jsonb),
    'videos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'topic', topic, 'title', title, 'title_en', title_en,
        'description', description, 'video_url', video_url, 'poster_url', poster_url) order by sort_order, title)
      from public.site_videos where is_published), '[]'::jsonb),
    'testimonials', coalesce((select jsonb_agg(jsonb_build_object('author_name', author_name, 'author_role', author_role,
        'organization', organization, 'quote', quote, 'photo_url', photo_url) order by sort_order)
      from public.site_testimonials where is_published and consent_confirmed), '[]'::jsonb));
$$;
revoke all on function public.site_public_content() from public;
grant execute on function public.site_public_content() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Demandes reçues (formulaire public)
-- -----------------------------------------------------------------------------
create or replace function public.submit_site_lead(
  p_kind text, p_full_name text, p_email text, p_phone text, p_organization text,
  p_organization_type text, p_country text, p_message text, p_locale text default 'fr')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Limites anti-abus : 5 demandes par adresse et par jour, 300 par heure au total.
  if (select count(*) from public.site_leads where lower(email) = lower(btrim(p_email)) and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.site_leads where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Trop de demandes envoyées. Réessayez plus tard ou écrivez-nous directement.' using errcode = 'check_violation';
  end if;
  insert into public.site_leads (kind, full_name, email, phone, organization, organization_type, country, message, locale)
  values (case when p_kind = 'demo' then 'demo' else 'contact' end, btrim(p_full_name), lower(btrim(p_email)),
          nullif(btrim(p_phone), ''), nullif(btrim(p_organization), ''), nullif(p_organization_type, ''),
          nullif(btrim(p_country), ''), nullif(btrim(p_message), ''), case when p_locale = 'en' then 'en' else 'fr' end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_site_lead(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_site_lead(text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.platform_update_lead(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.site_leads
     set status = p_status, admin_note = nullif(btrim(p_note), ''), handled_by = auth.uid(), handled_at = now()
   where id = p_id;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.platform_update_lead(uuid, text, text) from public, anon;
grant execute on function public.platform_update_lead(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Enregistrements du Super Admin (un appel par type de contenu)
-- -----------------------------------------------------------------------------
create or replace function public.platform_save_site_web(
  p_slogan text, p_slogan_en text, p_seo text, p_seo_en text, p_whatsapp_enabled boolean,
  p_whatsapp_message text, p_whatsapp_label text, p_whatsapp_position text, p_home_sections jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_site_settings
     set slogan = nullif(btrim(p_slogan), ''), slogan_en = nullif(btrim(p_slogan_en), ''),
         seo_description = nullif(btrim(p_seo), ''), seo_description_en = nullif(btrim(p_seo_en), ''),
         whatsapp_enabled = coalesce(p_whatsapp_enabled, true), whatsapp_message = nullif(btrim(p_whatsapp_message), ''),
         whatsapp_label = nullif(btrim(p_whatsapp_label), ''), whatsapp_position = coalesce(p_whatsapp_position, 'right'),
         home_sections = coalesce(p_home_sections, '{}'::jsonb), updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.site_settings_audit('site web');
end;
$$;
revoke all on function public.platform_save_site_web(text, text, text, text, boolean, text, text, text, jsonb) from public, anon;
grant execute on function public.platform_save_site_web(text, text, text, text, boolean, text, text, text, jsonb) to authenticated;

create or replace function public.platform_save_social_link(p_id uuid, p_network text, p_label text, p_url text, p_active boolean, p_sort integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_admin();
  if p_id is null then
    insert into public.site_social_links (network, label, url, is_active, sort_order)
    values (p_network, btrim(p_label), btrim(p_url), coalesce(p_active, true), coalesce(p_sort, 0)) returning id into v_id;
  else
    update public.site_social_links set network = p_network, label = btrim(p_label), url = btrim(p_url),
           is_active = coalesce(p_active, true), sort_order = coalesce(p_sort, 0), updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'Réseau introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.site_settings_audit('réseaux sociaux');
  return v_id;
end;
$$;
revoke all on function public.platform_save_social_link(uuid, text, text, text, boolean, integer) from public, anon;
grant execute on function public.platform_save_social_link(uuid, text, text, text, boolean, integer) to authenticated;

create or replace function public.platform_save_country_profile(
  p_code text, p_displayed boolean, p_availability text, p_context text, p_context_en text,
  p_structure text, p_structure_en text, p_systems jsonb, p_marketing text, p_marketing_en text, p_sort integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_system jsonb;
begin
  perform app.require_platform_admin();
  if p_systems is null or jsonb_typeof(p_systems) <> 'array' or jsonb_array_length(p_systems) > 10 then
    raise exception 'Liste de systèmes institutionnels invalide (10 au plus).' using errcode = 'check_violation';
  end if;
  for v_system in select value from jsonb_array_elements(p_systems) loop
    if char_length(btrim(coalesce(v_system ->> 'name', ''))) not between 2 and 80 or char_length(coalesce(v_system ->> 'description', '')) > 300 then
      raise exception 'Chaque système institutionnel doit avoir un nom (2 à 80 caractères).' using errcode = 'check_violation';
    end if;
  end loop;
  insert into public.site_country_profiles (country_code, is_displayed, availability, education_context, education_context_en,
    academic_structure, academic_structure_en, institutional_systems, marketing_text, marketing_text_en, sort_order, updated_at)
  values (p_code, coalesce(p_displayed, false), coalesce(p_availability, 'configurable'), nullif(btrim(p_context), ''), nullif(btrim(p_context_en), ''),
    nullif(btrim(p_structure), ''), nullif(btrim(p_structure_en), ''), p_systems, nullif(btrim(p_marketing), ''), nullif(btrim(p_marketing_en), ''),
    coalesce(p_sort, 100), now())
  on conflict (country_code) do update set is_displayed = excluded.is_displayed, availability = excluded.availability,
    education_context = excluded.education_context, education_context_en = excluded.education_context_en,
    academic_structure = excluded.academic_structure, academic_structure_en = excluded.academic_structure_en,
    institutional_systems = excluded.institutional_systems, marketing_text = excluded.marketing_text,
    marketing_text_en = excluded.marketing_text_en, sort_order = excluded.sort_order, updated_at = now();
  perform app.site_settings_audit('pays ' || p_code);
end;
$$;
revoke all on function public.platform_save_country_profile(text, boolean, text, text, text, text, text, jsonb, text, text, integer) from public, anon;
grant execute on function public.platform_save_country_profile(text, boolean, text, text, text, text, text, jsonb, text, text, integer) to authenticated;

create or replace function public.platform_save_site_video(
  p_id uuid, p_topic text, p_title text, p_title_en text, p_description text, p_video_url text, p_poster_url text, p_published boolean, p_sort integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_admin();
  if p_id is null then
    insert into public.site_videos (topic, title, title_en, description, video_url, poster_url, is_published, sort_order)
    values (p_topic, btrim(p_title), nullif(btrim(p_title_en), ''), nullif(btrim(p_description), ''), btrim(p_video_url),
            nullif(btrim(p_poster_url), ''), coalesce(p_published, false), coalesce(p_sort, 0)) returning id into v_id;
  else
    update public.site_videos set topic = p_topic, title = btrim(p_title), title_en = nullif(btrim(p_title_en), ''),
           description = nullif(btrim(p_description), ''), video_url = btrim(p_video_url), poster_url = nullif(btrim(p_poster_url), ''),
           is_published = coalesce(p_published, false), sort_order = coalesce(p_sort, 0), updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'Vidéo introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.site_settings_audit('vidéos');
  return v_id;
end;
$$;
revoke all on function public.platform_save_site_video(uuid, text, text, text, text, text, text, boolean, integer) from public, anon;
grant execute on function public.platform_save_site_video(uuid, text, text, text, text, text, text, boolean, integer) to authenticated;

create or replace function public.platform_save_testimonial(
  p_id uuid, p_name text, p_role text, p_organization text, p_quote text, p_photo_url text, p_consent boolean, p_published boolean, p_sort integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_admin();
  if coalesce(p_published, false) and not coalesce(p_consent, false) then
    raise exception 'Un témoignage ne peut être publié qu''avec l''accord confirmé de la personne.' using errcode = 'check_violation';
  end if;
  if p_id is null then
    insert into public.site_testimonials (author_name, author_role, organization, quote, photo_url, consent_confirmed, is_published, sort_order)
    values (btrim(p_name), nullif(btrim(p_role), ''), nullif(btrim(p_organization), ''), btrim(p_quote), nullif(btrim(p_photo_url), ''),
            coalesce(p_consent, false), coalesce(p_published, false), coalesce(p_sort, 0)) returning id into v_id;
  else
    update public.site_testimonials set author_name = btrim(p_name), author_role = nullif(btrim(p_role), ''),
           organization = nullif(btrim(p_organization), ''), quote = btrim(p_quote), photo_url = nullif(btrim(p_photo_url), ''),
           consent_confirmed = coalesce(p_consent, false), is_published = coalesce(p_published, false), sort_order = coalesce(p_sort, 0), updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  if v_id is null then
    raise exception 'Témoignage introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.site_settings_audit('témoignages');
  return v_id;
end;
$$;
revoke all on function public.platform_save_testimonial(uuid, text, text, text, text, text, boolean, boolean, integer) from public, anon;
grant execute on function public.platform_save_testimonial(uuid, text, text, text, text, text, boolean, boolean, integer) to authenticated;
