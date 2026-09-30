-- =============================================================================
-- Séparation stricte des modules (scolaire / formation professionnelle /
-- université) sur une seule plateforme Neoscool.
--
-- Rôles : chaque établissement ne voit que les noms de son module.
--   École        : « Élève », « Enseignant »
--   Formation    : « Apprenant », « Formateur » (+ « Responsable formation »)
--   Université   : « Étudiant », « Enseignant »
-- Seuls les noms standard sont renommés (jamais un nom personnalisé), le code
-- technique du rôle, ses droits et ses comptes ne changent pas.
-- « Responsable formation » n'est plus créé dans une école ni une université ;
-- les rôles existants ne sont pas supprimés (l'interface masque ceux qui n'ont
-- aucun compte). Si le type d'établissement change, les noms suivent le module
-- et les rôles manquants du nouveau module sont créés.
-- =============================================================================

create or replace function app.org_family(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type in ('university', 'institute') then 'higher'
    when p_type in ('vocational_center', 'technical_center') then 'training'
    else 'school' end;
$$;

-- Nom d'un rôle standard dans un module ; tout autre nom est conservé tel quel.
create or replace function app.module_role_name(p_type text, p_key text, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_key = 'teacher' and p_name in ('Enseignant / Formateur', 'Enseignant', 'Formateur')
      then case app.org_family(p_type) when 'training' then 'Formateur' else 'Enseignant' end
    when p_key = 'student' and p_name in ('Élève / Apprenant', 'Élève / Étudiant', 'Élève', 'Apprenant', 'Étudiant')
      then case app.org_family(p_type) when 'training' then 'Apprenant' when 'higher' then 'Étudiant' else 'Élève' end
    else p_name end;
$$;

create or replace function app.role_module_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.organization_id is null then
    return new; -- modèles de la plateforme
  end if;
  select type into v_type from public.organizations where id = new.organization_id;
  -- « Responsable formation » : propre au centre de formation.
  if tg_op = 'INSERT' and new.key = 'training_manager' and app.org_family(v_type) <> 'training' then
    return null;
  end if;
  new.name := app.module_role_name(v_type, new.key, new.name);
  return new;
end;
$$;

drop trigger if exists roles_module_guard on public.roles;
create trigger roles_module_guard before insert on public.roles
  for each row execute function app.role_module_guard();

-- Changement de type d'établissement : noms du nouveau module + rôles manquants.
create or replace function app.organization_module_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type is not distinct from old.type then
    return new;
  end if;
  update public.roles
     set name = app.module_role_name(new.type::text, key, name)
   where organization_id = new.id and key in ('teacher', 'student')
     and name is distinct from app.module_role_name(new.type::text, key, name);
  insert into public.roles (organization_id, key, name, description, persona, is_system)
  select new.id, r.key, r.name, r.description, r.persona, true
  from public.roles r where r.organization_id is null
  on conflict (organization_id, key) do nothing;
  insert into public.role_permissions (role_id, permission_code)
  select org_role.id, rp.permission_code
  from public.roles tpl
  join public.role_permissions rp on rp.role_id = tpl.id
  join public.roles org_role on org_role.organization_id = new.id and org_role.key = tpl.key
  where tpl.organization_id is null
    and not exists (select 1 from public.role_permissions x where x.role_id = org_role.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_module_changed on public.organizations;
create trigger organizations_module_changed after update of type on public.organizations
  for each row execute function app.organization_module_changed();

-- Établissements existants : noms standard alignés sur leur module.
update public.roles r
   set name = app.module_role_name(o.type::text, r.key, r.name)
  from public.organizations o
 where o.id = r.organization_id and r.key in ('teacher', 'student')
   and r.name is distinct from app.module_role_name(o.type::text, r.key, r.name);

comment on function app.module_role_name(text, text, text) is
  'Séparation des modules : nom d''un rôle standard (élève / apprenant / étudiant, enseignant / formateur) selon le type d''établissement.';
