-- =============================================================================
-- NéoScol — 1500 Lectures du portail parent / élève
--
-- Les comptes portail ne lisent pas la table du personnel : ces fonctions
-- exposent uniquement le nom des enseignants de LEURS classes, l'emploi du
-- temps (soumis à la restriction « timetable ») et l'état des comptes portail
-- pour l'administration. Toute lecture reste bornée à app.my_portal_student_ids().
-- =============================================================================

-- Enfants (parent) ou soi-même (élève) dans un établissement, avec la classe en cours.
create or replace function public.portal_students(p_organization_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  matricule text,
  birth_date date,
  photo_path text,
  status text,
  class_id uuid,
  class_name text,
  academic_year_id uuid,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.first_name, s.last_name, s.matricule, s.birth_date, s.photo_path, s.status::text,
         e.class_id, c.name, e.academic_year_id, s.user_id is not distinct from auth.uid()
  from public.students s
  left join lateral (
    select en.class_id, en.academic_year_id
    from public.enrollments en
    join public.academic_years y on y.id = en.academic_year_id
    where en.student_id = s.id and en.status = 'validated'
    order by y.is_current desc, y.starts_on desc
    limit 1
  ) e on true
  left join public.classes c on c.id = e.class_id
  where s.organization_id = p_organization_id
    and s.id = any (app.my_portal_student_ids())
  order by s.user_id is not distinct from auth.uid() desc, s.birth_date, s.first_name;
$$;
revoke execute on function public.portal_students(uuid) from public, anon;
grant execute on function public.portal_students(uuid) to authenticated;

-- Matières de la classe d'un élève, avec coefficient et enseignant (nom uniquement).
create or replace function public.portal_class_subjects(p_student_id uuid)
returns table (subject text, color text, coefficient numeric, teacher text, is_head_teacher boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class uuid;
begin
  if not (p_student_id = any (app.my_portal_student_ids())) then
    raise exception 'Accès non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  select en.class_id into v_class
  from public.enrollments en join public.academic_years y on y.id = en.academic_year_id
  where en.student_id = p_student_id and en.status = 'validated'
  order by y.is_current desc, y.starts_on desc limit 1;
  return query
    select sub.name, sub.color, cs.coefficient,
           case when st.id is null then null else st.first_name || ' ' || st.last_name end,
           st.id is not null and st.id = c.head_teacher_id
    from public.class_subjects cs
    join public.subjects sub on sub.id = cs.subject_id
    join public.classes c on c.id = cs.class_id
    left join public.staff_members st on st.id = cs.teacher_id
    where cs.class_id = v_class
    order by cs.sort_order, sub.name;
end;
$$;
revoke execute on function public.portal_class_subjects(uuid) from public, anon;
grant execute on function public.portal_class_subjects(uuid) to authenticated;

-- Emploi du temps de la classe d'un élève ; vide si la fonctionnalité est restreinte.
create or replace function public.portal_timetable(p_student_id uuid)
returns table (id uuid, weekday smallint, starts_at time, ends_at time, subject text, color text, teacher text, room text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class uuid;
  v_year uuid;
begin
  if not (p_student_id = any (app.my_portal_student_ids())) then
    raise exception 'Accès non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if app.portal_restricted(p_student_id, 'timetable') then
    return;
  end if;
  select en.class_id, en.academic_year_id into v_class, v_year
  from public.enrollments en join public.academic_years y on y.id = en.academic_year_id
  where en.student_id = p_student_id and en.status = 'validated'
  order by y.is_current desc, y.starts_on desc limit 1;
  return query
    select ts.id, ts.weekday, ts.starts_at, ts.ends_at, coalesce(sub.name, ts.label), sub.color,
           case when st.id is null then null else st.first_name || ' ' || st.last_name end,
           r.name
    from public.timetable_slots ts
    left join public.class_subjects cs on cs.id = ts.class_subject_id
    left join public.subjects sub on sub.id = cs.subject_id
    left join public.staff_members st on st.id = ts.teacher_id
    left join public.rooms r on r.id = ts.room_id
    where ts.class_id = v_class and ts.academic_year_id = v_year
    order by ts.weekday, ts.starts_at;
end;
$$;
revoke execute on function public.portal_timetable(uuid) from public, anon;
grant execute on function public.portal_timetable(uuid) to authenticated;

-- État du compte portail d'un parent ou d'un élève (écrans d'administration).
create or replace function public.portal_account(p_kind text, p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
  v_status text;
  v_last timestamptz;
  v_login text;
begin
  if p_kind = 'guardian' then
    select organization_id, user_id into v_org, v_user from public.guardians where id = p_record_id;
  elsif p_kind = 'student' then
    select organization_id, user_id into v_org, v_user from public.students where id = p_record_id;
  end if;
  if v_org is null or not (
    app.has_permission(v_org, 'portal_access.manage')
    or app.has_permission(v_org, case when p_kind = 'guardian' then 'guardians.read' else 'students.read' end)
  ) then
    raise exception 'Accès non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if v_user is null then
    return jsonb_build_object('has_account', false);
  end if;
  select m.status::text into v_status from public.memberships m where m.organization_id = v_org and m.user_id = v_user;
  select u.last_sign_in_at, coalesce(case when u.phone is not null and u.phone <> '' then '+' || ltrim(u.phone, '+') end, u.email)
    into v_last, v_login
  from auth.users u where u.id = v_user;
  return jsonb_build_object('has_account', true, 'status', coalesce(v_status, 'suspended'),
                            'last_sign_in_at', v_last, 'login', v_login);
end;
$$;
revoke execute on function public.portal_account(text, uuid) from public, anon;
grant execute on function public.portal_account(text, uuid) to authenticated;
