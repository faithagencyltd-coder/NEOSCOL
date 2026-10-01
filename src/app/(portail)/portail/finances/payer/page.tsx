import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PayForm, type PayInstallment } from "@/features/fee-payments/components/pay-form";
import { getFeeOptions } from "@/features/fee-payments/queries";
import { requirePortalSection } from "@/features/portal/context";
import { GLOBAL_OFF_MESSAGE } from "@/lib/payments/school-adapters";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Payer en ligne" };

/** Parent : paiement en ligne d'une échéance, du solde ou d'un montant autorisé. */
export default async function PayInvoicePage({ searchParams }: PageProps<"/portail/finances/payer">) {
  const { organization, student, parent } = await requirePortalSection("finances");
  if (!parent || !student) notFound();
  const { facture } = await searchParams;
  const invoiceId = typeof facture === "string" ? facture : "";
  if (!isUuid(invoiceId)) notFound();
  const supabase = await createClient();
  const [{ data: inv }, options] = await Promise.all([
    supabase
      .from("invoice_balances")
      .select("invoice_id, number, total, paid, balance, status, currency, student_id")
      .eq("organization_id", organization.id)
      .eq("invoice_id", invoiceId)
      .maybeSingle(),
    getFeeOptions(organization.id),
  ]);
  if (!inv || inv.student_id !== student.id) notFound();
  const currency = inv.currency ?? organization.currency;
  const balance = Number(inv.balance ?? 0);
  const { data: plan } = await supabase.from("installments").select("id, label, amount, due_on, sequence").eq("invoice_id", invoiceId).order("sequence");
  // Reste de chaque échéance (même calcul qu'en base : les paiements couvrent les échéances dans l'ordre).
  let cumulative = 0;
  const paid = Number(inv.paid ?? 0);
  const installments: PayInstallment[] = [];
  for (const i of plan ?? []) {
    cumulative += Number(i.amount);
    const remaining = Math.min(Number(i.amount), Math.max(cumulative - paid, 0));
    if (remaining > 0) installments.push({ id: i.id, label: i.label || `Échéance ${i.sequence}`, due_on: i.due_on, remaining });
  }
  const providers = options.providers.filter((p) => p.currency === currency);
  const { data: open } = await supabase.from("fee_payment_transactions").select("amount, currency, internal_reference").eq("invoice_id", invoiceId).in("status", ["PENDING", "PROCESSING"]).gt("expires_at", new Date().toISOString());

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <Link href="/portail/finances" className="text-sm font-semibold text-primary hover:underline">
        ← Finances
      </Link>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Payer en ligne</h1>
        <p className="text-sm text-muted-foreground">
          {student.first_name} {student.last_name} · facture {inv.number} · reste à payer {formatMoney(balance, currency)}
        </p>
      </div>
      {!options.open ? (
        <Alert tone="warning">{options.org_enabled && !options.global_enabled ? GLOBAL_OFF_MESSAGE : "Le paiement en ligne n'est pas disponible pour cet établissement."}</Alert>
      ) : inv.status !== "issued" || balance <= 0 ? (
        <Alert tone="success">Cette facture est réglée : rien à payer.</Alert>
      ) : providers.length === 0 ? (
        <Alert tone="warning">Aucun moyen de paiement en ligne n&apos;accepte la devise de cette facture ({currency}). Rapprochez-vous de l&apos;établissement.</Alert>
      ) : (
        <Card className="p-5">
          {open && open.length > 0 ? (
            <Alert tone="info" className="mb-4">
              Un paiement en ligne est déjà en cours pour cette facture ({open.map((o) => `${formatMoney(Number(o.amount), o.currency)} — ${o.internal_reference}`).join(", ")}). Attendez sa confirmation avant d&apos;en lancer un autre.
            </Alert>
          ) : null}
          <PayForm invoiceId={invoiceId} currency={currency} balance={balance} installments={installments} providers={providers} allowPartial={options.allow_partial} minPartial={Number(options.min_partial)} />
        </Card>
      )}
    </div>
  );
}
