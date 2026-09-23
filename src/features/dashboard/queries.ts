import "server-only";

import { dashboardOverviewSchema, type DashboardOverview } from "@/features/dashboard/types";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardOverview(organizationId: string): Promise<DashboardOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_overview", { p_organization_id: organizationId });
  if (error) {
    throw new Error("Impossible de charger les indicateurs du tableau de bord.");
  }
  return dashboardOverviewSchema.parse(data ?? {});
}

export async function getVisibleAnnouncements(organizationId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, is_pinned, published_at, author_name")
    .eq("organization_id", organizationId)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

/** Classes et matières de l'enseignant connecté (portée RLS enseignant). */
export async function getMyTeaching(organizationId: string, userId: string) {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!staff) return [];

  const { data } = await supabase
    .from("class_subjects")
    .select("id, coefficient, class:classes(id, name), subject:subjects(name)")
    .eq("organization_id", organizationId)
    .eq("teacher_id", staff.id);

  const classIds = [...new Set((data ?? []).map((row) => row.class?.id).filter((id): id is string => Boolean(id)))];
  const { data: enrollments } = classIds.length
    ? await supabase.from("enrollments").select("class_id").in("class_id", classIds).eq("status", "validated")
    : { data: [] as { class_id: string | null }[] };
  const counts = new Map<string, number>();
  for (const row of enrollments ?? []) {
    if (row.class_id) counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }

  return (data ?? [])
    .filter((row) => row.class && row.subject)
    .map((row) => ({
      id: row.id,
      className: row.class!.name,
      subjectName: row.subject!.name,
      coefficient: row.coefficient,
      students: counts.get(row.class!.id) ?? 0,
    }))
    .sort((a, b) => a.className.localeCompare(b.className, "fr") || a.subjectName.localeCompare(b.subjectName, "fr"));
}

export type InvoiceSummary = { paid: number; partial: number; unpaid: number; outstanding: number };

/** Répartition des factures émises par situation de paiement (RLS : finance.read). */
export async function getInvoiceSummary(organizationId: string): Promise<InvoiceSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invoice_status_summary", { p_organization_id: organizationId });
  // Pas de faux zéros : en cas d'erreur, la carte n'est pas affichée.
  if (error) return null;
  const summary: InvoiceSummary = { paid: 0, partial: 0, unpaid: 0, outstanding: 0 };
  for (const row of data) {
    if (row.payment_status === "paid" || row.payment_status === "partial" || row.payment_status === "unpaid") {
      summary[row.payment_status] = Number(row.invoices);
    }
    summary.outstanding += Number(row.balance);
  }
  return summary;
}

export async function getRecentPayments(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, number, amount, method, paid_at, status, payer_name")
    .eq("organization_id", organizationId)
    .order("paid_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

/** Cours du jour de l'enseignant connecté (emploi du temps). */
