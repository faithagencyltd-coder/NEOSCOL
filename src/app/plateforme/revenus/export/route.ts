import type { NextRequest } from "next/server";

import { PROVIDER_LABELS, SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { toDelimitedCsv } from "@/features/migration/csv";
import { parseRevenuePeriod, type RevenueSummary } from "@/features/platform/revenue";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/write";

const INTERVAL: Record<string, string> = { MONTHLY: "Mensuel", YEARLY: "Annuel" };

const frDate = (value: string | null) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Export comptable des encaissements de la plateforme (Super Admin) :
 * Excel (encaissements, impayés, départs) ou CSV (encaissements). Chaque
 * export est inscrit au journal d'audit par la base.
 */
export async function GET(request: NextRequest) {
  const context = await getSessionContext();
  if (!context) return new Response("Session expirée.", { status: 401 });
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return new Response("Introuvable.", { status: 404 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = parseRevenuePeriod(params, new Date());
  const includeTest = params.test === "1";
  const { data: rows, error } = await supabase.rpc("platform_revenue_export", { p_from: period.from, p_to: period.to, p_include_test: includeTest });
  if (error) return new Response(error.message, { status: 400 });

  const header = [
    "Date de paiement",
    "Type",
    "Établissement",
    "Code",
    "Référence",
    "Formule",
    "Périodicité",
    "Période du",
    "Période au",
    "Montant catalogue",
    "Remise",
    "Code promo",
    "Montant encaissé",
    "Devise",
    "Moyen de paiement",
    "Mode",
  ];
  const lines = (rows ?? []).map((r) => [
    frDate(r.paid_at),
    r.source,
    r.organization_name,
    r.organization_code,
    r.reference,
    r.label,
    INTERVAL[r.billing_interval] ?? r.billing_interval,
    frDate(r.period_start),
    frDate(r.period_end),
    r.list_amount,
    r.discount_amount,
    r.promo_code ?? "",
    r.amount,
    r.currency,
    PROVIDER_LABELS[r.payment_method] ?? r.payment_method ?? "",
    r.mode === "test" ? "Test" : "Réel",
  ]);
  const base = `neoscool-encaissements-${period.from}-au-${period.to}`;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

  if (params.format === "csv") {
    const body = lines.map((l) => l.map((v) => (typeof v === "number" ? String(v) : (v ?? ""))));
    return new Response(toDelimitedCsv(header, body, ";"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
    });
  }

  const { data: summary } = await supabase.rpc("platform_revenue_summary", { p_from: period.from, p_to: period.to });
  const s = summary as unknown as RevenueSummary | null;
  const totals = new Map<string, number>();
  for (const r of rows ?? []) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);
  const xlsx = buildXlsx([
    {
      name: "Encaissements",
      rows: [header, ...lines, [], ...[...totals].map(([currency, amount]) => ["Total", "", "", "", "", "", "", "", "", "", "", "", amount, currency])],
      widths: [14, 16, 30, 12, 20, 28, 12, 12, 12, 16, 12, 14, 16, 8, 22, 8],
    },
    {
      name: "Impayés",
      rows: [
        ["Établissement", "Code", "Formule", "Statut", "Depuis le", "À régler", "Devise"],
        ...(s?.unpaid ?? []).map((u) => [
          u.organization_name,
          u.organization_code,
          u.plan_name,
          SUBSCRIPTION_STATUS[u.status]?.label ?? u.status,
          frDate(u.status_changed_at),
          Number(u.amount),
          u.currency,
        ]),
      ],
      widths: [30, 12, 24, 16, 12, 14, 8],
    },
    {
      name: "Départs",
      rows: [
        ["Établissement", "Code", "Formule", "Statut", "Date", "Motif"],
        ...(s?.churn ?? []).map((c) => [
          c.organization_name,
          c.organization_code,
          c.plan_name,
          SUBSCRIPTION_STATUS[c.status]?.label ?? c.status,
          frDate(c.status_changed_at),
          c.cancellation_reason ?? "",
        ]),
      ],
      widths: [30, 12, 24, 16, 12, 40],
    },
  ]);
  return new Response(new Uint8Array(xlsx), {
    headers: { ...headers, "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}
