import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Slot = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  className: string;
  classId: string;
  subject: string | null;
  subjectColor: string | null;
  classSubjectId: string | null;
  teacher: string | null;
  room: string | null;
};

export async function getSlots(
  organizationId: string,
  yearId: string,
  filter: { classId?: string; teacherId?: string },
): Promise<Slot[]> {
  const supabase = await createClient();
  let query = supabase
    .from("timetable_slots")
    .select(
      "id, weekday, starts_at, ends_at, class_id, class:classes(id, name), class_subject:class_subjects(id, subject:subjects(name, color)), teacher:staff_members(first_name, last_name), room:rooms(name)",
    )
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId);
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.teacherId) query = query.eq("teacher_id", filter.teacherId);
  const { data } = await query.order("weekday").order("starts_at");
  return (data ?? []).map((row) => ({
    id: row.id,
    weekday: row.weekday,
    startsAt: row.starts_at.slice(0, 5),
    endsAt: row.ends_at.slice(0, 5),
    classId: row.class_id,
    className: row.class?.name ?? "—",
    subject: row.class_subject?.subject?.name ?? null,
    subjectColor: row.class_subject?.subject?.color ?? null,
    classSubjectId: row.class_subject?.id ?? null,
    teacher: row.teacher ? `${row.teacher.first_name} ${row.teacher.last_name}` : null,
    room: row.room?.name ?? null,
  }));
}

/** Fiche personnel de l'utilisateur connecté (enseignant), si elle existe. */
export const getMyStaffMember = cache(async (organizationId: string, userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name, is_teacher")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
});

export async function getClassSubjectsForClass(classId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, subject:subjects(name), teacher:staff_members(first_name, last_name)")
    .eq("class_id", classId);
  return (data ?? [])
    .map((cs) => ({
      id: cs.id,
      label: `${cs.subject?.name ?? "—"}${cs.teacher ? ` — ${cs.teacher.first_name} ${cs.teacher.last_name}` : ""}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
