import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ReportSubject = {
  subject: string;
  teacher: string | null;
  coefficient: number;
  average: number | null;
  class_average: number | null;
  min: number | null;
  max: number | null;
};

export function reportSubjects(data: unknown): ReportSubject[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const subjects = (data as Record<string, unknown>).subjects;
  return Array.isArray(subjects) ? (subjects as ReportSubject[]) : [];
}

export function reportClassAverage(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).class_average;
  return typeof value === "number" ? value : null;
}

export async function listReportCards(organizationId: string, classId: string, periodId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_cards")
    .select("id, average, rank, class_size, appreciation, decision, head_teacher_comment, status, published_at, data, student:students(id, first_name, last_name, matricule)")
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("academic_period_id", periodId);
  return (data ?? []).sort(
    (a, b) =>
      (a.rank ?? 9999) - (b.rank ?? 9999) ||
      (a.student?.last_name ?? "").localeCompare(b.student?.last_name ?? "", "fr"),
  );
}

export async function getReportCard(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_cards")
    .select(
      `id, average, rank, class_size, appreciation, decision, head_teacher_comment, status, published_at, data,
       student:students(id, first_name, last_name, matricule, birth_date, birth_place, sex),
       class:classes(name, head_teacher:staff_members(first_name, last_name), academic_year:academic_years(name)),
       period:academic_periods(name)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getBranding(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_branding")
    .select("header_text, footer_text, signatory_name, signatory_title, primary_color")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

export async function getOrganizationCard(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, address, city, phone, email")
    .eq("id", organizationId)
    .maybeSingle();
  return data;
}
