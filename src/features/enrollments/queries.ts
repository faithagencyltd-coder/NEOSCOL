import "server-only";

import { parseFields, type FieldDefinition } from "@/features/forms/fields";
import { createClient } from "@/lib/supabase/server";
import { likePattern, normalizeSearch } from "@/lib/utils/search-params";

export const ENROLLMENTS_PAGE_SIZE = 20;
export const ENROLLMENT_STATUSES = ["pending", "draft", "validated", "rejected", "cancelled"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export async function listEnrollments(
  organizationId: string,
  filters: { status?: EnrollmentStatus; q?: string; classId?: string; yearId?: string; page: number },
) {
  const supabase = await createClient();
  let query = supabase
    .from("enrollments")
    .select(
      "id, reference, type, status, created_at, submitted_at, student:students!inner(id, first_name, last_name, matricule), class:classes(id, name), academic_year:academic_years(name)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.yearId) query = query.eq("academic_year_id", filters.yearId);
  if (filters.q) {
    query = /^ins-/i.test(filters.q)
      ? query.ilike("reference", likePattern(filters.q.toUpperCase()))
      : query.ilike("student.search_text", likePattern(normalizeSearch(filters.q)));
  }
  const from = (filters.page - 1) * ENROLLMENTS_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + ENROLLMENTS_PAGE_SIZE - 1);
  if (error) throw new Error("Impossible de charger les inscriptions.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function countEnrollmentsByStatus(organizationId: string, yearId?: string) {
  const supabase = await createClient();
  const counts = Object.fromEntries(ENROLLMENT_STATUSES.map((s) => [s, 0])) as Record<EnrollmentStatus, number>;
  await Promise.all(
    ENROLLMENT_STATUSES.map(async (status) => {
      let query = supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", status);
      if (yearId) query = query.eq("academic_year_id", yearId);
      const { count } = await query;
      counts[status] = count ?? 0;
    }),
  );
  return counts;
}

export async function getEnrollment(organizationId: string, enrollmentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select(
      `*, student:students(id, first_name, last_name, matricule, sex, birth_date, status,
         student_guardians(relationship, is_primary, guardian:guardians(id, first_name, last_name, phone))),
       class:classes(id, name, capacity), academic_year:academic_years(id, name),
       form_definition:form_definitions(id, name, fields)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", enrollmentId)
    .maybeSingle();
  return data;
}

export async function getEnrollmentInvoice(enrollmentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, number, status, total")
    .eq("enrollment_id", enrollmentId)
    .neq("status", "cancelled")
    .maybeSingle();
  return data;
}

export async function getFeePreview(enrollmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enrollment_fee_preview", { p_enrollment_id: enrollmentId });
  return error ? null : (data ?? []);
}

export type EnrollmentForms = { enrollment: { id: string; fields: FieldDefinition[] } | null; reenrollment: { id: string; fields: FieldDefinition[] } | null };

export async function getEnrollmentForms(organizationId: string): Promise<EnrollmentForms> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_definitions")
    .select("id, kind, fields")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("kind", ["enrollment", "reenrollment"]);
  const find = (kind: string) => {
    const row = (data ?? []).find((d) => d.kind === kind);
    return row ? { id: row.id, fields: parseFields(row.fields) } : null;
  };
  return { enrollment: find("enrollment"), reenrollment: find("reenrollment") };
}

export async function getStudentSummary(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name, matricule, archived_at")
    .eq("organization_id", organizationId)
    .eq("id", studentId)
    .maybeSingle();
  return data;
}
