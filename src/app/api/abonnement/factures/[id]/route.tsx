import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { INTERVAL_LABELS, INVOICE_STATUS, PROVIDER_LABELS } from "@/features/billing/constants";
import { errorResponse, pdfResponse } from "@/features/documents/server";
import { SubscriptionInvoicePage } from "@/features/documents/pdf/subscription-invoice";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

/** Facture d'abonnement NéoScol en PDF : la RLS limite l'accès à l'établissement (billing.read) et à la plateforme. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/abonnement/factures/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Facture introuvable.");
  if (!(await getSessionContext())) return errorResponse(401, "Session expirée : reconnectez-vous.");
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("subscription_invoices")
    .select("*, organization:organizations(name, code, address, city, country, email, phone), tx:payment_transactions!subscription_invoices_tx_fk(internal_reference, provider, mode)")
    .eq("id", id)
    .maybeSingle();
  if (!inv || !inv.organization) return errorResponse(404, "Facture introuvable.");
  const d = (value: string | null) => (value ? formatDate(value, "fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : null);
  const pdf = await renderToBuffer(
    <Document title={`Facture ${inv.invoice_number}`} author="NéoScol" language="fr">
      <SubscriptionInvoicePage
        data={{
          invoice_number: inv.invoice_number,
          status: inv.status,
          status_label: INVOICE_STATUS[inv.status]?.label ?? inv.status,
          issued_at: d(inv.issued_at) ?? "—",
          due_at: d(inv.due_at) ?? "—",
          paid_at: d(inv.paid_at),
          plan_name: inv.plan_name,
          interval_label: INTERVAL_LABELS[inv.billing_interval]?.label ?? inv.billing_interval,
          period: inv.period_start && inv.period_end ? `${d(inv.period_start)} → ${d(inv.period_end)}` : `${INTERVAL_LABELS[inv.billing_interval]?.period ?? ""} (à compter du paiement)`,
          list_amount: formatMoney(inv.list_amount, inv.currency),
          discount: inv.discount_amount > 0 ? formatMoney(inv.discount_amount, inv.currency) : null,
          total: formatMoney(inv.amount, inv.currency),
          currency: inv.currency,
          payment_method: inv.tx ? (PROVIDER_LABELS[inv.tx.provider] ?? inv.tx.provider) + (inv.payment_method && inv.payment_method !== inv.tx.provider ? ` — ${inv.payment_method}` : "") : inv.payment_method,
          transaction_reference: inv.tx?.internal_reference ?? null,
          test_mode: inv.tx?.mode === "test",
          organization: inv.organization,
        }}
      />
    </Document>,
  );
  return pdfResponse(pdf, `facture-${inv.invoice_number}`, request.nextUrl.searchParams.has("telecharger"));
}
