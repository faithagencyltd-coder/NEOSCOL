-- =============================================================================
-- NéoScol — 1000 Pédagogie : appel, saisie des notes, calcul des bulletins
-- Fonctions SECURITY INVOKER : la RLS de l'utilisateur s'applique (un
-- enseignant n'agit que sur ses classes/matières), une transaction par appel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Appel : crée ou met à jour la séance puis le statut de chaque élève.
-- p_records : [{ student_id, status: present|absent|late|excused, minutes_late? }]
-- Les justifications existantes ne sont jamais écrasées par l'appel.
-- -----------------------------------------------------------------------------
create or replace function public.record_attendance(
  p_class_id uuid,
  p_session_date date,
  p_starts_at time,
  p_ends_at time,
  p_class_subject_id uuid default null,
  p_records jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_session uuid;
  v_record jsonb;
begin
  select organization_id into v_org from public.classes where id = p_class_id;
  if v_org is null then
    raise exception 'Classe introuvable.' using errcode = 'no_data_found';
  end if;
  if p_session_date > current_date + 1 then
    raise exception 'L''appel ne peut pas être fait pour une date future.' using errcode = 'check_violation';
  end if;

  insert into public.attendance_sessions (organization_id, class_id, class_subject_id, session_date, starts_at, ends_at)
  values (v_org, p_class_id, p_class_subject_id, p_session_date, p_starts_at, p_ends_at)
  on conflict (class_id, session_date, starts_at)
    do update set ends_at = excluded.ends_at,
                  class_subject_id = coalesce(excluded.class_subject_id, public.attendance_sessions.class_subject_id),
                  taken_by = auth.uid()
  returning id into v_session;

  for v_record in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    -- Seuls les élèves inscrits (validés) dans la classe sont pris en compte.
    if exists (
      select 1 from public.enrollments e
      where e.class_id = p_class_id and e.status = 'validated' and e.student_id = (v_record ->> 'student_id')::uuid
    ) then
      insert into public.attendance_records (organization_id, session_id, student_id, status, minutes_late)
      values (
        v_org, v_session, (v_record ->> 'student_id')::uuid,
        (v_record ->> 'status')::public.attendance_status,
        case when v_record ->> 'status' = 'late' then nullif(v_record ->> 'minutes_late', '')::integer end
      )
      on conflict (session_id, student_id)
        do update set status = excluded.status, minutes_late = excluded.minutes_late;
    end if;
  end loop;

  return v_session;
end;
$$;
revoke execute on function public.record_attendance(uuid, date, time, time, uuid, jsonb) from public, anon;
grant execute on function public.record_attendance(uuid, date, time, time, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Saisie des notes d'une évaluation (enregistrement groupé).
-- p_grades : [{ student_id, score?, is_absent?, is_exempt?, comment? }]
-- Une ligne sans note ni mention supprime la note existante.
-- -----------------------------------------------------------------------------
create or replace function public.save_grades(p_assessment_id uuid, p_grades jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_assessment record;
  v_grade jsonb;
  v_score numeric;
  v_absent boolean;
  v_exempt boolean;
  v_count integer := 0;
begin
  select id, organization_id into v_assessment from public.assessments where id = p_assessment_id;
  if v_assessment.id is null then
    raise exception 'Évaluation introuvable.' using errcode = 'no_data_found';
  end if;

  for v_grade in select * from jsonb_array_elements(coalesce(p_grades, '[]'::jsonb)) loop
    v_score := nullif(v_grade ->> 'score', '')::numeric;
    v_absent := coalesce((v_grade ->> 'is_absent')::boolean, false);
    v_exempt := coalesce((v_grade ->> 'is_exempt')::boolean, false);

    if v_score is null and not v_absent and not v_exempt then
      delete from public.grades
       where assessment_id = p_assessment_id and student_id = (v_grade ->> 'student_id')::uuid;
    else
      insert into public.grades (organization_id, assessment_id, student_id, score, is_absent, is_exempt, comment)
      values (
        v_assessment.organization_id, p_assessment_id, (v_grade ->> 'student_id')::uuid,
        case when v_absent or v_exempt then null else v_score end,
        v_absent, v_exempt and not v_absent,
        nullif(btrim(v_grade ->> 'comment'), '')
      )
      on conflict (assessment_id, student_id)
        do update set score = excluded.score, is_absent = excluded.is_absent,
                      is_exempt = excluded.is_exempt, comment = excluded.comment;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.save_grades(uuid, jsonb) from public, anon;
grant execute on function public.save_grades(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Calcul des bulletins d'une classe pour une période.
-- Moyenne de matière = Σ(note/barème×20 × coef. évaluation) / Σ coef. évaluation
-- Moyenne générale   = Σ(moyenne matière × coef. matière) / Σ coef. matière
-- Rang : classement par moyenne générale (ex æquo au même rang).
-- Les bulletins déjà publiés ne sont pas modifiés.
-- -----------------------------------------------------------------------------
create or replace function public.compute_report_cards(p_class_id uuid, p_period_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_year uuid;
  v_count integer;
begin
  select organization_id, academic_year_id into v_org, v_year from public.classes where id = p_class_id;
  if v_org is null then
    raise exception 'Classe introuvable.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.academic_periods where id = p_period_id and academic_year_id = v_year) then
    raise exception 'La période ne correspond pas à l''année de la classe.' using errcode = 'check_violation';
  end if;
  -- Sans droit de lecture sur toutes les notes, la RLS masquerait des notes : calcul faux.
  if not (app.has_permission(v_org, 'grades.read') or app.has_permission(v_org, 'grades.manage')) then
    raise exception 'Le calcul des bulletins nécessite la lecture de toutes les notes (grades.read).' using errcode = 'insufficient_privilege';
  end if;

  with students as (
    select e.student_id from public.enrollments e where e.class_id = p_class_id and e.status = 'validated'
  ),
  subjects as (
    select cs.id, cs.coefficient, s.name as subject,
           nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '') as teacher
    from public.class_subjects cs
    join public.subjects s on s.id = cs.subject_id
    left join public.staff_members t on t.id = cs.teacher_id
    where cs.class_id = p_class_id
  ),
  subject_avg as (
    select g.student_id, a.class_subject_id,
           sum(g.score / a.max_score * 20 * a.coefficient) / sum(a.coefficient) as average
    from public.grades g
    join public.assessments a on a.id = g.assessment_id
    where a.class_id = p_class_id and a.academic_period_id = p_period_id
      and g.score is not null and g.student_id in (select student_id from students)
    group by g.student_id, a.class_subject_id
  ),
  subject_stats as (
    select class_subject_id, avg(average) as class_average, min(average) as min_average, max(average) as max_average
    from subject_avg group by class_subject_id
  ),
  general as (
    select sa.student_id, sum(sa.average * sb.coefficient) / sum(sb.coefficient) as average
    from subject_avg sa join subjects sb on sb.id = sa.class_subject_id
    group by sa.student_id
  ),
  ranked as (
    select st.student_id, round(g.average, 2) as average,
           case when g.average is not null then rank() over (order by g.average desc nulls last) end as rank
    from students st left join general g on g.student_id = st.student_id
  ),
  class_info as (
    select count(*) as size, round(avg(average), 2) as class_average from ranked
  ),
  details as (
    select st.student_id,
           coalesce(jsonb_agg(jsonb_build_object(
             'subject', sb.subject,
             'teacher', sb.teacher,
             'coefficient', sb.coefficient,
             'average', round(sa.average, 2),
             'class_average', round(ss.class_average, 2),
             'min', round(ss.min_average, 2),
             'max', round(ss.max_average, 2)
           ) order by sb.subject), '[]'::jsonb) as subjects
    from students st
    cross join subjects sb
    left join subject_avg sa on sa.student_id = st.student_id and sa.class_subject_id = sb.id
    left join subject_stats ss on ss.class_subject_id = sb.id
    group by st.student_id
  ),
  upserted as (
    insert into public.report_cards (organization_id, student_id, class_id, academic_period_id, average, rank, class_size, data)
    select v_org, r.student_id, p_class_id, p_period_id, r.average, r.rank, ci.size,
           jsonb_build_object('subjects', d.subjects, 'class_average', ci.class_average, 'computed_at', now())
    from ranked r
    cross join class_info ci
    join details d on d.student_id = r.student_id
    on conflict (student_id, class_id, academic_period_id)
      do update set average = excluded.average, rank = excluded.rank,
                    class_size = excluded.class_size, data = excluded.data
      where public.report_cards.status = 'draft'
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;
revoke execute on function public.compute_report_cards(uuid, uuid) from public, anon;
grant execute on function public.compute_report_cards(uuid, uuid) to authenticated;
