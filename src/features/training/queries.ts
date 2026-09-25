import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Formations du centre (programs kind 'training') avec leurs compteurs. */
export async function listFormations(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select(
      "id, name, code, description, duration_hours, duration_label, training_level, admission_conditions, certificate_title, syllabus, tuition_amount, registration_fee, default_installments, is_active, sessions:classes(id, starts_on, ends_on, archived_at)",
    )
    .eq("organization_id", organizationId)
    .eq("kind", "training")
    .order("name");
  return data ?? [];
}

export async function getFormation(organizationId: string, id: string) {
  const supabase = await createClient();
  const [{ data: formation }, { data: competencies }, { data: modules }] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id, name, code, description, duration_hours, duration_label, training_level, admission_conditions, certificate_title, syllabus, tuition_amount, registration_fee, default_installments, is_active, kind",
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("training_competencies").select("id, name, description, sequence, is_active").eq("program_id", id).order("sequence").order("name"),
    supabase.from("subjects").select("id, name, code, is_active").eq("program_id", id).order("name"),
  ]);
  if (!formation || formation.kind !== "training") return null;
  return { formation, competencies: competencies ?? [], modules: modules ?? [] };
}

/** Sessions (classes kind 'training_session'), avec formation, groupes et effectifs. */
export async function listSessions(organizationId: string, filter: { formationId?: string } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("classes")
    .select(
      "id, name, starts_on, ends_on, capacity, archived_at, tuition_amount, program:programs(id, name, tuition_amount), room:rooms(name), head_teacher:staff_members(first_name, last_name), groups:training_groups(id, name, archived_at)",
    )
    .eq("organization_id", organizationId)
    .eq("kind", "training_session")
    .order("starts_on", { ascending: false, nullsFirst: false });
  if (filter.formationId) query = query.eq("program_id", filter.formationId);
  const { data } = await query;
  const sessions = data ?? [];
  const counts = new Map<string, number>();
  if (sessions.length) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id")
      .in("class_id", sessions.map((s) => s.id))
      .in("status", ["pending", "validated"]);
    for (const e of enrollments ?? []) if (e.class_id) counts.set(e.class_id, (counts.get(e.class_id) ?? 0) + 1);
  }
  return sessions.map((s) => ({ ...s, headcount: counts.get(s.id) ?? 0 }));
}

export async function getSession(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("classes")
    .select(
      "id, name, code, kind, academic_year_id, starts_on, ends_on, capacity, syllabus, tuition_amount, archived_at, room_id, head_teacher_id, program:programs(id, name, tuition_amount, registration_fee, default_installments, certificate_title), room:rooms(name), head_teacher:staff_members(first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!session || session.kind !== "training_session") return null;
  const [{ data: groups }, { data: modules }, { data: enrollments }] = await Promise.all([
    supabase.from("training_groups").select("id, name, capacity, archived_at, room:rooms(name)").eq("class_id", id).order("name"),
    supabase
      .from("class_subjects")
      .select("id, weekly_hours, subject:subjects(name), teacher:staff_members(id, first_name, last_name)")
      .eq("class_id", id),
    supabase
      .from("enrollments")
      .select("id, status, group_id, decided_at, student:students(id, matricule, first_name, last_name, status, photo_path, phone)")
      .eq("class_id", id)
      .in("status", ["pending", "validated"]),
  ]);
  const studentIds = (enrollments ?? []).map((e) => e.student?.id).filter((x): x is string => Boolean(x));
  const [{ data: balances }, { data: badges }] = await Promise.all([
    studentIds.length
      ? supabase.from("invoice_balances").select("student_id, total, paid, balance, is_overdue").in("student_id", studentIds)
      : Promise.resolve({ data: [] as { student_id: string | null; total: number | null; paid: number | null; balance: number | null; is_overdue: boolean | null }[] }),
    studentIds.length
      ? supabase.from("student_badges").select("student_id, number").eq("status", "active").in("student_id", studentIds)
      : Promise.resolve({ data: [] as { student_id: string; number: string }[] }),
  ]);
  const finance = new Map<string, { total: number; paid: number; balance: number; overdue: boolean }>();
  for (const b of balances ?? []) {
    if (!b.student_id) continue;
    const f = finance.get(b.student_id) ?? { total: 0, paid: 0, balance: 0, overdue: false };
    f.total += Number(b.total ?? 0);
    f.paid += Number(b.paid ?? 0);
    f.balance += Number(b.balance ?? 0);
    f.overdue ||= Boolean(b.is_overdue);
    finance.set(b.student_id, f);
  }
  const badgeOf = new Map((badges ?? []).map((b) => [b.student_id, b.number]));
  const learners = (enrollments ?? [])
    .filter((e) => e.student)
    .map((e) => ({ ...e, finance: finance.get(e.student!.id) ?? null, badge: badgeOf.get(e.student!.id) ?? null }))
    .sort((a, b) => `${a.student!.last_name} ${a.student!.first_name}`.localeCompare(`${b.student!.last_name} ${b.student!.first_name}`, "fr"));
  return { session, groups: groups ?? [], modules: modules ?? [], learners };
}

/** Sessions ouvertes aux inscriptions (non terminées, formation active). */
export async function openSessions(organizationId: string, today: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select(
      "id, name, starts_on, ends_on, capacity, tuition_amount, program:programs!inner(id, name, is_active, tuition_amount, registration_fee, default_installments), groups:training_groups(id, name, capacity, archived_at)",
    )
    .eq("organization_id", organizationId)
    .eq("kind", "training_session")
    .is("archived_at", null)
    .eq("program.is_active", true)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order("starts_on");
  return data ?? [];
}

export async function trainingDashboard(organizationId: string, date?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("training_dashboard", { p_organization_id: organizationId, p_date: date });
  if (error || !data) return null;
  return data as TrainingDashboard;
}

export async function trainingStatistics(organizationId: string, from?: string, to?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("training_statistics", { p_organization_id: organizationId, p_from: from, p_to: to });
  if (error || !data) return null;
  return data as TrainingStatistics;
}

export async function learnerAttendanceSummary(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learner_attendance_summary", { p_student_id: studentId });
  if (error || !data) return null;
  return data as LearnerAttendance;
}

/** Données « formation » du dossier d'un apprenant : inscriptions, badges, compétences, stages, pièces. */
export async function learnerTraining(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const [{ data: enrollments }, { data: badges }, { data: competencies }, { data: internships }, { data: files }] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        "id, reference, status, decided_at, created_at, group:training_groups(name), class:classes!inner(id, name, kind, starts_on, ends_on, program:programs(id, name, certificate_title, duration_hours))",
      )
      .eq("student_id", studentId)
      .eq("class.kind", "training_session")
      .order("created_at", { ascending: false }),
    supabase
      .from("student_badges")
      .select("id, number, status, issued_at, revoked_at, revoked_reason, printed_count, last_printed_at")
      .eq("student_id", studentId)
      .order("issued_at", { ascending: false }),
    supabase.from("learner_competencies").select("id, enrollment_id, competency_id, level, comment, evaluated_on").eq("student_id", studentId),
    supabase
      .from("internships")
      .select(
        "id, enrollment_id, company_name, company_address, company_phone, company_email, tutor_name, tutor_title, tutor_phone, tutor_email, missions, starts_on, ends_on, status, evaluation_score, evaluation_comment, evaluated_at",
      )
      .eq("student_id", studentId)
      .order("starts_on", { ascending: false }),
    supabase
      .from("file_objects")
      .select("id, file_name, category, mime_type, size_bytes, created_at")
      .eq("organization_id", organizationId)
      .eq("owner_type", "student")
      .eq("owner_id", studentId)
      .order("created_at", { ascending: false }),
  ]);
  const programIds = [...new Set((enrollments ?? []).map((e) => e.class?.program?.id).filter((x): x is string => Boolean(x)))];
  const { data: catalog } = programIds.length
    ? await supabase.from("training_competencies").select("id, program_id, name, sequence, is_active").in("program_id", programIds).order("sequence")
    : { data: [] };
  return {
    enrollments: enrollments ?? [],
    badges: badges ?? [],
    competencies: competencies ?? [],
    catalog: catalog ?? [],
    internships: internships ?? [],
    files: files ?? [],
  };
}

/** Instant de référence pour les durées « encore sur place ». */
export async function referenceNow(): Promise<number> {
  return Date.now();
}

/** Journal des entrées / sorties d'une journée. */
export async function learnerAttendanceJournal(organizationId: string, date: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("learner_attendance")
    .select(
      "id, entered_at, exited_at, auto_closed, minutes_late, student:students(id, matricule, first_name, last_name), session:classes(name), group:training_groups(name), slot:timetable_slots(starts_at, ends_at, class_subject:class_subjects(subject:subjects(name))), room:rooms(name)",
    )
    .eq("organization_id", organizationId)
    .eq("attendance_date", date)
    .order("entered_at", { ascending: false });
  return data ?? [];
}

export async function learnerScanRejections(organizationId: string, date: string, timezone: string) {
  const supabase = await createClient();
  // Journée locale de l'établissement : bornes calculées côté serveur.
  const start = zonedMidnight(date, timezone);
  const end = new Date(start.getTime() + 86_400_000);
  const { data } = await supabase
    .from("badge_scans")
    .select("id, scanned_at, reason, message, student:students(first_name, last_name, matricule)")
    .eq("organization_id", organizationId)
    .eq("result", "rejected")
    .not("student_id", "is", null)
    .gte("scanned_at", start.toISOString())
    .lt("scanned_at", end.toISOString())
    .order("scanned_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Minuit local (fuseau de l'établissement) d'une date ISO, en instant UTC. */
function zonedMidnight(date: string, timeZone: string): Date {
  const utc = new Date(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(utc.getTime() - (asLocal - utc.getTime()));
}

/** Apprenants des sessions et leur badge actif (page Badges). */
export async function learnerBadges(organizationId: string, filter: { sessionId?: string; query?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("enrollments")
    .select("id, class_id, student:students!inner(id, matricule, first_name, last_name, status, photo_path), class:classes!inner(id, name, kind)")
    .eq("organization_id", organizationId)
    .eq("status", "validated")
    .eq("class.kind", "training_session");
  if (filter.sessionId) query = query.eq("class_id", filter.sessionId);
  const { data: enrollments } = await query;
  const rows = (enrollments ?? []).filter((e) => e.student);
  const ids = [...new Set(rows.map((e) => e.student!.id))];
  const { data: badges } = ids.length
    ? await supabase.from("student_badges").select("student_id, number, status, issued_at, printed_count").in("student_id", ids).order("issued_at", { ascending: false })
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
      return { student: e.student!, session: e.class!.name, active: history.find((b) => b.status === "active") ?? null, replaced: history.filter((b) => b.status === "revoked").length };
    })
    .sort((a, b) => `${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`, "fr"));
}

export type TrainingDashboard = {
  date: string;
  learners: { expected: number; present: number; absent: number; late: number; exits: number; on_site: number };
  trainers: {
    expected: number;
    present: number;
    absent: number;
    late: number;
    list: { name: string; first_start: string; arrived_at: string | null; minutes_late: number | null }[];
  };
  by_formation: { name: string; expected: number; present: number; late: number }[];
  by_session: { name: string; expected: number; present: number; late: number }[];
  recent: { name: string; matricule: string; entered_at: string; exited_at: string | null; minutes_late: number }[];
};

export type TrainingStatistics = {
  from: string;
  to: string;
  learners: number;
  active_learners: number;
  formations: number;
  sessions: { planned: number; ongoing: number; finished: number };
  groups: number;
  trainers: number;
  attendance_rate: number | null;
  absences: number;
  lates: number;
  completed: number;
  certificates: number;
  attestations: number;
  badges_active: number;
  internships: { ongoing: number; completed: number };
  finance: { invoiced: number; collected: number; remaining: number; learners_with_balance: number; collected_period: number } | null;
  by_formation: { name: string; learners: number; sessions: number; rate: number | null }[];
};

export type LearnerAttendance = {
  from: string;
  to: string;
  expected: number;
  attended: number;
  absences: number;
  lates: number;
  late_minutes: number;
  days_present: number;
  total_minutes: number;
  rate: number | null;
  courses: { subject: string; expected: number; attended: number; lates: number }[];
  absences_list: { date: string; subject: string; starts_at: string; ends_at: string }[];
  history: {
    date: string;
    entered_at: string;
    exited_at: string | null;
    minutes: number;
    minutes_late: number;
    auto_closed: boolean;
    course: string | null;
    room: string | null;
  }[];
};
