import "server-only";

import { createClient } from "@/lib/supabase/server";
import { escapeLike, likePattern } from "@/lib/utils/search-params";

export const AUDIT_PAGE_SIZE = 50;

/** Modules du journal : préfixes d'actions (« students.update », « portal.account_suspended »…). */
export const AUDIT_MODULES: Record<string, { label: string; prefixes: string[] }> = {
  auth: { label: "Connexions", prefixes: ["auth"] },
  students: { label: "Élèves et inscriptions", prefixes: ["students", "enrollments", "student_guardians", "guardians"] },
  pedagogy: { label: "Notes et bulletins", prefixes: ["grades", "assessments", "report_cards", "report_card_settings"] },
  attendance: { label: "Présences", prefixes: ["attendance", "attendance_sessions", "attendance_records", "absence_justifications", "lesson"] },
  staff: { label: "Personnel et pointage", prefixes: ["staff_members", "staff_badges", "staff_attendance", "badge"] },
  finance: { label: "Finances", prefixes: ["invoices", "installments", "invoice_lines", "payments", "expenses", "invoice_reminders", "fee_types", "fee_rates"] },
  documents: { label: "Documents", prefixes: ["document", "issued_documents", "document_templates"] },
  access: { label: "Accès et rôles", prefixes: ["portal", "memberships", "membership_roles", "roles", "role_permissions"] },
  settings: { label: "Paramètres", prefixes: ["settings", "organizations", "organization_branding", "academic_years", "academic_periods", "classes", "class_subjects"] },
};

export const AUDIT_PERIODS: Record<string, { label: string; days: number }> = {
  "24h": { label: "Dernières 24 h", days: 1 },
  "7j": { label: "7 derniers jours", days: 7 },
  "30j": { label: "30 derniers jours", days: 30 },
  "1an": { label: "12 derniers mois", days: 365 },
};

export type AuditFilters = { q?: string; module?: string; result?: string; period?: string; page: number };

/** Journal d'audit de l'établissement (RLS : audit.read). */
export async function listAuditLogs(organizationId: string, filters: AuditFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_type, entity_id, summary, actor_email, actor_role, result, changes, metadata", { count: "exact" })
    .eq("organization_id", organizationId);
  const auditModule = filters.module ? AUDIT_MODULES[filters.module] : undefined;
  if (auditModule) query = query.or(auditModule.prefixes.map((p) => `action.ilike.${escapeLike(p)}.%`).join(","));
  if (filters.result) query = query.eq("result", filters.result);
  const period = filters.period ? AUDIT_PERIODS[filters.period] : undefined;
  if (period) query = query.gte("created_at", new Date(Date.now() - period.days * 86_400_000).toISOString());
  if (filters.q) {
    const pattern = likePattern(filters.q);
    query = query.or(`summary.ilike.${pattern},actor_email.ilike.${pattern},action.ilike.${pattern}`);
  }
  const from = (filters.page - 1) * AUDIT_PAGE_SIZE;
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1);
  return { rows: data ?? [], total: count ?? 0 };
}
