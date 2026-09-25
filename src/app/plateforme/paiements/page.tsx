import { CreditCard, FileText, Webhook } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { INVOICE_STATUS, PROVIDER_LABELS, TRANSACTION_STATUS } from "@/features/billing/constants";
import { recordManualPayment } from "@/features/platform/billing-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Paiements — Plateforme" };

const WEBHOOK_STATUS = {
  received: { label: "Reçu", tone: "neutral" },
  processed: { label: "Traité", tone: "success" },
  duplicate: { label: "Doublon ignoré", tone: "info" },
  ignored: { label: "En attente", tone: "neutral" },
  rejected: { label: "Rejeté", tone: "danger" },
  error: { label: "Erreur", tone: "danger" },
} as const;

/** Transactions, factures en attente (paiement manuel) et journal des notifications. */
export default async function PlatformPaymentsPage({ searchParams }: PageProps<"/plateforme/paiements">) {
  const params = await searchParams;
  const filter = typeof params.statut === "string" && params.statut in TRANSACTION_STATUS ? params.statut : null;
  const supabase = await createClient();
  let txQuery = supabase
    .from("payment_transactions")
    .select("id, internal_reference, provider, mode, amount, currency, status, failure_reason, paid_at, created_at, provider_transaction_id, organization:organizations(name, code), invoice:subscription_invoices!payment_transactions_organization_id_invoice_id_fkey(invoice_number)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter) txQuery = txQuery.eq("status", filter);
  const [{ data: transactions }, { data: pending }, { data: webhooks }] = await Promise.all([
    txQuery,
    supabase
      .from("subscription_invoices")
      .select("id, invoice_number, amount, currency, plan_name, billing_interval, status, issued_at, organization:organizations(name, code)")
      .in("status", ["PENDING", "FAILED"])
      .order("issued_at", { ascending: false })
      .limit(100),
    supabase.from("payment_webhooks").select("id, provider, mode, received_at, processing_status, error, provider_transaction_id, organization:organizations(name)").order("received_at", { ascending: false }).limit(30),
  ]);

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" aria-hidden /> Factures en attente de paiement
          </CardTitle>
          <CardDescription>Validation exceptionnelle d&apos;un paiement effectué hors plateforme : montant exact exigé, identité du validateur conservée.</CardDescription>
        </CardHeader>
        {!pending?.length ? (
          <CardContent>
            <EmptyState icon={FileText} title="Aucune facture en attente" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Facture</TH>
                <TH>Établissement</TH>
                <TH className="text-right">Montant</TH>
                <TH>Statut</TH>
                <TH className="text-right">Action</TH>
              </tr>
            </THead>
            <tbody>
              {pending.map((inv) => (
                <TR key={inv.id}>
                  <TD>
                    <span className="grid">
                      <span className="font-mono text-xs font-semibold">{inv.invoice_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {inv.plan_name} · {inv.billing_interval === "YEARLY" ? "annuel" : "mensuel"}
                      </span>
                    </span>
                  </TD>
                  <TD>{inv.organization?.name}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(inv.amount, inv.currency)}</TD>
                  <TD>
                    <StatusBadge value={inv.status} map={INVOICE_STATUS} />
                  </TD>
                  <TD>
                    <span className="flex justify-end">
                      <QuickFormDialog
                        title={`Paiement manuel — ${inv.invoice_number}`}
                        description={`${inv.organization?.name} · montant attendu : ${formatMoney(inv.amount, inv.currency)}. Le paiement sera confirmé, la facture payée et l'abonnement activé.`}
                        trigger={<Button size="sm">Valider un paiement</Button>}
                        submitLabel="Valider le paiement"
                        action={recordManualPayment}
                        hidden={{ invoice_id: inv.id }}
                        fields={[
                          { name: "reference", label: "Référence du paiement (reçu, virement…)", required: true },
                          { name: "amount", label: "Montant reçu (F CFA)", type: "number", required: true, min: 1, defaultValue: String(inv.amount) },
                          { name: "method", label: "Moyen", type: "select", options: [{ value: "virement", label: "Virement" }, { value: "especes", label: "Espèces" }, { value: "mobile_money", label: "Mobile money (hors plateforme)" }, { value: "cheque", label: "Chèque" }] },
                          { name: "note", label: "Note", type: "textarea", wide: true },
                        ]}
                      />
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" aria-hidden /> Transactions
          </CardTitle>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link href="/plateforme/paiements" className={cn("rounded-full border px-2.5 py-1 font-medium", !filter ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
              Toutes
            </Link>
            {Object.entries(TRANSACTION_STATUS).map(([key, s]) => (
              <Link key={key} href={`/plateforme/paiements?statut=${key}`} className={cn("rounded-full border px-2.5 py-1 font-medium", filter === key ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {s.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        {!transactions?.length ? (
          <CardContent>
            <EmptyState icon={CreditCard} title="Aucune transaction" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Référence</TH>
                <TH>Établissement</TH>
                <TH>Fournisseur</TH>
                <TH className="text-right">Montant</TH>
                <TH>Statut</TH>
              </tr>
            </THead>
            <tbody>
              {transactions.map((tx) => (
                <TR key={tx.id}>
                  <TD>
                    <span className="grid">
                      <span className="font-mono text-xs font-semibold">{tx.internal_reference}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(tx.paid_at ?? tx.created_at)} · {tx.invoice?.invoice_number}
                      </span>
                    </span>
                  </TD>
                  <TD>{tx.organization?.name}</TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {PROVIDER_LABELS[tx.provider] ?? tx.provider}
                      <Badge tone={tx.mode === "test" ? "warning" : "success"}>{tx.mode === "test" ? "Test" : "Production"}</Badge>
                    </span>
                    {tx.failure_reason ? <span className="block text-xs text-danger">{tx.failure_reason}</span> : null}
                  </TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(tx.amount, tx.currency)}</TD>
                  <TD>
                    <StatusBadge value={tx.status} map={TRANSACTION_STATUS} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="size-5 text-primary" aria-hidden /> Notifications des fournisseurs (webhooks)
          </CardTitle>
          <CardDescription>Contenu jamais cru : chaque notification est revérifiée auprès du fournisseur. Doublons ignorés.</CardDescription>
        </CardHeader>
        {!webhooks?.length ? (
          <CardContent>
            <EmptyState icon={Webhook} title="Aucune notification reçue" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Reçue le</TH>
                <TH>Fournisseur</TH>
                <TH>Établissement</TH>
                <TH>Résultat</TH>
              </tr>
            </THead>
            <tbody>
              {webhooks.map((w) => (
                <TR key={w.id}>
                  <TD className="tabular-nums">{formatDateTime(w.received_at)}</TD>
                  <TD>
                    {PROVIDER_LABELS[w.provider] ?? w.provider} {w.mode ? <Badge tone={w.mode === "test" ? "warning" : "success"}>{w.mode === "test" ? "Test" : "Production"}</Badge> : null}
                  </TD>
                  <TD>{w.organization?.name ?? "—"}</TD>
                  <TD>
                    <StatusBadge value={w.processing_status} map={WEBHOOK_STATUS} />
                    {w.error ? <span className="block text-xs text-muted-foreground">{w.error}</span> : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
