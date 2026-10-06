-- =============================================================================
-- Écosystème public : lecture contrôlée des images et des pièces.
--  • public_media : une image d'établissement n'est servie publiquement que si
--    elle est utilisée par une fiche ou une campagne publiée (rien d'autre).
--  • platform_verification_document : la plateforme lit une pièce seulement
--    si elle est jointe à une demande de vérification.
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
