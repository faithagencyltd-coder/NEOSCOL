import "server-only";

import { getClasses } from "@/features/academic/queries";
import { getMyStaffMember } from "@/features/timetable/queries";
import { createClient } from "@/lib/supabase/server";

/** Classes pour lesquelles l'utilisateur peut faire l'appel. */
export async function getRollCallClasses(organizationId: string, yearId: string, userId: string, all: boolean) {
  const classes = await getClasses(organizationId, yearId);
  if (all) return classes;
  const me = await getMyStaffMember(organizationId, userId);
  if (!me) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("class_subjects").select("class_id").eq("teacher_id", me.id);
  const taught = new Set((data ?? []).map((r) => r.class_id));
  return classes.filter((c) => taught.has(c.id) || c.head_teacher?.id === me.id);
}

export async function getDaySlots(classId: string, weekday: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("timetable_slots")
    .select("id, starts_at, ends_at, class_subject_id, class_subject:class_subjects(subject:subjects(name))")
    .eq("class_id", classId)
    .eq("weekday", weekday)
    .order("starts_at");
  return (data ?? []).map((s) => ({
    id: s.id,
    startsAt: s.starts_at.slice(0, 5),
    endsAt: s.ends_at.slice(0, 5),
    classSubjectId: s.class_subject_id,
    subject: s.class_subject?.subject?.name ?? null,
  }));
}

export async function getRollCall(organizationId: string, classId: string, date: string, startsAt: string) {
  const supabase = await createClient();
  const [{ data: enrollments }, { data: session }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student:students(id, first_name, last_name, matricule)")
      .eq("organization_id", organizationId)
      .eq("class_id", classId)
      .eq("status", "validated"),
    supabase
      .from("attendance_sessions")
      .select("id, ends_at, status, attendance_records(student_id, status, minutes_late, is_justified)")
      .eq("class_id", classId)
      .eq("session_date", date)
      .eq("starts_at", startsAt)
      .maybeSingle(),
  ]);
  const students = (enrollments ?? [])
    .flatMap((e) => (e.student ? [e.student] : []))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));
  return { students, session };
}

export type AbsenceFilters = { from: string; to: string; classId?: string; status?: "absent" | "late"; unjustified?: boolean };

export async function listAbsences(organizationId: string, filters: AbsenceFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("attendance_records")
    .select(
      "id, status, minutes_late, is_justified, justification, student:students(id, first_name, last_name, matricule), session:attendance_sessions!inner(session_date, starts_at, ends_at, class_id, class:classes(name))",
    )
    .eq("organization_id", organizationId)
    .in("status", filters.status ? [filters.status] : ["absent", "late"])
    .gte("session.session_date", filters.from)
    .lte("session.session_date", filters.to);
  if (filters.classId) query = query.eq("session.class_id", filters.classId);
  if (filters.unjustified) query = query.eq("is_justified", false);
  const { data, error } = await query.limit(300);
  if (error) throw new Error("Impossible de charger le registre des absences.");
  return (data ?? []).sort((a, b) =>
    a.session.session_date === b.session.session_date
      ? a.session.starts_at < b.session.starts_at ? 1 : -1
      : a.session.session_date < b.session.session_date ? 1 : -1,
  );
}
