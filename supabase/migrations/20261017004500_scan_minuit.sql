-- =============================================================================
-- Correctif « minuit » du scan des badges.
--
-- La fenêtre d'ouverture « X minutes avant le cours » était calculée par
-- « heure de début - X minutes » : pour un cours qui commence peu après minuit
-- (00:05), le calcul repassait à la veille (23:50) et le scan était refusé.
-- De même, le retard « heure de début + tolérance » repassait à 00:05 pour un
-- cours de 23:50. Les deux comparaisons sont désormais faites sans franchir
-- minuit. Aucune autre modification des fonctions (reprises à l'identique).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.scan_badge_core(p_organization_id uuid, p_code text, p_device text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_badge public.student_badges;
  v_result jsonb;
  v_staff public.staff_members;
  v_course jsonb;
  v_org public.organizations;
  v_cfg jsonb;
  v_local timestamp;
  v_today date;
  v_time time;
  v_tolerance integer;
  v_open_before interval;
  v_dup_window integer;
  v_student public.students;
  v_enr record;
  v_slot record;
  v_next record;
  v_open public.learner_attendance;
  v_row public.learner_attendance;
  v_reason text;
  v_message text;
  v_kind text;
  v_late integer := 0;
  v_period integer;
  v_day integer;
  v_scan uuid;
  v_person jsonb;
  v_higher boolean;
  v_early integer := 0;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  v_token := substring(upper(btrim(coalesce(p_code, ''))) from '([A-HJ-NP-Z2-9]{32})$');
  if v_token is not null then
    select * into v_badge from public.student_badges where token = v_token;
  end if;

  -- Personnel / formateur (ou code inconnu) : pointage existant.
  if v_badge.id is null then
    v_result := public.scan_staff_badge(p_organization_id, p_code, p_device);
    if v_token is not null then
      select s.* into v_staff
      from public.staff_badges b join public.staff_members s on s.id = b.staff_id
      where b.token = v_token and b.organization_id = p_organization_id;
    end if;
    if v_staff.id is not null then
      v_course := app.trainer_course_now(p_organization_id, v_staff.id);
      v_result := v_result || jsonb_build_object(
        'profile', case when v_staff.is_teacher then 'trainer' else 'staff' end,
        'greeting', 'Bonjour ' || v_staff.first_name,
        'course', v_course);
    end if;
    return v_result;
  end if;

  -- Apprenant.
  select * into v_org from public.organizations where id = p_organization_id;
  v_local := now() at time zone v_org.timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_higher := app.is_higher_org(p_organization_id);
  v_cfg := coalesce(app.org_training(p_organization_id), app.org_university(p_organization_id) -> 'rules', app.default_training_settings());
  v_tolerance := coalesce((v_cfg ->> 'late_tolerance_minutes')::integer, 5);
  v_open_before := make_interval(mins => coalesce((v_cfg ->> 'open_before_minutes')::integer, 30));
  v_dup_window := coalesce((v_org.settings #>> '{staff_attendance,duplicate_window_seconds}')::integer, 60);

  if v_badge.organization_id <> p_organization_id then
    v_reason := 'other_organization';
    v_message := 'Ce badge appartient à un autre établissement.';
    v_badge := null; -- aucune information sur l'autre établissement n'est conservée
  else
    select * into v_student from public.students where id = v_badge.student_id;
    if v_badge.status <> 'active' then
      v_reason := 'revoked_badge';
      v_message := 'Ce badge a été désactivé (perdu ou remplacé). Adressez-vous à l''administration.';
    elsif v_student.status <> 'active' or v_student.archived_at is not null then
      v_reason := 'inactive_learner';
      v_message := 'Cet apprenant n''est pas actif.';
    else
      select e.id, e.class_id, e.group_id, c.name as session_name, c.room_id as session_room, p.name as formation_name,
             g.name as group_name, l.name as level_name, ay.name as year_name
        into v_enr
      from public.enrollments e
      join public.classes c on c.id = e.class_id and c.archived_at is null
      join public.academic_years ay on ay.id = c.academic_year_id
      left join public.programs p on p.id = c.program_id
      left join public.levels l on l.id = coalesce(e.level_id, c.level_id)
      left join public.training_groups g on g.id = e.group_id
      where e.student_id = v_student.id and e.organization_id = p_organization_id and e.status = 'validated'
        and (
          (c.kind = 'training_session' and (c.starts_on is null or c.starts_on <= v_today) and (c.ends_on is null or c.ends_on >= v_today))
          -- Université : promotion de l'année académique en cours.
          or (v_higher and c.kind = 'class' and v_today between coalesce(c.starts_on, ay.starts_on) and coalesce(c.ends_on, ay.ends_on))
        )
      order by c.starts_on desc nulls last, ay.starts_on desc
      limit 1;
      if v_enr.id is null then
        v_reason := 'no_active_session';
        v_message := case when v_higher then 'Aucune inscription pour l''année académique en cours.'
                          else 'Aucune session de formation en cours pour cet apprenant.' end;
      elsif exists (
        select 1 from public.badge_scans
        where student_id = v_student.id and result = 'accepted'
          and scanned_at > now() - make_interval(secs => v_dup_window)
      ) then
        v_reason := 'duplicate';
        v_message := 'Badge déjà scanné à l''instant.';
      end if;
    end if;
  end if;

  if v_student.id is not null then
    v_person := jsonb_build_object('name', v_student.first_name || ' ' || v_student.last_name,
                                   'first_name', v_student.first_name, 'matricule', v_student.matricule,
                                   'photo_file_id', v_student.photo_path);
  end if;

  if v_reason is null then
    -- Périodes restées ouvertes les jours précédents : clôturées à la fin du cours.
    update public.learner_attendance la
       set exited_at = greatest(la.entered_at,
                                coalesce((la.attendance_date + ts.ends_at) at time zone v_org.timezone, la.entered_at)),
           auto_closed = true
      from public.learner_attendance la2
      left join public.timetable_slots ts on ts.id = la2.timetable_slot_id
     where la.id = la2.id and la.student_id = v_student.id and la.exited_at is null and la.attendance_date < v_today;

    select * into v_open from public.learner_attendance where student_id = v_student.id and exited_at is null;

    if v_open.id is null then
      -- ENTRÉE : cours de la session (ou du groupe) dans la fenêtre horaire.
      select ts.id, ts.starts_at, ts.ends_at, ts.room_id, coalesce(s.name, ts.label, 'Cours') as subject, r.name as room,
             st.first_name || ' ' || st.last_name as teacher
        into v_slot
      from public.timetable_slots ts
      left join public.class_subjects cs on cs.id = ts.class_subject_id
      left join public.subjects s on s.id = cs.subject_id
      left join public.rooms r on r.id = ts.room_id
      left join public.staff_members st on st.id = ts.teacher_id
      where ts.class_id = v_enr.class_id
        and (ts.group_id is null or ts.group_id is not distinct from v_enr.group_id)
        and ts.weekday = extract(isodow from v_today)
        and v_time >= ts.starts_at - least(v_open_before, ts.starts_at - time '00:00')
        and v_time < ts.ends_at
        -- Université : si l'étudiant a une inscription pédagogique, seuls les cours de ses UE comptent.
        and (not v_higher or s.teaching_unit_id is null
             or not exists (select 1 from public.course_registrations cr where cr.enrollment_id = v_enr.id)
             or exists (select 1 from public.course_registrations cr where cr.enrollment_id = v_enr.id
                        and cr.teaching_unit_id = s.teaching_unit_id and cr.status = 'registered'))
      order by ts.starts_at
      limit 1;
      if v_slot.id is null and not coalesce((v_cfg ->> 'entry_without_course')::boolean, false) then
        select coalesce(s.name, ts.label, 'Cours') as subject, ts.starts_at into v_next
        from public.timetable_slots ts
        left join public.class_subjects cs on cs.id = ts.class_subject_id
        left join public.subjects s on s.id = cs.subject_id
        where ts.class_id = v_enr.class_id
          and (ts.group_id is null or ts.group_id is not distinct from v_enr.group_id)
          and ts.weekday = extract(isodow from v_today) and ts.starts_at > v_time
        order by ts.starts_at limit 1;
        v_reason := 'no_course';
        v_message := 'Aucun cours prévu pour vous en ce moment.'
          || case when v_next.starts_at is not null
                  then ' Prochain cours : ' || v_next.subject || ' à ' || to_char(v_next.starts_at, 'HH24:MI') || '.' else '' end;
      elsif v_slot.id is not null and p_room_id is not null and v_slot.room_id is not null and v_slot.room_id <> p_room_id then
        v_reason := 'wrong_room';
        v_message := 'Votre cours « ' || v_slot.subject || ' » a lieu en salle ' || coalesce(v_slot.room, '?') || '.';
      else
        v_kind := 'entry';
        -- Retard : uniquement à la première entrée du cours (une ré-entrée n'est pas un retard).
        if v_slot.id is not null and v_time - v_slot.starts_at > make_interval(mins => v_tolerance)
           and not exists (select 1 from public.learner_attendance
                           where student_id = v_student.id and attendance_date = v_today and timetable_slot_id = v_slot.id) then
          v_late := floor(extract(epoch from (v_time - v_slot.starts_at)) / 60)::integer;
        end if;
      end if;
    else
      v_kind := 'exit';
    end if;
  end if;

  if v_reason is not null then
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'rejected', v_reason, v_message, left(p_device, 120))
    returning id into v_scan;
    perform app.audit(p_organization_id, 'learner_attendance.scan', 'badge_scans', v_scan, v_message,
                      jsonb_build_object('reason', v_reason, 'student_id', v_student.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message, 'profile', 'learner',
                              'learner', v_person, 'at', to_char(v_local, 'HH24:MI'));
  end if;

  if v_kind = 'entry' then
    v_message := 'Entrée enregistrée — ' || case when v_late > 0 then 'EN RETARD — ' || v_late || ' MINUTE' || case when v_late > 1 then 'S' else '' end
                                                  when v_slot.id is null then 'hors cours' else 'À L''HEURE' end || '.';
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, kind, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'accepted', 'entry', 'ok', v_message, left(p_device, 120))
    returning id into v_scan;
    insert into public.learner_attendance (organization_id, student_id, enrollment_id, class_id, group_id, timetable_slot_id, room_id,
                                           attendance_date, entered_at, expected_start, minutes_late, entry_scan_id)
    values (p_organization_id, v_student.id, v_enr.id, v_enr.class_id, v_enr.group_id, v_slot.id, coalesce(v_slot.room_id, p_room_id),
            v_today, now(), v_slot.starts_at, v_late, v_scan)
    returning * into v_row;
  else
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, kind, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'accepted', 'exit', 'ok', 'Sortie', left(p_device, 120))
    returning id into v_scan;
    update public.learner_attendance set exited_at = now(), exit_scan_id = v_scan where id = v_open.id returning * into v_row;
    v_period := floor(extract(epoch from (v_row.exited_at - v_row.entered_at)) / 60)::integer;
    -- Université : sortie avant la fin du cours = sortie anticipée.
    if v_higher and v_row.timetable_slot_id is not null then
      select greatest(0, floor(extract(epoch from (ts.ends_at - v_time)) / 60))::integer into v_early
      from public.timetable_slots ts where ts.id = v_row.timetable_slot_id and v_time < ts.ends_at;
      v_early := coalesce(v_early, 0);
      if v_early > 0 then
        update public.learner_attendance set left_early_minutes = v_early where id = v_row.id;
      end if;
    end if;
    select coalesce(sum(floor(extract(epoch from (coalesce(exited_at, now()) - entered_at)) / 60)), 0)::integer into v_day
    from public.learner_attendance where student_id = v_student.id and attendance_date = v_today;
    v_message := case when v_early > 0 then 'Sortie anticipée (' || v_early || ' min avant la fin du cours). Présence : '
                      else 'Sortie enregistrée. Présence : ' end || app.format_minutes(v_period)
                 || case when v_day > v_period then ' (aujourd''hui : ' || app.format_minutes(v_day) || ')' else '' end || '.';
    update public.badge_scans set message = v_message where id = v_scan;
    select coalesce(s.name, ts.label, 'Cours') as subject, ts.starts_at, ts.ends_at, r.name as room,
           st.first_name || ' ' || st.last_name as teacher
      into v_slot
    from public.timetable_slots ts
    left join public.class_subjects cs on cs.id = ts.class_subject_id
    left join public.subjects s on s.id = cs.subject_id
    left join public.rooms r on r.id = ts.room_id
    left join public.staff_members st on st.id = ts.teacher_id
    where ts.id = v_row.timetable_slot_id;
  end if;

  perform app.audit(p_organization_id, 'learner_attendance.scan', 'learner_attendance', v_row.id,
                    v_student.first_name || ' ' || v_student.last_name || ' — ' || v_message,
                    jsonb_build_object('kind', v_kind, 'student_id', v_student.id, 'minutes_late', v_late), 'success');

  return jsonb_build_object(
    'result', 'accepted',
    'kind', v_kind,
    'profile', 'learner',
    'message', v_message,
    'at', to_char(v_local, 'HH24:MI'),
    'status', case when v_kind = 'entry' then case when v_late > 0 then 'late' else 'on_time' end end,
    'minutes_late', case when v_kind = 'entry' then v_late end,
    'period_minutes', v_period,
    'day_minutes', v_day,
    'learner', v_person,
    'formation', v_enr.formation_name,
    'session', v_enr.session_name,
    'group', v_enr.group_name,
    'level', v_enr.level_name,
    'year', v_enr.year_name,
    'early_exit_minutes', case when v_kind = 'exit' then v_early end,
    'course', case when v_slot.subject is not null then jsonb_build_object(
      'subject', v_slot.subject, 'room', v_slot.room, 'teacher', v_slot.teacher,
      'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI')) end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_staff_badge_core(p_organization_id uuid, p_code text, p_device text DEFAULT NULL::text, p_at timestamp with time zone DEFAULT now(), p_offline boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_badge public.staff_badges;
  v_staff public.staff_members;
  v_org public.organizations;
  v_local timestamp;
  v_today date;
  v_time time;
  v_cfg jsonb;
  v_open_before interval;
  v_tolerance integer;
  v_dup_window integer;
  v_track_departure boolean;
  v_attendance public.staff_attendance;
  v_first_start time;
  v_late integer := 0;
  v_slot record;
  v_unlock_id uuid;
  v_kind text;
  v_reason text;
  v_message text;
  v_lesson jsonb;
  v_scan_id uuid;
  v_year uuid;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_org from public.organizations where id = p_organization_id;
  v_local := p_at at time zone v_org.timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_cfg := coalesce(v_org.settings -> 'staff_attendance', '{}'::jsonb);
  v_open_before := make_interval(mins => coalesce((v_cfg ->> 'open_before_minutes')::integer, 15));
  v_tolerance := coalesce((v_cfg ->> 'late_tolerance_minutes')::integer, 5);
  v_dup_window := coalesce((v_cfg ->> 'duplicate_window_seconds')::integer, 60);
  v_track_departure := coalesce((v_cfg ->> 'track_departure')::boolean, true);

  v_token := substring(upper(btrim(coalesce(p_code, ''))) from '([A-HJ-NP-Z2-9]{32})$');
  if v_token is not null then
    select * into v_badge from public.staff_badges where token = v_token;
  end if;

  -- Refus : badge inconnu, autre établissement, désactivé, personnel inactif.
  if v_badge.id is null then
    v_reason := 'unknown_badge';
    v_message := 'Badge non reconnu.';
  elsif v_badge.organization_id <> p_organization_id then
    v_reason := 'other_organization';
    v_message := 'Ce badge appartient à un autre établissement.';
    v_badge := null; -- aucune information sur l'autre établissement n'est conservée ici
  elsif v_badge.status <> 'active' then
    v_reason := 'revoked_badge';
    v_message := 'Ce badge a été désactivé. Adressez-vous à l''administration.';
    select * into v_staff from public.staff_members where id = v_badge.staff_id;
  else
    select * into v_staff from public.staff_members where id = v_badge.staff_id;
    if v_staff.status <> 'active' or v_staff.archived_at is not null then
      v_reason := 'inactive_staff';
      v_message := 'Ce membre du personnel n''est pas actif.';
    elsif exists (
      select 1 from public.badge_scans
      where staff_id = v_staff.id and result = 'accepted'
        and scanned_at > p_at - make_interval(secs => v_dup_window)
        and scanned_at <= p_at + make_interval(secs => v_dup_window)
    ) then
      v_reason := 'duplicate';
      v_message := 'Badge déjà scanné à l''instant.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device, scanned_at, captured_offline)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120), p_at, p_offline)
    returning id into v_scan_id;
    perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id, v_message,
                      jsonb_build_object('reason', v_reason, 'staff_id', v_staff.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message,
      'staff', case when v_staff.id is not null then jsonb_build_object(
        'name', v_staff.first_name || ' ' || v_staff.last_name, 'job_title', v_staff.job_title) end);
  end if;

  select id into v_year from public.academic_years where organization_id = p_organization_id and is_current;

  -- Cours de l'enseignant dans la fenêtre horaire (déjà ouvert ou ouvrant dans
  -- « open_before_minutes »), pas encore déverrouillé, affectation vérifiée.
  select ts.id, ts.class_id, ts.class_subject_id, ts.starts_at, ts.ends_at, c.name as class_name,
         coalesce(s.name, ts.label, 'Cours') as subject_name, r.name as room_name
    into v_slot
  from public.timetable_slots ts
  join public.classes c on c.id = ts.class_id and c.archived_at is null
  left join public.class_subjects cs on cs.id = ts.class_subject_id
  left join public.subjects s on s.id = cs.subject_id
  left join public.rooms r on r.id = ts.room_id
  join public.academic_years ay on ay.id = ts.academic_year_id
  where ts.organization_id = p_organization_id
    and ts.teacher_id = v_staff.id
    and ts.academic_year_id = v_year
    and v_today between ay.starts_on and ay.ends_on
    and ts.weekday = extract(isodow from v_today)
    and (ts.class_subject_id is null or cs.teacher_id = v_staff.id)
    and v_time >= ts.starts_at - least(v_open_before, ts.starts_at - time '00:00')
    and v_time < ts.ends_at
    and not exists (select 1 from public.lesson_unlocks lu where lu.timetable_slot_id = ts.id and lu.lesson_date = v_today)
  order by ts.starts_at
  limit 1;

  select * into v_attendance from public.staff_attendance where staff_id = v_staff.id and work_date = v_today;

  if v_attendance.id is null then
    v_kind := 'arrival';
    select min(ts.starts_at) into v_first_start
    from public.timetable_slots ts
    where ts.teacher_id = v_staff.id and ts.academic_year_id = v_year and ts.weekday = extract(isodow from v_today);
    if v_first_start is not null and v_time - v_first_start > make_interval(mins => v_tolerance) then
      v_late := floor(extract(epoch from (v_time - v_first_start)) / 60)::integer;
    end if;
    insert into public.staff_attendance (organization_id, staff_id, work_date, arrived_at, expected_start, minutes_late)
    values (p_organization_id, v_staff.id, v_today, p_at, v_first_start, v_late)
    returning * into v_attendance;
  elsif v_slot.id is not null then
    v_kind := 'lesson';
  elsif v_track_departure then
    v_kind := 'departure';
    update public.staff_attendance set departed_at = greatest(p_at, arrived_at) where id = v_attendance.id returning * into v_attendance;
  else
    v_reason := 'already_checked_in';
    v_message := 'Arrivée déjà enregistrée aujourd''hui et aucun cours à débloquer maintenant.';
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device, scanned_at, captured_offline)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120), p_at, p_offline)
    returning id into v_scan_id;
    perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id, v_message,
                      jsonb_build_object('reason', v_reason, 'staff_id', v_staff.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message,
      'staff', jsonb_build_object('name', v_staff.first_name || ' ' || v_staff.last_name, 'job_title', v_staff.job_title));
  end if;

  if v_slot.id is not null then
    insert into public.lesson_unlocks (organization_id, timetable_slot_id, lesson_date, class_id, class_subject_id,
                                       teacher_id, starts_at, ends_at, method)
    values (p_organization_id, v_slot.id, v_today, v_slot.class_id, v_slot.class_subject_id,
            v_staff.id, v_slot.starts_at, v_slot.ends_at, 'badge')
    returning id into v_unlock_id;
    v_lesson := jsonb_build_object('class', v_slot.class_name, 'subject', v_slot.subject_name, 'room', v_slot.room_name,
                                   'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI'));
  end if;

  v_message := case v_kind
    when 'arrival' then 'Arrivée enregistrée' || case when v_late > 0 then ' (retard de ' || v_late || ' min)' else '' end || '.'
    when 'departure' then 'Départ enregistré.'
    else 'Cours débloqué.'
  end || case when v_slot.id is not null and v_kind <> 'lesson' then ' Cours débloqué.' else '' end
      || case when v_slot.id is null and v_staff.is_teacher and v_kind = 'arrival' then ' Aucun cours à débloquer dans la fenêtre horaire.' else '' end;

  insert into public.badge_scans (organization_id, badge_id, staff_id, result, kind, reason, message, lesson_unlock_id, device, scanned_at, captured_offline)
  values (p_organization_id, v_badge.id, v_staff.id, 'accepted', v_kind, 'ok', v_message, v_unlock_id, left(p_device, 120), p_at, p_offline)
  returning id into v_scan_id;
  perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id,
                    v_staff.first_name || ' ' || v_staff.last_name || ' — ' || v_message,
                    jsonb_build_object('kind', v_kind, 'staff_id', v_staff.id, 'lesson_unlock_id', v_unlock_id), 'success');

  return jsonb_build_object(
    'result', 'accepted',
    'kind', v_kind,
    'message', v_message,
    'staff', jsonb_build_object('name', v_staff.first_name || ' ' || v_staff.last_name, 'first_name', v_staff.first_name, 'job_title', v_staff.job_title,
                                'employee_number', v_staff.employee_number, 'photo_file_id', v_staff.photo_path),
    'at', to_char(v_local, 'HH24:MI'),
    'minutes_late', case when v_kind = 'arrival' then v_late end,
    'lesson', v_lesson,
    'offline', p_offline
  );
end;
$function$;
