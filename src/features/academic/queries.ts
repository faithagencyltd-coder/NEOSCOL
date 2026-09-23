import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export const getAcademicYears = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current, status")
    .eq("organization_id", organizationId)
    .order("starts_on", { ascending: false });
  return data ?? [];
});

export const getCurrentYear = cache(async (organizationId: string) => {
  const years = await getAcademicYears(organizationId);
  return years.find((y) => y.is_current) ?? years[0] ?? null;
});

export const getPeriods = cache(async (organizationId: string, yearId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_periods")
    .select("id, name, type, sequence, starts_on, ends_on, is_locked")
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId)
    .order("sequence");
  return data ?? [];
});

export const getClasses = cache(async (organizationId: string, yearId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select(
      "id, name, code, kind, capacity, starts_on, ends_on, archived_at, level:levels(id, name, sequence), program:programs(id, name), head_teacher:staff_members(id, first_name, last_name), room:rooms(id, name)",
    )
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId)
    .is("archived_at", null)
    .order("name");
  return (data ?? []).sort(
    (a, b) => (a.level?.sequence ?? 99) - (b.level?.sequence ?? 99) || a.name.localeCompare(b.name, "fr"),
  );
});

export const getLevels = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("levels")
    .select("id, name, short_name, cycle, sequence")
    .eq("organization_id", organizationId)
    .order("sequence");
  return data ?? [];
});

export const getPrograms = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("programs")
    .select("id, name, code, kind, duration_hours, is_active, description")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
});

export const getSubjects = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("id, name, code, kind, credits, is_active, program:programs(id, name)")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
});

export const getRooms = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rooms")
    .select("id, name, building, capacity")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
});

/** Enseignants actifs (nécessite staff.read ; liste vide sinon). */
export const getTeachers = cache(async (organizationId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .eq("is_teacher", true)
    .eq("status", "active")
    .is("archived_at", null)
    .order("last_name");
  return data ?? [];
});

/** Effectifs validés par classe. */
export async function getClassHeadcounts(organizationId: string, classIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (classIds.length === 0) return counts;
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("class_id")
    .eq("organization_id", organizationId)
    .eq("status", "validated")
    .in("class_id", classIds);
  for (const row of data ?? []) {
    if (row.class_id) counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }
  return counts;
}

export async function getClassDetail(organizationId: string, classId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select(
      `id, name, code, kind, capacity, starts_on, ends_on, archived_at, academic_year_id, level_id, program_id, room_id, head_teacher_id,
       academic_year:academic_years(id, name, is_current), level:levels(id, name), program:programs(id, name),
       room:rooms(id, name), head_teacher:staff_members(id, first_name, last_name),
       class_subjects(id, coefficient, weekly_hours, sort_order, subject:subjects(id, name, code), teacher:staff_members(id, first_name, last_name))`,
    )
    .eq("organization_id", organizationId)
    .eq("id", classId)
    .maybeSingle();
  return data;
}

export async function getClassStudents(organizationId: string, classId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, type, student:students(id, matricule, first_name, last_name, sex, birth_date, status)")
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("status", "validated");
  return (data ?? [])
    .filter((e) => e.student)
    .map((e) => ({ enrollmentId: e.id, type: e.type, ...e.student! }))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));
}
