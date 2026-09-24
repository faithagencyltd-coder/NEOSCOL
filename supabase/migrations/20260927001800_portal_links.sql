-- =============================================================================
-- Lien des portails : une adresse unique et partageable par établissement
-- (/acces/CODE) donnant accès aux portails Parent, Enseignant/Formateur et
-- Élève/Étudiant. Chacun se connecte avec ses propres identifiants.
--
-- Seule l'identité publique de l'établissement est exposée aux visiteurs non
-- connectés (nom, type, ville, couleurs, logo) : aucune donnée personnelle,
-- aucun effectif, aucun paramètre. Établissements suspendus ou archivés : rien.
-- =============================================================================

create or replace function public.organization_portal(p_code text)
returns table (
  id uuid,
  name text,
  short_name text,
  code text,
  type public.organization_type,
  city text,
  country text,
  primary_color text,
  secondary_color text,
  has_logo boolean,
  is_demo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.short_name, o.code, o.type, o.city, o.country,
         coalesce(b.primary_color, '#1D4ED8'), coalesce(b.secondary_color, '#0F172A'),
         exists (
           select 1 from public.file_objects f
           where f.id::text = b.logo_path and f.organization_id = o.id
             and f.content is not null and f.mime_type in ('image/png', 'image/jpeg', 'image/webp')
         ),
         o.is_demo
  from public.organizations o
  left join public.organization_branding b on b.organization_id = o.id
  where o.code = upper(btrim(p_code)) and o.status = 'active';
$$;

comment on function public.organization_portal(text) is
  'Identité publique d''un établissement actif pour la page des portails (/acces/CODE). Aucune donnée personnelle.';

revoke execute on function public.organization_portal(text) from public;
grant execute on function public.organization_portal(text) to anon, authenticated;

-- Logo de l'établissement (uniquement le fichier désigné comme logo, image seulement).
create or replace function public.organization_portal_logo(p_code text)
returns table (mime_type text, content bytea)
language sql
stable
security definer
set search_path = ''
as $$
  select f.mime_type, f.content
  from public.organizations o
  join public.organization_branding b on b.organization_id = o.id
  join public.file_objects f on f.id::text = b.logo_path and f.organization_id = o.id
  where o.code = upper(btrim(p_code)) and o.status = 'active'
    and f.content is not null and f.mime_type in ('image/png', 'image/jpeg', 'image/webp');
$$;

revoke execute on function public.organization_portal_logo(text) from public;
grant execute on function public.organization_portal_logo(text) to anon, authenticated;

-- Comptes activés par portail (carte « Lien des portails »), réservé à settings.manage.
create or replace function public.portal_account_counts(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'parents', (select count(*) from public.guardians g where g.organization_id = p_org and g.user_id is not null and g.archived_at is null),
    'students', (select count(*) from public.students s where s.organization_id = p_org and s.user_id is not null and s.archived_at is null),
    'teachers', (
      select count(distinct m.user_id)
      from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
      where m.organization_id = p_org and m.status = 'active' and r.persona = 'teacher'
    ),
    'staff', (
      select count(distinct m.user_id)
      from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.roles r on r.id = mr.role_id
      where m.organization_id = p_org and m.status = 'active' and r.persona = 'staff'
    )
  );
end;
$$;

revoke execute on function public.portal_account_counts(uuid) from public, anon;
grant execute on function public.portal_account_counts(uuid) to authenticated;
