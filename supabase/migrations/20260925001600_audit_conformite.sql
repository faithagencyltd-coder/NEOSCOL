-- =============================================================================
-- NéoScol — 1600 Audit de conformité (corrections)
--
-- 1. Un élève ARCHIVÉ n'est plus accessible par les portails (le sien et celui
--    de ses parents) ; son compte élève est suspendu, puis réactivé à la
--    restauration. L'historique (notes, présences, paiements, documents) est
--    intégralement conservé et reste consultable par l'administration.
-- =============================================================================

create or replace function app.my_portal_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (select app.member_org_ids() as ids)
  select coalesce(array_agg(distinct x.id), '{}')
  from (
    select sg.student_id as id
    from public.guardians g
    join public.student_guardians sg on sg.guardian_id = g.id and sg.portal_access
    join public.students s on s.id = sg.student_id and s.archived_at is null
    , orgs
    where g.user_id = auth.uid() and g.archived_at is null and g.organization_id = any (orgs.ids)
    union
    select s.id
    from public.students s, orgs
    where s.user_id = auth.uid() and s.archived_at is null and s.organization_id = any (orgs.ids)
  ) x;
$$;

create or replace function app.student_portal_account_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.archived_at is distinct from old.archived_at then
    update public.memberships
       set status = case when new.archived_at is null then 'active' else 'suspended' end::public.membership_status
     where organization_id = new.organization_id and user_id = new.user_id
       -- Ne réactive pas un compte suspendu volontairement par ailleurs.
       and (new.archived_at is not null or status = 'suspended');
    perform app.audit(new.organization_id,
                      case when new.archived_at is null then 'portal.account_reactivated' else 'portal.account_suspended' end,
                      'students', new.id,
                      case when new.archived_at is null then 'Compte portail élève réactivé (dossier restauré)'
                           else 'Compte portail élève suspendu (dossier archivé)' end);
  end if;
  return new;
end;
$$;
drop trigger if exists students_portal_account_sync on public.students;
create trigger students_portal_account_sync
  after update of archived_at on public.students
  for each row execute function app.student_portal_account_sync();

-- -----------------------------------------------------------------------------
-- 2. Console du Super Administrateur NéoScol : établissements de la plateforme,
--    premier administrateur d'un nouvel établissement.
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin();
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.platform_overview()
returns table (
  id uuid, name text, code text, type text, city text, status text, is_demo boolean, created_at timestamptz,
  students bigint, staff bigint, members bigint, admins bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select o.id, o.name, o.code, o.type::text, o.city, o.status::text, o.is_demo, o.created_at,
           (select count(*) from public.students s where s.organization_id = o.id and s.archived_at is null),
           (select count(*) from public.staff_members st where st.organization_id = o.id and st.archived_at is null),
           (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
           (select count(*) from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
              join public.roles r on r.id = mr.role_id and r.key = 'org_admin' where m.organization_id = o.id)
    from public.organizations o
    order by o.created_at desc;
end;
$$;
revoke execute on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;

-- Rattache un compte (créé côté serveur après contrôle) comme administrateur d'un établissement.
create or replace function public.platform_add_org_admin(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.memberships (organization_id, user_id, status, joined_at, invited_by)
  values (p_organization_id, p_user_id, 'active', now(), auth.uid())
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_membership;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  select p_organization_id, v_membership, r.id from public.roles r
  where r.organization_id = p_organization_id and r.key = 'org_admin'
  on conflict do nothing;
  perform app.audit(p_organization_id, 'settings.org_admin_created', 'memberships', v_membership,
                    'Administrateur de l''établissement créé par la plateforme');
end;
$$;
revoke execute on function public.platform_add_org_admin(uuid, uuid) from public, anon;
grant execute on function public.platform_add_org_admin(uuid, uuid) to authenticated;

-- Garde des attributions de rôles : la plateforme peut nommer un administrateur.
create or replace function app.check_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_user uuid;
begin
  if auth.uid() is null then
    return new; -- contexte système (service role, seed, migrations)
  end if;

  select user_id into v_member_user from public.memberships where id = new.membership_id;
  if v_member_user = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier vos propres rôles.' using errcode = 'insufficient_privilege';
  end if;

  -- La plateforme (Super administrateur) nomme le premier administrateur d'un établissement.
  if app.is_platform_admin() or app.has_permission(new.organization_id, 'roles.manage') then
    return new;
  end if;

  if app.has_permission(new.organization_id, 'portal_access.manage')
     and exists (select 1 from public.roles r where r.id = new.role_id and r.persona in ('parent', 'student')) then
    return new;
  end if;

  if exists (
    select 1 from public.role_permissions rp
    where rp.role_id = new.role_id
      and not app.has_permission(new.organization_id, rp.permission_code)
  ) then
    raise exception 'Ce rôle accorde des permissions que vous ne possédez pas.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

