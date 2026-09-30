-- =============================================================================
-- Super Admin : textes du site, coordonnées et image de marque.
-- Coordonnées (e-mail, téléphone, WhatsApp, adresse, horaires), questions
-- fréquentes, conditions générales et politique de confidentialité, couleur
-- principale et logo. Tout est public en lecture (pages publiques), modifiable
-- uniquement par le Super Admin, et journalisé. Aucun texte juridique n'est
-- inventé : tant que le Super Admin ne l'a pas saisi, la page l'indique.
-- =============================================================================

create table public.platform_site_settings (
  id smallint primary key default 1 check (id = 1),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ().-]{6,25}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),
  address text check (address is null or char_length(address) <= 300),
  support_hours text check (support_hours is null or char_length(support_hours) <= 150),
  faq jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 30),
  terms text check (terms is null or char_length(terms) <= 60000),
  privacy text check (privacy is null or char_length(privacy) <= 60000),
  terms_updated_at timestamptz,
  privacy_updated_at timestamptz,
  primary_color text check (primary_color is null or primary_color ~ '^#[0-9a-f]{6}$'),
  logo_path text check (logo_path is null or logo_path ~ '^logo/[A-Za-z0-9._-]{1,80}$'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_site_settings (id) values (1);
alter table public.platform_site_settings enable row level security;
create policy platform_site_settings_admin_read on public.platform_site_settings for select to authenticated using (app.is_platform_admin());
revoke all on public.platform_site_settings from anon, authenticated;
grant select on public.platform_site_settings to authenticated;

-- Lecture publique (pages publiques, connexion, application).
create or replace function public.site_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contact_email', contact_email, 'contact_phone', contact_phone, 'whatsapp', whatsapp, 'address', address,
    'support_hours', support_hours, 'faq', faq, 'terms', terms, 'privacy', privacy,
    'terms_updated_at', terms_updated_at, 'privacy_updated_at', privacy_updated_at,
    'primary_color', primary_color, 'logo_path', logo_path, 'updated_at', updated_at)
  from public.platform_site_settings where id = 1;
$$;
revoke all on function public.site_settings() from public;
grant execute on function public.site_settings() to anon, authenticated;

create or replace function app.site_settings_audit(p_section text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select app.audit(null, 'platform.site_settings_saved', 'platform_site_settings', null,
    'Site et marque : ' || p_section || ' modifié(es)', jsonb_build_object('section', p_section));
$$;
revoke all on function app.site_settings_audit(text) from public, anon, authenticated;

create or replace function public.platform_save_site_contacts(
  p_email text, p_phone text, p_whatsapp text, p_address text, p_hours text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_site_settings
     set contact_email = nullif(lower(btrim(p_email)), ''),
         contact_phone = nullif(btrim(p_phone), ''),
         whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), ''),
         address = nullif(btrim(p_address), ''),
         support_hours = nullif(btrim(p_hours), ''),
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.site_settings_audit('coordonnées');
end;
$$;
revoke all on function public.platform_save_site_contacts(text, text, text, text, text) from public, anon;
grant execute on function public.platform_save_site_contacts(text, text, text, text, text) to authenticated;

-- Questions fréquentes : [{ "q": "...", "a": "..." }, …] (30 au plus).
create or replace function public.platform_save_site_faq(p_faq jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
begin
  perform app.require_platform_admin();
  if p_faq is null or jsonb_typeof(p_faq) <> 'array' then
    raise exception 'Liste de questions invalide.' using errcode = 'check_violation';
  end if;
  for v_item in select value from jsonb_array_elements(p_faq) loop
    if jsonb_typeof(v_item) <> 'object'
       or char_length(btrim(coalesce(v_item ->> 'q', ''))) not between 3 and 200
       or char_length(btrim(coalesce(v_item ->> 'a', ''))) not between 3 and 2000 then
      raise exception 'Chaque question (3 à 200 caractères) doit avoir une réponse (3 à 2 000 caractères).' using errcode = 'check_violation';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('q', btrim(v_item ->> 'q'), 'a', btrim(v_item ->> 'a')));
  end loop;
  update public.platform_site_settings set faq = v_clean, updated_by = auth.uid(), updated_at = now() where id = 1;
  perform app.site_settings_audit('questions fréquentes');
end;
$$;
revoke all on function public.platform_save_site_faq(jsonb) from public, anon;
grant execute on function public.platform_save_site_faq(jsonb) to authenticated;

create or replace function public.platform_save_site_legal(p_terms text, p_privacy text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_site_settings
     set terms_updated_at = case when nullif(btrim(p_terms), '') is distinct from terms then now() else terms_updated_at end,
         privacy_updated_at = case when nullif(btrim(p_privacy), '') is distinct from privacy then now() else privacy_updated_at end,
         terms = nullif(btrim(p_terms), ''), privacy = nullif(btrim(p_privacy), ''),
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.site_settings_audit('conditions et confidentialité');
end;
$$;
revoke all on function public.platform_save_site_legal(text, text) from public, anon;
grant execute on function public.platform_save_site_legal(text, text) to authenticated;

-- Couleur principale (null = couleur d'origine) et logo (null = logo d'origine).
create or replace function public.platform_save_site_brand(p_primary_color text, p_logo_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_site_settings
     set primary_color = nullif(lower(btrim(p_primary_color)), ''), logo_path = nullif(btrim(p_logo_path), ''),
         updated_by = auth.uid(), updated_at = now()
   where id = 1;
  perform app.site_settings_audit('image de marque');
end;
$$;
revoke all on function public.platform_save_site_brand(text, text) from public, anon;
grant execute on function public.platform_save_site_brand(text, text) to authenticated;

-- Logos de la plateforme : lecture publique, écriture Super Admin seulement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('platform-assets', 'platform-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy "neoscool platform-assets write" on storage.objects for insert to authenticated
  with check (bucket_id = 'platform-assets' and app.is_platform_admin());
create policy "neoscool platform-assets update" on storage.objects for update to authenticated
  using (bucket_id = 'platform-assets' and app.is_platform_admin());
