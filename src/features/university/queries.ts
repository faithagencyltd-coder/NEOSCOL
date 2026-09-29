import "server-only";

import { createClient } from "@/lib/supabase/server";

const person = (p: { first_name: string; last_name: string } | null | undefined) => (p ? `${p.first_name} ${p.last_name}` : null);
export { person };

/** Référentiel de structure : facultés, départements, filières, parcours, cycles, niveaux. */
export async function universityStructure(organizationId: string) {
  const supabase = await createClient();
  const [faculties, departments, programs, tracks, cycles, levels] = await Promise.all([
    supabase.from("faculties").select("id, name, code, kind, description, is_active, dean:staff_members(id, first_name, last_name)").eq("organization_id", organizationId).order("name"),
    supabase
      .from("departments")
      .select("id, name, code, description, is_active, faculty_id, faculty:faculties(name, code), head:staff_members!departments_organization_id_head_id_fkey(id, first_name, last_name)")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("programs")
      .select(
        "id, name, code, kind, description, degree_title, duration_years, admission_conditions, syllabus, is_active, faculty_id, department_id, academic_cycle_id, responsible_id, faculty:faculties(name, code), department:departments(name, code), responsible:staff_members(first_name, last_name), cycle:academic_cycles(name)",
      )
      .eq("organization_id", organizationId)
      .neq("kind", "training")
      .order("name"),
    supabase
      .from("program_tracks")
      .select("id, name, code, kind, description, is_active, program_id, program:programs(name, code), starts_at:levels(name, short_name)")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase.from("academic_cycles").select("id, name, code, credits_required, duration_years, sequence, is_active").eq("organization_id", organizationId).order("sequence"),
    supabase.from("levels").select("id, name, short_name, cycle, sequence, credits_target, academic_cycle_id").eq("organization_id", organizationId).order("sequence"),
  ]);
  return {
    faculties: faculties.data ?? [],
    departments: departments.data ?? [],
    programs: programs.data ?? [],
    tracks: tracks.data ?? [],
    cycles: cycles.data ?? [],
    levels: levels.data ?? [],
  };
}

export async function programDetail(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data: program } = await supabase
    .from("programs")
    .select(
      "id, name, code, kind, description, degree_title, duration_years, admission_conditions, syllabus, is_active, faculty_id, department_id, academic_cycle_id, responsible_id, faculty:faculties(name), department:departments(name), responsible:staff_members(first_name, last_name), cycle:academic_cycles(name, credits_required)",
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!program || program.kind === "training") return null;
  const [tracks, units, classes] = await Promise.all([
    supabase.from("program_tracks").select("id, name, code, kind, is_active, starts_at:levels(short_name)").eq("program_id", id).order("name"),
    supabase
      .from("teaching_units")
      .select("id, code, name, credits, coefficient, semester_no, is_optional, is_active, category, level_id, track_id, level:levels(name, short_name, sequence), track:program_tracks(name), subjects(id, code, name, credits, coefficient, hours_cm, hours_td, hours_tp)")
      .eq("program_id", id)
      .order("semester_no")
      .order("code"),
    supabase.from("classes").select("id, name, capacity, academic_year:academic_years(name, is_current), level:levels(name), track:program_tracks(name)").eq("program_id", id).is("archived_at", null).order("name"),
  ]);
  return { program, tracks: tracks.data ?? [], units: units.data ?? [], classes: classes.data ?? [] };
}

/** Années académiques, semestres et sessions d'examen. */
export async function academicCalendar(organizationId: string) {
  const supabase = await createClient();
  const [years, periods, sessions] = await Promise.all([
    supabase.from("academic_years").select("id, name, starts_on, ends_on, is_current, status, registration_starts_on, registration_ends_on").eq("organization_id", organizationId).order("starts_on", { ascending: false }),
    supabase.from("academic_periods").select("id, academic_year_id, name, type, sequence, starts_on, ends_on, is_locked").eq("organization_id", organizationId).order("sequence"),
    supabase.from("exam_sessions").select("id, academic_year_id, academic_period_id, name, kind, starts_on, ends_on, status, period:academic_periods(name)").eq("organization_id", organizationId).order("starts_on"),
  ]);
  return { years: years.data ?? [], periods: periods.data ?? [], sessions: sessions.data ?? [] };
}

export async function teachingUnits(organizationId: string, filter: { programId?: string; levelId?: string; semester?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("teaching_units")
    .select(
      "id, code, name, description, credits, coefficient, semester_no, category, is_optional, is_active, program_id, level_id, track_id, responsible_id, program:programs(name, code), level:levels(name, short_name), track:program_tracks(name), responsible:staff_members(first_name, last_name), subjects(id, code, name, credits, coefficient, hours_cm, hours_td, hours_tp, teaching_types, is_active)",
    )
    .eq("organization_id", organizationId);
  if (filter.programId) query = query.eq("program_id", filter.programId);
  if (filter.levelId) query = query.eq("level_id", filter.levelId);
  if (filter.semester) query = query.eq("semester_no", filter.semester);
  const { data } = await query.order("semester_no").order("code");
  return data ?? [];
}

export async function universityTeachers(organizationId: string) {
  const supabase = await createClient();
  const [{ data: staff }, { data: assignments }] = await Promise.all([
    supabase
      .from("staff_members")
      .select("id, employee_number, first_name, last_name, email, phone, job_title, academic_rank, specialties, status, photo_path, user_id, department:departments!staff_members_organization_id_department_id_fkey(id, name)")
      .eq("organization_id", organizationId)
      .eq("is_teacher", true)
      .is("archived_at", null)
      .order("last_name"),
    supabase
      .from("class_subjects")
      .select("teacher_id, class:classes!inner(name, archived_at), subject:subjects(name, code)")
      .eq("organization_id", organizationId)
      .not("teacher_id", "is", null),
  ]);
  return (staff ?? []).map((s) => ({
    ...s,
    courses: (assignments ?? []).filter((a) => a.teacher_id === s.id && !a.class?.archived_at).map((a) => `${a.subject?.name ?? "—"} (${a.class?.name ?? ""})`),
  }));
}

export async function universityRooms(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, number, building, capacity, room_type, equipment, is_available")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
}

/** Promotions (classes) de l'année, avec filière, niveau, parcours. */
export async function promotions(organizationId: string, yearId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("classes")
    .select("id, name, code, capacity, academic_year_id, program_id, level_id, track_id, program:programs(name, code), level:levels(name, short_name), track:program_tracks(name), academic_year:academic_years(name, is_current)")
    .eq("organization_id", organizationId)
    .eq("kind", "class")
    .is("archived_at", null);
  if (yearId) query = query.eq("academic_year_id", yearId);
  const { data } = await query.order("name");
  return data ?? [];
}

/** Résultats d'une promotion pour un semestre (UE + semestre). */
export async function promotionResults(classId: string, periodId: string) {
  const supabase = await createClient();
  const [{ data: semester }, { data: ues }, { data: units }] = await Promise.all([
    supabase
      .from("semester_results")
      .select("id, enrollment_id, student_id, average, credits_total, credits_earned, validated, compensated, retake_needed, has_retake, rank, population, absences, decision, published_at, computed_at, student:students(id, matricule, first_name, last_name)")
      .eq("class_id", classId)
      .eq("academic_period_id", periodId),
    supabase
      .from("ue_results")
      .select("enrollment_id, teaching_unit_id, session1_average, retake_average, average, credits, credits_earned, status, subjects")
      .eq("class_id", classId)
      .eq("academic_period_id", periodId),
    supabase.from("teaching_units").select("id, code, name, credits"),
  ]);
  const unitIds = new Set((ues ?? []).map((u) => u.teaching_unit_id));
  return {
    semester: (semester ?? []).sort((a, b) => `${a.student?.last_name}`.localeCompare(`${b.student?.last_name}`, "fr")),
    ues: ues ?? [],
    units: (units ?? []).filter((u) => unitIds.has(u.id)).sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export async function deliberationsList(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deliberations")
    .select("id, title, session, status, held_on, closed_at, class:classes(id, name), period:academic_periods(name), decisions:deliberation_decisions(count)")
    .eq("organization_id", organizationId)
    .eq("decisions.is_current", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deliberationDetail(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data: deliberation } = await supabase
    .from("deliberations")
    .select("id, title, session, status, held_on, president, members, notes, closed_at, class_id, academic_period_id, class:classes(id, name, program:programs(name), level:levels(name)), period:academic_periods(name)")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!deliberation) return null;
  const { data: decisions } = await supabase
    .from("deliberation_decisions")
    .select("id, student_id, average, credits_earned, credits_total, absences, proposed_decision, decision, validate_credits, comment, version, is_current, decided_at, student:students(matricule, first_name, last_name), decider:profiles(first_name, last_name)")
    .eq("deliberation_id", id)
    .order("version", { ascending: false });
  const current = (decisions ?? []).filter((d) => d.is_current).sort((a, b) => `${a.student?.last_name}`.localeCompare(`${b.student?.last_name}`, "fr"));
  const history = (decisions ?? []).filter((d) => !d.is_current);
  return { deliberation, current, history };
}

export async function internshipsList(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("internships")
    .select("id, student_id, company_name, host_kind, tutor_name, tutor_title, supervisor_name, missions, starts_on, ends_on, status, convention_signed, evaluation_score, evaluation_comment, student:students(matricule, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("starts_on", { ascending: false });
  return data ?? [];
}

export async function thesesList(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("theses")
    .select("id, student_id, kind, title, summary, status, grade, mention, director_id, director_name, co_director_name, jury, file_id, student:students(matricule, first_name, last_name), director:staff_members(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function defensesList(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("defenses")
    .select("id, student_id, thesis_id, title, scheduled_at, status, grade, mention, decision, jury, minutes, room:rooms(name), student:students(matricule, first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("scheduled_at", { ascending: true });
  return data ?? [];
}

export async function diplomasList(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_diplomas")
    .select("id, student_id, kind, title, number, year_label, mention, issued_on, conferred_on, status, revoked_reason, source, program:programs(name), level:levels(name), student:students(matricule, first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("source", "app")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Étudiants actifs (sélecteurs). */
export async function studentOptions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, matricule, first_name, last_name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("last_name")
    .limit(2000);
  return (data ?? []).map((s) => ({ value: s.id, label: `${s.last_name} ${s.first_name} — ${s.matricule}` }));
}

export async function teacherOptions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, academic_rank")
    .eq("organization_id", organizationId)
    .eq("is_teacher", true)
    .eq("status", "active")
    .is("archived_at", null)
    .order("last_name");
  return (data ?? []).map((t) => ({ value: t.id, label: `${t.last_name} ${t.first_name}${t.academic_rank ? ` (${t.academic_rank})` : ""}` }));
}

export async function universityStatistics(organizationId: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("university_statistics", { p_organization_id: organizationId, p_from: from, p_to: to });
  if (error || !data) return null;
  return data as UniversityStatistics;
}

/** Dossier académique permanent : inscriptions de toutes les années, résultats, crédits, parcours. */
export async function studentAcademicRecord(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const [enrollments, semesters, ues, registrations, theses, defenses, internships, diplomas, badges] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, reference, status, type, decided_at, created_at, program_id, level_id, track_id, academic_year:academic_years(id, name, starts_on, is_current), class:classes(id, name), program:programs(name, degree_title), level:levels!enrollments_organization_id_level_id_fkey(name, short_name, credits_target, cycle:academic_cycles(id, name, credits_required)), track:program_tracks!enrollments_organization_id_track_id_fkey(name)")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("semester_results")
      .select("id, enrollment_id, academic_period_id, average, credits_total, credits_earned, validated, compensated, rank, population, decision, published_at, period:academic_periods(name, sequence, academic_year:academic_years(name))")
      .eq("student_id", studentId),
    supabase.from("ue_results").select("enrollment_id, academic_period_id, teaching_unit_id, session1_average, retake_average, average, credits, credits_earned, status, subjects, unit:teaching_units(code, name)").eq("student_id", studentId),
    supabase
      .from("course_registrations")
      .select("id, enrollment_id, academic_period_id, status, unit:teaching_units(id, code, name, credits, semester_no), period:academic_periods(name)")
      .eq("student_id", studentId),
    supabase.from("theses").select("id, kind, title, status, grade, mention, director_name, co_director_name").eq("student_id", studentId),
    supabase.from("defenses").select("id, title, scheduled_at, status, grade, mention, decision, room:rooms(name)").eq("student_id", studentId),
    supabase.from("internships").select("id, company_name, host_kind, tutor_name, supervisor_name, starts_on, ends_on, status, evaluation_score").eq("student_id", studentId).order("starts_on", { ascending: false }),
    supabase.from("student_diplomas").select("id, kind, title, number, year_label, mention, issued_on, conferred_on, status, source").eq("student_id", studentId).order("created_at", { ascending: false }),
    supabase.from("student_badges").select("id, number, status, issued_at, printed_count, last_printed_at, revoked_at, revoked_reason").eq("student_id", studentId).order("issued_at", { ascending: false }),
  ]);
  return {
    enrollments: enrollments.data ?? [],
    semesters: semesters.data ?? [],
    ues: ues.data ?? [],
    registrations: registrations.data ?? [],
    theses: theses.data ?? [],
    defenses: defenses.data ?? [],
    internships: internships.data ?? [],
    diplomas: diplomas.data ?? [],
    badges: badges.data ?? [],
  };
}
export type AcademicRecord = Awaited<ReturnType<typeof studentAcademicRecord>>;

/** Enseignements de l'enseignant connecté (portail enseignant). */
export async function myTeaching(organizationId: string, userId: string) {
  const supabase = await createClient();
  const { data: me } = await supabase.from("staff_members").select("id, first_name, last_name, academic_rank").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
  if (!me) return null;
  const { data: courses } = await supabase
    .from("class_subjects")
    .select("id, weekly_hours, class:classes!inner(id, name, archived_at, academic_year:academic_years(is_current), level:levels(name), program:programs(name)), subject:subjects(name, code, teaching_types, unit:teaching_units(code, name, semester_no))")
    .eq("teacher_id", me.id);
  const active = (courses ?? []).filter((c) => !c.class?.archived_at && c.class?.academic_year?.is_current);
  const classIds = [...new Set(active.map((c) => c.class!.id))];
  const [{ data: counts }, { data: slots }] = await Promise.all([
    classIds.length ? supabase.from("enrollments").select("class_id").in("class_id", classIds).eq("status", "validated") : Promise.resolve({ data: [] as { class_id: string | null }[] }),
    supabase.from("timetable_slots").select("id, weekday, starts_at, ends_at, session_type, class_subject_id, room:rooms(name), group:training_groups(name)").eq("teacher_id", me.id).order("weekday").order("starts_at"),
  ]);
  return {
    me,
    courses: active.map((c) => ({ ...c, students: (counts ?? []).filter((x) => x.class_id === c.class!.id).length })),
    slots: slots ?? [],
  };
}

export type UniversityStatistics = {
  from: string;
  to: string;
  year: string | null;
  students_enrolled: number;
  students_active: number;
  teachers: number;
  faculties: number;
  departments: number;
  programs: number;
  tracks: number;
  teaching_units: number;
  courses: number;
  attendance_rate: number | null;
  presences: number;
  absences: number;
  lates: number;
  results: { computed: number; validated: number; published: number; success_rate: number | null };
  credits: { earned: number; total: number };
  internships: { ongoing: number; total: number };
  theses: { in_progress: number; defended: number };
  defenses: { upcoming: number; held: number };
  diplomas: number;
  finance: { invoiced: number; collected: number; remaining: number; students_with_balance: number } | null;
  by_program: { name: string; students: number; success_rate: number | null }[];
};

/** Affectations matière → promotion → enseignant (année en cours). */
export async function courseAssignments(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, class_id, subject_id, teacher_id, weekly_hours, class:classes!inner(name, archived_at, academic_year:academic_years(is_current)), teacher:staff_members(first_name, last_name)")
    .eq("organization_id", organizationId);
  return (data ?? []).filter((a) => !a.class?.archived_at && a.class?.academic_year?.is_current);
}

/** Étudiants inscrits (année en cours) et état de leur badge (actif, anciens badges désactivés). */
export async function studentBadges(organizationId: string, filter: { classId?: string; query?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("enrollments")
    .select("id, class_id, student:students!inner(id, matricule, first_name, last_name, status, photo_path), class:classes!inner(id, name, kind, program:programs(name), level:levels(name), academic_year:academic_years!inner(is_current))")
    .eq("organization_id", organizationId)
    .eq("status", "validated")
    .eq("class.kind", "class")
    .eq("class.academic_year.is_current", true);
  if (filter.classId) query = query.eq("class_id", filter.classId);
  const { data: enrollments } = await query;
  const rows = (enrollments ?? []).filter((e) => e.student && e.class);
  const ids = [...new Set(rows.map((e) => e.student!.id))];
  const { data: badges } = ids.length
    ? await supabase.from("student_badges").select("student_id, number, status, issued_at, printed_count, revoked_reason").in("student_id", ids).order("issued_at", { ascending: false })
    : { data: [] };
  const needle = filter.query?.trim().toLowerCase();
  const seen = new Set<string>();
  return rows
    .filter((e) => {
      if (seen.has(e.student!.id)) return false;
      seen.add(e.student!.id);
      return !needle || `${e.student!.first_name} ${e.student!.last_name} ${e.student!.matricule}`.toLowerCase().includes(needle);
    })
    .map((e) => {
      const history = (badges ?? []).filter((b) => b.student_id === e.student!.id);
      return {
        student: e.student!,
        promotion: e.class!.name,
        program: e.class!.program?.name ?? null,
        level: e.class!.level?.name ?? null,
        active: history.find((b) => b.status === "active") ?? null,
        replaced: history.filter((b) => b.status !== "active").length,
      };
    })
    .sort((a, b) => `${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`, "fr"));
}
