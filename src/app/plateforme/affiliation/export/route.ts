import { COMMISSION_STATUS, PAYOUT_METHODS } from "@/features/affiliates/constants";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/write";

/** Export Excel du programme d'affiliation (commissions, versements) : plateforme uniquement, revérifié en base. */
export async function GET() {
  if (!(await getSessionContext())) return new Response("Session expirée.", { status: 401 });
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return new Response("Introuvable.", { status: 404 });
  const [{ data: commissions }, { data: payouts }] = await Promise.all([
    supabase
      .from("affiliate_commissions")
      .select("created_at, amount, currency, payment_amount, plan_code, mode, status, reason, organization:organizations(name), affiliate:affiliates!affiliate_commissions_affiliate_id_fkey(code)")
      .order("created_at"),
    supabase.from("affiliate_payouts").select("paid_on, amount, currency, method, reference, note, affiliate:affiliates(code)").order("paid_on"),
  ]);
  const xlsx = buildXlsx([
    {
      name: "Commissions",
      autoFilter: true,
      widths: [12, 18, 32, 14, 14, 10, 18, 10, 16, 40],
      rows: [
        ["Date", "Affilié", "Établissement", "Paiement", "Commission", "Devise", "Formule", "Mode", "Statut", "Motif"],
        ...(commissions ?? []).map((c) => [new Date(c.created_at), c.affiliate?.code ?? "", c.organization?.name ?? "", c.payment_amount, c.amount, c.currency, c.plan_code ?? "", c.mode === "test" ? "test" : "réel", (COMMISSION_STATUS as Record<string, { label: string }>)[c.status]?.label ?? c.status, c.reason ?? ""]),
      ],
    },
    {
      name: "Versements",
      autoFilter: true,
      widths: [12, 18, 14, 10, 18, 28, 40],
      rows: [
        ["Date", "Affilié", "Montant", "Devise", "Moyen", "Référence", "Note"],
        ...(payouts ?? []).map((p) => [p.paid_on, p.affiliate?.code ?? "", p.amount, p.currency, PAYOUT_METHODS[p.method] ?? p.method, p.reference, p.note ?? ""]),
      ],
    },
  ]);
  return new Response(new Uint8Array(xlsx), {
    headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="affiliation-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "private, no-store" },
  });
}
