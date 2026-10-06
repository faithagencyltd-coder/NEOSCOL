-- =============================================================================
-- Écosystème public : lecture contrôlée des images et des pièces.
--  • public_media : une image d'établissement n'est servie publiquement que si
--    elle est utilisée par une fiche ou une campagne publiée (rien d'autre).
--  • platform_verification_document : la plateforme lit une pièce seulement
--    si elle est jointe à une demande de vérification.
--  • discover_profile renvoie aussi l'identifiant (cible d'un signalement).
-- =============================================================================

create or replace function public.public_media(p_id uuid)
returns table (mime_type text, content bytea)
language sql
stable
security definer
set search_path = ''
as $$
  select f.mime_type, f.content from public.file_objects f
   where f.id = p_id and f.mime_type like 'image/%' and f.content is not null and app.public_media_allowed(p_id);
$$;
grant execute on function public.public_media(uuid) to anon, authenticated;

create or replace function public.platform_verification_document(p_id uuid)
returns table (file_name text, mime_type text, content bytea)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.org_verification_requests r, jsonb_array_elements(r.documents) d where (d ->> 'file_id')::uuid = p_id) then
    raise exception 'Pièce introuvable.' using errcode = 'no_data_found';
  end if;
  return query select f.file_name, f.mime_type, f.content from public.file_objects f where f.id = p_id;
end;
$$;
revoke all on function public.platform_verification_document(uuid) from public, anon;
grant execute on function public.platform_verification_document(uuid) to authenticated;

create or replace function public.discover_profile(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'slug', p.slug, 'name', o.name, 'code', o.code, 'type', o.type, 'country', o.country, 'city', p.city,
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
-- Opportunities : gestion d'une annonce et fil d'une candidature.
--  • opportunity_manage : l'auteur (ou le responsable du personnel de
--    l'établissement) voit les réponses reçues, avec le nom et l'e-mail que le
--    candidat a transmis en répondant ; personne d'autre.
--  • application_thread : le candidat ou le gestionnaire lit le fil ; la
--    lecture marque le fil comme lu pour son côté.
-- -----------------------------------------------------------------------------
create or replace function public.opportunity_manage(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_manage_opportunity(p_id) then
    raise exception 'Annonce introuvable.' using errcode = 'no_data_found';
  end if;
  return (
    select jsonb_build_object(
      'opportunity', to_jsonb(o) - 'author_id',
      'category_label', c.label,
      'applications', coalesce((select jsonb_agg(jsonb_build_object(
          'id', a.id, 'status', a.status, 'message', a.message, 'created_at', a.created_at, 'unread', a.author_unread,
          'applicant_name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), 'applicant_email', p.email,
          'cv_file_id', a.cv_file_id, 'cv_name', f.file_name) order by a.created_at desc)
        from public.opportunity_applications a join public.profiles p on p.id = a.applicant_id
        left join public.opportunity_files f on f.id = a.cv_file_id
       where a.opportunity_id = o.id and a.status <> 'withdrawn'), '[]'::jsonb))
      from public.opportunities o join public.opportunity_categories c on c.key = o.category
     where o.id = p_id);
end;
$$;
revoke all on function public.opportunity_manage(uuid) from public, anon;
grant execute on function public.opportunity_manage(uuid) to authenticated;

create or replace function public.application_thread(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.opportunity_applications;
  v_manager boolean;
begin
  select * into a from public.opportunity_applications where id = p_id;
  v_manager := a.id is not null and app.can_manage_opportunity(a.opportunity_id);
  if a.id is null or (a.applicant_id <> auth.uid() and not v_manager) then
    raise exception 'Candidature introuvable.' using errcode = 'no_data_found';
  end if;
  if v_manager then
    update public.opportunity_applications set author_unread = false where id = p_id and author_unread;
  else
    update public.opportunity_applications set applicant_unread = false where id = p_id and applicant_unread;
  end if;
  return (
    select jsonb_build_object(
      'id', a.id, 'status', a.status, 'message', a.message, 'created_at', a.created_at, 'manager', v_manager,
      'opportunity_id', o.id, 'title', o.title, 'author', app.opportunity_author(o),
      'applicant_name', case when v_manager then btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) end,
      'applicant_email', case when v_manager then p.email end,
      'cv_file_id', a.cv_file_id, 'cv_name', (select f.file_name from public.opportunity_files f where f.id = a.cv_file_id),
      'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'body', e.body, 'created_at', e.created_at, 'mine', e.author_id = auth.uid()) order by e.created_at)
        from public.opportunity_application_events e where e.application_id = a.id), '[]'::jsonb))
      from public.opportunities o join public.profiles p on p.id = a.applicant_id
     where o.id = a.opportunity_id);
end;
$$;
revoke all on function public.application_thread(uuid) from public, anon;
grant execute on function public.application_thread(uuid) to authenticated;
