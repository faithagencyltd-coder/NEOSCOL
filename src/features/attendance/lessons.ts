import "server-only";

import { createClient } from "@/lib/supabase/server";

export type LessonStatus = "pending" | "unlocked" | "in_progress" | "validated" | "missed";

export const LESSON_STATUS: Record<LessonStatus, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "danger" }> = {
  pending: { label: "En attente", tone: "neutral" },
  unlocked: { label: "Appel disponible", tone: "primary" },
  in_progress: { label: "Appel en cours", tone: "warning" },
  validated: { label: "Appel validé", tone: "success" },
  missed: { label: "Appel non fait", tone: "danger" },
};

/** Cours datés de l'enseignant connecté (emploi du temps + état de l'appel). */
export async function getMyLessons(from: string, to: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_lessons", { p_from: from, p_to: to });
  return (data ?? []).map((l) => ({ ...l, status: l.status as LessonStatus, starts_at: l.starts_at.slice(0, 5), ends_at: l.ends_at.slice(0, 5) }));
}

/** Un cours (créneau + date) avec sa liste d'appel. La RLS limite l'enseignant à ses classes. */
export async function getLesson(organizationId: string, slotId: string, date: string) {
  const supabase = await createClient();
  const { data: slot } = await supabase
    .from("timetable_slots")
    .select(
      "id, weekday, starts_at, ends_at, class_id, class_subject_id, teacher_id, class:classes(id, name), class_subject:class_subjects(id, subject:subjects(name)), room:rooms(name), teacher:staff_members(id, first_name, last_name, user_id)",
    )
    .eq("organization_id", organizationId)
    .eq("id", slotId)
    .maybeSingle();
  if (!slot) return null;
  const [{ data: unlock }, { data: session }, { data: enrollments }] = await Promise.all([
    supabase.from("lesson_unlocks").select("unlocked_at, method, reason").eq("timetable_slot_id", slotId).eq("lesson_date", date).maybeSingle(),
    supabase
      .from("attendance_sessions")
      .select("id, status, validated_at, notes, attendance_records(student_id, status, minutes_late, arrived_at, comment, is_justified, justification)")
      .eq("timetable_slot_id", slotId)
      .eq("session_date", date)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("student:students(id, first_name, last_name, matricule, photo_path)")
      .eq("organization_id", organizationId)
      .eq("class_id", slot.class_id)
      .eq("status", "validated"),
  ]);
  const students = (enrollments ?? [])
    .flatMap((e) => (e.student ? [e.student] : []))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));
  return { slot, unlock, session, students };
}

/** Tous les cours d'une journée (administration) : déverrouillage et état de l'appel. */
export async function getDayLessons(organizationId: string, yearId: string, date: string, weekday: number) {
  const supabase = await createClient();
  const [{ data: slots }, { data: unlocks }, { data: sessions }] = await Promise.all([
    supabase
      .from("timetable_slots")
      .select("id, starts_at, ends_at, class:classes(name), class_subject:class_subjects(subject:subjects(name)), teacher:staff_members(first_name, last_name), room:rooms(name)")
      .eq("organization_id", organizationId)
      .eq("academic_year_id", yearId)
      .eq("weekday", weekday)
      .order("starts_at"),
    supabase.from("lesson_unlocks").select("timetable_slot_id, method, unlocked_at").eq("organization_id", organizationId).eq("lesson_date", date),
    supabase.from("attendance_sessions").select("id, timetable_slot_id, status").eq("organization_id", organizationId).eq("session_date", date).not("timetable_slot_id", "is", null),
  ]);
  return (slots ?? []).map((slot) => ({
    ...slot,
    starts_at: slot.starts_at.slice(0, 5),
    ends_at: slot.ends_at.slice(0, 5),
    unlock: (unlocks ?? []).find((u) => u.timetable_slot_id === slot.id) ?? null,
    session: (sessions ?? []).find((s) => s.timetable_slot_id === slot.id) ?? null,
  }));
}

/** Justificatifs d'absence (administration). */
export async function listJustifications(organizationId: string, status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("absence_justifications")
    .select("id, starts_on, ends_on, reason, status, submitted_via, submitted_at, review_comment, reviewed_at, records_justified, file_id, student:students(id, first_name, last_name, matricule)")
    .eq("organization_id", organizationId);
  if (status) query = query.eq("status", status);
  const { data } = await query.order("submitted_at", { ascending: false }).limit(200);
  return data ?? [];
}

/** Élèves inscrits de l'année (sélecteur du dépôt de justificatif). */
export async function listStudentsForJustification(organizationId: string, yearId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("student:students(id, first_name, last_name), class:classes(name)")
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId)
    .eq("status", "validated");
  return (data ?? [])
    .flatMap((e) => (e.student ? [{ id: e.student.id, name: `${e.student.last_name} ${e.student.first_name} — ${e.class?.name ?? ""}` }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
