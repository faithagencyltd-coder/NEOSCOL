import "server-only";

import { parseFields } from "@/features/forms/fields";
import { createClient } from "@/lib/supabase/server";
import { likePattern, normalizeSearch } from "@/lib/utils/search-params";

export const STUDENTS_PAGE_SIZE = 20;

export type StudentListFilters = {
  q?: string;
  classId?: string;
  status?: string;
  /** Onglet : restreint aux statuts listés (ex. anciens élèves). */
  statuses?: string[];
  sex?: string;
  archived?: boolean;
  page: number;
};

export async function listStudents(organizationId: string, yearId: string | null, filters: StudentListFilters) {
  const supabase = await createClient();
  const enrollmentJoin = filters.classId ? "enrollments!inner" : "enrollments";
  let query = supabase
    .from("students")
    .select(
      `id, matricule, legacy_matricule, first_name, last_name, sex, birth_date, status, archived_at, entry_year, exit_year, origin,
       ${enrollmentJoin}(status, academic_year_id, class_id, class:classes(id, name)),
       student_guardians(is_primary, guardian:guardians(first_name, last_name, phone))`,
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.q) {
    // Recherche aussi sur l'ancien matricule (données historiques importées).
    // Valeurs entre guillemets : « . , : ( ) » sont réservés dans les filtres PostgREST combinés.
    const legacy = filters.q.trim().replace(/["\\,()%*]/g, "");
    const pattern = likePattern(normalizeSearch(filters.q)).replace(/"/g, "");
    query = legacy
      ? query.or(`search_text.ilike."${pattern}",legacy_matricule.ilike."%${legacy}%"`)
      : query.ilike("search_text", likePattern(normalizeSearch(filters.q)));
  }
  if (filters.statuses?.length) query = query.in("status", filters.statuses);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.sex === "M" || filters.sex === "F") query = query.eq("sex", filters.sex);
  if (filters.classId) query = query.eq("enrollments.class_id", filters.classId).eq("enrollments.status", "validated");

  const from = (filters.page - 1) * STUDENTS_PAGE_SIZE;
  const { data, count, error } = await query
    .order("last_name")
    .order("first_name")
    .range(from, from + STUDENTS_PAGE_SIZE - 1);
  if (error) throw new Error("Impossible de charger la liste des élèves.");

  const rows = (data ?? []).map((student) => {
    const current =
      student.enrollments.find((e) => e.status === "validated" && e.academic_year_id === yearId) ??
      student.enrollments.find((e) => e.status === "validated");
    const primary = student.student_guardians.find((sg) => sg.is_primary) ?? student.student_guardians[0];
    return {
      id: student.id,
      matricule: student.matricule,
      legacyMatricule: student.legacy_matricule,
      entryYear: student.entry_year,
      exitYear: student.exit_year,
      origin: student.origin,
      firstName: student.first_name,
      lastName: student.last_name,
      sex: student.sex,
      birthDate: student.birth_date,
      status: student.status,
      archived: student.archived_at !== null,
      className: current?.class?.name ?? null,
      guardian: primary?.guardian
        ? { name: `${primary.guardian.first_name} ${primary.guardian.last_name}`, phone: primary.guardian.phone }
        : null,
    };
  });
  return { rows, total: count ?? 0 };
}

export async function getStudent(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select(
      `*, enrollments(id, reference, type, status, created_at, decided_at, academic_year:academic_years(id, name, is_current), class:classes(id, name)),
       student_guardians(id, relationship, is_primary, is_financial_responsible, is_emergency_contact, portal_access,
         guardian:guardians(id, first_name, last_name, phone, email, profession, user_id))`,
    )
    .eq("organization_id", organizationId)
    .eq("id", studentId)
    .maybeSingle();
  return data;
}

export async function getStudentMedical(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("student_medical_records").select("*").eq("student_id", studentId).maybeSingle();
  return data;
}

export async function getStudentFormFields(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_definitions")
    .select("id, fields")
    .eq("organization_id", organizationId)
    .eq("kind", "student")
    .eq("is_active", true)
    .maybeSingle();
  return data ? parseFields(data.fields) : [];
}

export type SubjectAverage = { subject: string; period: string; average: number; count: number };

/** Moyennes pondérées par matière et période (notes visibles selon la RLS). */
export async function getStudentGrades(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grades")
    .select(
      "id, score, is_absent, is_exempt, comment, assessment:assessments(id, title, kind, assessed_on, coefficient, max_score, is_published, subject:subjects(name), period:academic_periods(id, name, sequence))",
    )
    .eq("student_id", studentId);

  const grades = (data ?? []).filter((g) => g.assessment);
  const buckets = new Map<string, { subject: string; period: string; sequence: number; sum: number; weight: number; count: number }>();
  for (const grade of grades) {
    const a = grade.assessment!;
    if (grade.score === null || grade.is_absent || grade.is_exempt) continue;
    const key = `${a.period?.id}:${a.subject?.name}`;
    const bucket = buckets.get(key) ?? {
      subject: a.subject?.name ?? "—",
      period: a.period?.name ?? "—",
      sequence: a.period?.sequence ?? 0,
      sum: 0,
      weight: 0,
      count: 0,
    };
    bucket.sum += (grade.score / a.max_score) * 20 * a.coefficient;
    bucket.weight += a.coefficient;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const averages = [...buckets.values()]
    .sort((x, y) => x.sequence - y.sequence || x.subject.localeCompare(y.subject, "fr"))
    .map((b) => ({ subject: b.subject, period: b.period, average: b.sum / b.weight, count: b.count }));

  const detail = grades
    .map((g) => ({
      id: g.id,
      subject: g.assessment!.subject?.name ?? "—",
      title: g.assessment!.title,
      date: g.assessment!.assessed_on,
      score: g.score,
      maxScore: g.assessment!.max_score,
      coefficient: g.assessment!.coefficient,
      status: g.is_absent ? "Absent" : g.is_exempt ? "Dispensé" : null,
      published: g.assessment!.is_published,
    }))
    .sort((x, y) => (x.date < y.date ? 1 : -1));
  return { averages, detail };
}

export async function getStudentAttendance(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_records")
    .select("id, status, minutes_late, is_justified, justification, session:attendance_sessions(session_date, starts_at, ends_at, class:classes(name))")
    .eq("student_id", studentId);
  const rows = (data ?? [])
    .filter((r) => r.session)
    .sort((a, b) => (a.session!.session_date < b.session!.session_date ? 1 : -1));
  const totals = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const row of rows) totals[row.status] += 1;
  return { rows, totals };
}

export async function getStudentFinance(studentId: string) {
  const supabase = await createClient();
  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoice_balances")
      .select("invoice_id, number, status, issued_on, total, paid, balance, payment_status, next_due_on, is_overdue, currency")
      .eq("student_id", studentId)
      .order("issued_on", { ascending: false }),
    supabase
      .from("payments")
      .select("id, number, amount, method, paid_at, status, balance_after")
      .eq("student_id", studentId)
      .order("paid_at", { ascending: false }),
  ]);
  return { invoices: invoices ?? [], payments: payments ?? [] };
}

export async function getStudentHistory(organizationId: string, entityIds: string[]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, actor_email, changes, created_at")
    .eq("organization_id", organizationId)
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Sanctions et récompenses (RLS : conduct.read). */
export async function getStudentConduct(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conduct_records")
    .select("id, kind, title, description, occurred_on, created_at, author:profiles!conduct_records_recorded_by_fkey(first_name, last_name)")
    .eq("student_id", studentId)
    .order("occurred_on", { ascending: false });
  return data ?? [];
}

export async function getStudentPreviousSchools(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_previous_schools")
    .select("id, school_name, city, country, from_year, to_year, last_level, notes")
    .eq("student_id", studentId)
    .order("to_year", { ascending: false, nullsFirst: false });
  return data ?? [];
}

/** Bulletins de l'élève, toutes années (RLS des bulletins). */
export async function getStudentReportCards(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_cards")
    .select("id, status, average, rank, class_size, published_at, period:academic_periods(name, sequence, academic_year:academic_years(name, starts_on)), class:classes(name)")
    .eq("student_id", studentId);
  return (data ?? []).sort(
    (a, b) =>
      (b.period?.academic_year?.starts_on ?? "").localeCompare(a.period?.academic_year?.starts_on ?? "") || (a.period?.sequence ?? 0) - (b.period?.sequence ?? 0),
  );
}
