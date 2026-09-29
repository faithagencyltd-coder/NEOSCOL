-- =============================================================================
-- P7e — PASSAGE D'ANNÉE : préparer N+1, réinscriptions groupées, clôture, archive
--
-- Réutilise l'existant : années et périodes, classes et matières, tarifs,
-- inscriptions (type « reenrollment », statut « pending » → validation et
-- facturation par le circuit habituel), décisions de fin d'année (P7b).
--   * Préparer N+1 : année, périodes, classes, matières (coefficients,
--     enseignants) et tarifs copiés si absents — idempotent.
--   * Propositions : passage / redoublement / départ / fin de cycle selon la
--     décision annuelle ; classe cible proposée, modifiable.
--   * Réinscriptions groupées : inscriptions « en attente » dans N+1.
--   * Clôture : périodes verrouillées, année close, N+1 devient l'année en
--     cours ; option « fin de cycle → ancien élève ». Aucune donnée supprimée.
--   * Archive : export des résultats d'une année.
-- =============================================================================

create or replace function app.current_year(p_org uuid)
returns public.academic_years
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.academic_years where organization_id = p_org and is_current;
$$;

-- Année suivante : la première qui commence après l'année en cours.
create or replace function app.next_year(p_org uuid)
returns public.academic_years
language sql
stable
security definer
set search_path = ''
as $$
  select n.* from public.academic_years n
  join public.academic_years c on c.organization_id = p_org and c.is_current
  where n.organization_id = p_org and n.id <> c.id and n.starts_on > c.starts_on
  order by n.starts_on limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 1. Préparer l'année suivante (idempotent)
-- -----------------------------------------------------------------------------
create or replace function public.prepare_next_academic_year(p_org uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cur public.academic_years;
  v_next public.academic_years;
  v_shift interval;
  v_name text;
  v_m text[];
  v_created_year boolean := false;
  v_periods integer := 0;
  v_classes integer := 0;
  v_subjects integer := 0;
  v_rates integer := 0;
  c record;
  v_new_class uuid;
begin
  if not app.has_permission(p_org, 'academic.manage') then
    raise exception 'Permission refusée : passage d''année.' using errcode = 'insufficient_privilege';
  end if;
  v_cur := app.current_year(p_org);
  v_next := app.next_year(p_org);
  if v_cur.id is null then
    raise exception 'Aucune année scolaire en cours.' using errcode = 'no_data_found';
  end if;
  if v_next.id is null then
    v_m := regexp_match(v_cur.name, '^(\d{4})\s*([-/])\s*(\d{4})$');
    v_name := case when v_m is not null then (v_m[1]::int + 1)::text || v_m[2] || (v_m[3]::int + 1)::text
                   else v_cur.name || ' (suivante)' end;
    insert into public.academic_years (organization_id, name, starts_on, ends_on, status, registration_starts_on, registration_ends_on)
    values (p_org, v_name, (v_cur.starts_on + interval '1 year')::date, (v_cur.ends_on + interval '1 year')::date, 'planned',
            (v_cur.registration_starts_on + interval '1 year')::date, (v_cur.registration_ends_on + interval '1 year')::date)
    returning * into v_next;
    v_created_year := true;
  end if;
  v_shift := v_next.starts_on - v_cur.starts_on;

  -- Périodes (si l'année suivante n'en a aucune).
  if not exists (select 1 from public.academic_periods where academic_year_id = v_next.id) then
    insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on)
    select p_org, v_next.id, p.name, p.type, p.sequence, (p.starts_on + v_shift)::date, (p.ends_on + v_shift)::date
    from public.academic_periods p where p.academic_year_id = v_cur.id;
    get diagnostics v_periods = row_count;
  end if;

  -- Classes (même nom), matières de la classe, puis tarifs.
  for c in
    select * from public.classes where academic_year_id = v_cur.id and kind = 'class' and archived_at is null order by name
  loop
    select id into v_new_class from public.classes where academic_year_id = v_next.id and name = c.name;
    if v_new_class is null then
      insert into public.classes (organization_id, academic_year_id, level_id, program_id, track_id, kind, name, code, capacity, room_id, tuition_amount, syllabus)
      values (p_org, v_next.id, c.level_id, c.program_id, c.track_id, 'class', c.name, c.code, c.capacity, c.room_id, c.tuition_amount, c.syllabus)
      returning id into v_new_class;
      v_classes := v_classes + 1;
      insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, sort_order)
      select p_org, v_new_class, cs.subject_id, cs.teacher_id, cs.coefficient, cs.weekly_hours, cs.sort_order
      from public.class_subjects cs where cs.class_id = c.id;
      get diagnostics v_subjects = row_count;
    end if;
  end loop;

  if not exists (select 1 from public.fee_rates where academic_year_id = v_next.id) then
    insert into public.fee_rates (organization_id, academic_year_id, fee_type_id, level_id, program_id, class_id, amount, is_mandatory, installment_plan, notes)
    select p_org, v_next.id, r.fee_type_id, r.level_id, r.program_id,
           (select n.id from public.classes o join public.classes n on n.academic_year_id = v_next.id and n.name = o.name where o.id = r.class_id),
           r.amount, r.is_mandatory,
           -- Échéancier décalé d'un an (dates au format aaaa-mm-jj).
           case when jsonb_typeof(r.installment_plan) = 'array' then (
             select coalesce(jsonb_agg(case when i ? 'due_on' and (i ->> 'due_on') ~ '^\d{4}-\d{2}-\d{2}$'
                                            then jsonb_set(i, '{due_on}', to_jsonb(((i ->> 'due_on')::date + v_shift)::date::text)) else i end), '[]'::jsonb)
             from jsonb_array_elements(r.installment_plan) i) else r.installment_plan end,
           r.notes
    from public.fee_rates r
    where r.academic_year_id = v_cur.id
      and (r.class_id is null or exists (select 1 from public.classes o join public.classes n on n.academic_year_id = v_next.id and n.name = o.name where o.id = r.class_id));
    get diagnostics v_rates = row_count;
  end if;

  perform app.audit(p_org, 'academic.next_year_prepared', 'academic_years', v_next.id,
    'Année ' || v_next.name || ' préparée : ' || v_classes || ' classe(s), ' || v_periods || ' période(s), ' || v_rates || ' tarif(s) copiés',
    jsonb_build_object('created_year', v_created_year, 'classes', v_classes, 'periods', v_periods, 'rates', v_rates), 'success');
  return jsonb_build_object('year_id', v_next.id, 'year_name', v_next.name, 'created_year', v_created_year,
                            'periods', v_periods, 'classes', v_classes, 'rates', v_rates);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Propositions de passage (lecture seule)
-- -----------------------------------------------------------------------------
create or replace function public.year_transition_proposals(p_org uuid)
returns table (
  student_id uuid, student_name text, matricule text, from_class_id uuid, from_class text,
  decision_code text, decision_label text, result_status text, average numeric,
  action text, target_class_id uuid, next_enrollment text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cur public.academic_years;
  v_next public.academic_years;
begin
  if not (app.has_permission(p_org, 'academic.manage') or app.has_permission(p_org, 'enrollments.manage')) then
    raise exception 'Permission refusée : passage d''année.' using errcode = 'insufficient_privilege';
  end if;
  v_cur := app.current_year(p_org);
  v_next := app.next_year(p_org);
  if v_cur.id is null then
    return;
  end if;
  return query
  with base as (
    select s.id as sid, s.last_name || ' ' || s.first_name as sname, s.matricule as smat,
           c.id as cid, c.name as cname, c.level_id, l.sequence as lseq, coalesce(nullif(l.short_name, ''), l.name) as lshort,
           r.decision_code as dcode, r.decision_label as dlabel, r.status as rstatus, r.average as ravg
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join public.classes c on c.id = e.class_id and c.kind = 'class'
    left join public.levels l on l.id = c.level_id
    left join public.annual_results r on r.student_id = s.id and r.class_id = c.id
    where e.organization_id = p_org and e.academic_year_id = v_cur.id and e.status = 'validated' and s.archived_at is null
  ),
  nxt as (
    select b.*,
           (select l2.id from public.levels l2 where l2.organization_id = p_org and l2.sequence > b.lseq order by l2.sequence limit 1) as next_level,
           case b.dcode when 'promoted' then 'promote' when 'repeat' then 'repeat' when 'excluded' then 'leave' else 'undecided' end as act0
    from base b
  )
  select n.sid, n.sname, n.smat, n.cid, n.cname, n.dcode, n.dlabel, n.rstatus, n.ravg,
         case when n.act0 = 'promote' and n.next_level is null then 'graduate' else n.act0 end,
         case
           when v_next.id is null then null
           when n.act0 in ('promote', 'undecided') and n.next_level is not null then coalesce(
             -- « 6e A » → « 5e A » : même suffixe dans le niveau suivant, sinon la première classe du niveau.
             (select k.id from public.classes k join public.levels kl on kl.id = k.level_id
               where k.academic_year_id = v_next.id and k.kind = 'class' and k.archived_at is null and k.level_id = n.next_level
                 and k.name = coalesce(nullif(kl.short_name, ''), kl.name) || substr(n.cname, char_length(n.lshort) + 1)
                 and left(n.cname, char_length(n.lshort)) = n.lshort
               limit 1),
             (select k.id from public.classes k where k.academic_year_id = v_next.id and k.kind = 'class' and k.archived_at is null
                and k.level_id = n.next_level order by k.name limit 1))
           when n.act0 = 'repeat' then coalesce(
             (select k.id from public.classes k where k.academic_year_id = v_next.id and k.kind = 'class' and k.name = n.cname and k.archived_at is null),
             (select k.id from public.classes k where k.academic_year_id = v_next.id and k.kind = 'class' and k.level_id = n.level_id and k.archived_at is null order by k.name limit 1))
         end,
         (select e2.reference || ' (' || e2.status || ')' from public.enrollments e2
           where e2.student_id = n.sid and v_next.id is not null and e2.academic_year_id = v_next.id and e2.status in ('draft', 'pending', 'validated')
           order by e2.created_at desc limit 1)
  from nxt n
  order by n.cname, n.sname;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Réinscriptions groupées : p_items = [{"student_id": …, "class_id": …}]
-- -----------------------------------------------------------------------------
create or replace function public.create_reenrollments(p_org uuid, p_items jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cur public.academic_years;
  v_next public.academic_years;
  it record;
  v_class public.classes;
  v_created integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if not app.has_permission(p_org, 'enrollments.manage') then
    raise exception 'Permission refusée : réinscriptions.' using errcode = 'insufficient_privilege';
  end if;
  v_cur := app.current_year(p_org);
  v_next := app.next_year(p_org);
  if v_next.id is null then
    raise exception 'Préparez d''abord l''année suivante.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'Liste invalide.' using errcode = 'check_violation';
  end if;
  for it in select * from jsonb_to_recordset(p_items) as x(student_id uuid, class_id uuid) loop
    select * into v_class from public.classes where id = it.class_id and organization_id = p_org and academic_year_id = v_next.id and kind = 'class';
    if v_class.id is null then
      v_skipped := v_skipped || jsonb_build_object('student_id', it.student_id, 'reason', 'Classe cible hors de l''année ' || v_next.name);
    elsif not exists (select 1 from public.enrollments e where e.student_id = it.student_id and e.organization_id = p_org
                        and e.academic_year_id = v_cur.id and e.status = 'validated') then
      v_skipped := v_skipped || jsonb_build_object('student_id', it.student_id, 'reason', 'Élève non inscrit cette année dans l''établissement');
    elsif exists (select 1 from public.enrollments e where e.student_id = it.student_id and e.academic_year_id = v_next.id
                    and e.status in ('draft', 'pending', 'validated')) then
      v_skipped := v_skipped || jsonb_build_object('student_id', it.student_id, 'reason', 'Déjà inscrit(e) pour ' || v_next.name);
    else
      insert into public.enrollments (organization_id, student_id, academic_year_id, class_id, level_id, program_id, type, status, notes)
      values (p_org, it.student_id, v_next.id, v_class.id, v_class.level_id, v_class.program_id, 'reenrollment', 'pending',
              'Réinscription groupée (passage d''année)');
      v_created := v_created + 1;
    end if;
  end loop;
  perform app.audit(p_org, 'enrollment.bulk_reenrollment', 'academic_years', v_next.id,
    v_created || ' réinscription(s) créée(s) pour ' || v_next.name || ', ' || jsonb_array_length(v_skipped) || ' ignorée(s)',
    jsonb_build_object('skipped', v_skipped), 'success');
  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'year_name', v_next.name);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Clôture de l'année en cours
-- -----------------------------------------------------------------------------
create or replace function public.close_academic_year(p_org uuid, p_mark_graduates boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cur public.academic_years;
  v_next public.academic_years;
  v_graduates integer := 0;
  v_without integer;
begin
  if not app.has_permission(p_org, 'academic.manage') then
    raise exception 'Permission refusée : clôture de l''année.' using errcode = 'insufficient_privilege';
  end if;
  v_cur := app.current_year(p_org);
  v_next := app.next_year(p_org);
  if v_cur.id is null then
    raise exception 'Aucune année scolaire en cours.' using errcode = 'no_data_found';
  end if;
  if v_next.id is null then
    raise exception 'Préparez d''abord l''année suivante.' using errcode = 'check_violation';
  end if;

  -- Fin de cycle (décision « admis » dans le dernier niveau, sans réinscription) → ancien élève.
  if p_mark_graduates then
    update public.students s set status = 'alumni'
     where s.id in (
       select p.student_id from public.year_transition_proposals(p_org) p
        where p.action = 'graduate' and p.next_enrollment is null)
       and s.status = 'active';
    get diagnostics v_graduates = row_count;
  end if;
  select count(*) into v_without from public.year_transition_proposals(p_org) p where p.next_enrollment is null;

  update public.academic_periods set is_locked = true, locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, auth.uid())
   where academic_year_id = v_cur.id and not is_locked;
  update public.academic_years set is_current = false, status = 'closed' where id = v_cur.id;
  update public.academic_years set is_current = true, status = 'active' where id = v_next.id;

  perform app.audit(p_org, 'academic.year_closed', 'academic_years', v_cur.id,
    'Année ' || v_cur.name || ' clôturée ; ' || v_next.name || ' devient l''année en cours',
    jsonb_build_object('next_year', v_next.id, 'graduates', v_graduates, 'without_reenrollment', v_without), 'success');
  return jsonb_build_object('closed', v_cur.name, 'current', v_next.name, 'graduates', v_graduates, 'without_reenrollment', v_without);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Archive d'une année (résultats) — lecture seule
-- -----------------------------------------------------------------------------
create or replace function public.academic_year_archive(p_org uuid, p_year uuid)
returns table (matricule text, last_name text, first_name text, birth_date date, class_name text,
               average numeric, rank integer, mention text, decision text, result_status text, enrollment text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission(p_org, 'academic.manage') or app.has_permission(p_org, 'reports.export')) then
    raise exception 'Permission refusée : archives.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year and organization_id = p_org) then
    raise exception 'Année introuvable.' using errcode = 'no_data_found';
  end if;
  return query
  select s.matricule, s.last_name, s.first_name, s.birth_date, c.name, r.average, r.rank, r.mention,
         coalesce(r.decision_label, r.proposed_label), r.status, e.reference
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.classes c on c.id = e.class_id
  left join public.annual_results r on r.student_id = s.id and r.class_id = e.class_id
  where e.organization_id = p_org and e.academic_year_id = p_year and e.status = 'validated'
  order by c.name, s.last_name, s.first_name;
end;
$$;

revoke execute on function app.current_year(uuid) from public, anon, authenticated;
revoke execute on function app.next_year(uuid) from public, anon, authenticated;
revoke execute on function public.prepare_next_academic_year(uuid) from public, anon;
revoke execute on function public.year_transition_proposals(uuid) from public, anon;
revoke execute on function public.create_reenrollments(uuid, jsonb) from public, anon;
revoke execute on function public.close_academic_year(uuid, boolean) from public, anon;
revoke execute on function public.academic_year_archive(uuid, uuid) from public, anon;
grant execute on function public.prepare_next_academic_year(uuid) to authenticated;
grant execute on function public.year_transition_proposals(uuid) to authenticated;
grant execute on function public.create_reenrollments(uuid, jsonb) to authenticated;
grant execute on function public.close_academic_year(uuid, boolean) to authenticated;
grant execute on function public.academic_year_archive(uuid, uuid) to authenticated;
