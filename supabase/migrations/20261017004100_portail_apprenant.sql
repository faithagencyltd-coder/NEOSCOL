-- =============================================================================
-- Portail apprenant : fiche de l'établissement, classe OU formation, et
-- historique scolaire complet (toutes les années), pour les trois modules.
--
-- Une seule fonction, bornée à app.my_portal_student_ids() : l'élève (ou son
-- parent) ne voit que SON dossier. Seuls les éléments officiels sont renvoyés :
-- inscriptions de toutes les années, résultats annuels VALIDÉS, nombre de
-- bulletins PUBLIÉS, et historique importé des anciennes années. Les notes et
-- bulletins détaillés restent sur leurs pages (et soumis aux restrictions).
-- =============================================================================

create or replace function public.portal_school_record(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  if not (p_student_id = any (app.my_portal_student_ids())) then
    raise exception 'Dossier introuvable.' using errcode = 'no_data_found';
  end if;
  select * into v_student from public.students where id = p_student_id;

  return jsonb_build_object(
    'organization', (
      select jsonb_build_object(
        'name', o.name, 'short_name', o.short_name, 'type', o.type, 'address', o.address, 'city', o.city,
        'country', o.country, 'phone', o.phone, 'email', o.email, 'website', o.website,
        'current_year', (select y.name from public.academic_years y where y.organization_id = o.id and y.is_current limit 1))
      from public.organizations o where o.id = v_student.organization_id),
    'student', jsonb_build_object(
      'first_name', v_student.first_name, 'last_name', v_student.last_name, 'other_names', v_student.other_names,
      'matricule', v_student.matricule, 'sex', v_student.sex, 'birth_date', v_student.birth_date,
      'birth_place', v_student.birth_place, 'nationality', v_student.nationality, 'email', v_student.email,
      'phone', v_student.phone, 'status', v_student.status, 'entry_year', v_student.entry_year,
      'first_enrolled_on', (select min(coalesce(e.decided_at, e.submitted_at, e.created_at))::date from public.enrollments e
                             where e.student_id = v_student.id and e.status = 'validated')),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academic_year', y.name, 'starts_on', y.starts_on, 'is_current', y.is_current,
        'enrollment_type', e.type, 'enrollment_status', e.status, 'decided_at', e.decided_at,
        'class', c.name, 'level', l.name, 'program', p.name, 'track', t.name, 'group', g.name,
        'result', (select jsonb_build_object('average', ar.average, 'rank', ar.rank, 'mention', ar.mention,
                                             'decision', coalesce(ar.decision_label, ar.proposed_label))
                     from public.annual_results ar
                    where ar.student_id = v_student.id and ar.academic_year_id = e.academic_year_id and ar.status = 'validated'
                    limit 1),
        'report_cards', (select count(*) from public.report_cards rc
                           join public.academic_periods ap on ap.id = rc.academic_period_id
                          where rc.student_id = v_student.id and rc.status = 'published' and ap.academic_year_id = e.academic_year_id)
      ) order by y.starts_on desc, e.created_at desc)
      from public.enrollments e
      join public.academic_years y on y.id = e.academic_year_id
      left join public.classes c on c.id = e.class_id
      left join public.levels l on l.id = coalesce(e.level_id, c.level_id)
      left join public.programs p on p.id = coalesce(e.program_id, c.program_id)
      left join public.program_tracks t on t.id = coalesce(e.track_id, c.track_id)
      left join public.training_groups g on g.id = e.group_id
      where e.student_id = v_student.id and e.status in ('validated', 'pending')
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year_label', h.year_label, 'class', h.class_name, 'level', h.level_name, 'program', h.program_name,
        'average', h.average, 'rank', h.rank, 'decision', h.decision,
        'absences', h.absences, 'absences_justified', h.absences_justified
      ) order by h.year_label desc)
      from public.student_history h
      where h.student_id = v_student.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.portal_school_record(uuid) from public, anon;
grant execute on function public.portal_school_record(uuid) to authenticated;

comment on function public.portal_school_record(uuid) is
  'Portail : établissement, classe/formation et historique scolaire de l''élève (ou de l''enfant) connecté, toutes années.';
