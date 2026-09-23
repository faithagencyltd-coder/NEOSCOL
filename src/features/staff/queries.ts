import "server-only";

import { createClient } from "@/lib/supabase/server";
import { likePattern, normalizeSearch } from "@/lib/utils/search-params";

export const STAFF_PAGE_SIZE = 20;

export type StaffFilters = { q?: string; status?: string; kind?: string; page: number };

export async function listStaff(organizationId: string, filters: StaffFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("staff_members")
    .select(
      "id, first_name, last_name, employee_number, job_title, is_teacher, status, archived_at, photo_path, user_id, phone, email, staff_badges(status)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);
  if (filters.q) query = query.ilike("search_text", likePattern(normalizeSearch(filters.q)));
  if (filters.status === "archived") query = query.not("archived_at", "is", null);
  else {
    query = query.is("archived_at", null);
    if (filters.status) query = query.eq("status", filters.status);
  }
  if (filters.kind === "teacher") query = query.eq("is_teacher", true);
  if (filters.kind === "staff") query = query.eq("is_teacher", false);
  const from = (filters.page - 1) * STAFF_PAGE_SIZE;
  const { data, count } = await query.order("last_name").order("first_name").range(from, from + STAFF_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getStaffMember(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select(
      `*, account:profiles!staff_members_user_id_fkey(id, email, phone, last_seen_at),
       staff_badges(id, number, token, status, issued_at, revoked_at, revoked_reason, printed_count, last_printed_at, academic_year:academic_years(name))`,
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Affectations (matières / classes) et créneaux de l'emploi du temps. */
export async function getStaffAssignments(staffId: string) {
  const supabase = await createClient();
  const [{ data: subjects }, { data: slots }] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id, coefficient, class:classes(id, name), subject:subjects(name)")
      .eq("teacher_id", staffId),
    supabase
      .from("timetable_slots")
      .select("id, weekday, starts_at, ends_at, class:classes(name), class_subject:class_subjects(subject:subjects(name)), room:rooms(name)")
      .eq("teacher_id", staffId)
      .order("weekday")
      .order("starts_at"),
  ]);
  return { subjects: subjects ?? [], slots: slots ?? [] };
}

/** Rôles attribuables à un compte du personnel (hors portails et tablette). */
export async function getStaffRoles(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, key, name, persona")
    .eq("organization_id", organizationId)
    .in("persona", ["staff", "teacher"])
    .neq("key", "kiosk")
    .order("name");
  return data ?? [];
}

export async function getAccountRoles(organizationId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id, status, membership_roles(role:roles(id, name))")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export type AttendanceFilters = { from: string; to: string; staffId?: string; late?: boolean; q?: string };

/** Pointage du personnel sur une période (staff_attendance.read). */
export async function listStaffAttendance(organizationId: string, filters: AttendanceFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("staff_attendance")
    .select("id, work_date, arrived_at, departed_at, expected_start, minutes_late, staff:staff_members!inner(id, first_name, last_name, employee_number, job_title, search_text)")
    .eq("organization_id", organizationId)
    .gte("work_date", filters.from)
    .lte("work_date", filters.to);
  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  if (filters.late) query = query.gt("minutes_late", 0);
  if (filters.q) query = query.ilike("staff.search_text", likePattern(normalizeSearch(filters.q)));
  const { data } = await query.order("work_date", { ascending: false }).order("arrived_at", { ascending: false }).limit(500);
  return data ?? [];
}

export async function listBadgeScans(organizationId: string, filters: { from: string; to: string; result?: string; staffId?: string }, limit = 200) {
  const supabase = await createClient();
  let query = supabase
    .from("badge_scans")
    .select("id, scanned_at, result, kind, reason, message, device, staff:staff_members(id, first_name, last_name)")
    .eq("organization_id", organizationId)
    .gte("scanned_at", `${filters.from}T00:00:00Z`)
    .lte("scanned_at", `${filters.to}T23:59:59Z`);
  if (filters.result) query = query.eq("result", filters.result);
  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  const { data } = await query.order("scanned_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function listLessonUnlocks(organizationId: string, filters: { from: string; to: string; staffId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("lesson_unlocks")
    .select("id, lesson_date, starts_at, ends_at, method, reason, unlocked_at, class:classes(name), class_subject:class_subjects(subject:subjects(name)), teacher:staff_members(first_name, last_name)")
    .eq("organization_id", organizationId)
    .gte("lesson_date", filters.from)
    .lte("lesson_date", filters.to);
  if (filters.staffId) query = query.eq("teacher_id", filters.staffId);
  const { data } = await query.order("lesson_date", { ascending: false }).order("starts_at", { ascending: false }).limit(300);
  return data ?? [];
}

/** Personnel actif (pour les filtres). */
export async function listActiveStaff(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("last_name");
  return data ?? [];
}
