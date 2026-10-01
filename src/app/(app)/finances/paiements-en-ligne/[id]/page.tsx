import { CheckCheck, Download, RefreshCcw, SearchCheck, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { completeFeeRefund, markFeeReviewed, reconcileFeeTransaction, rejectFeeRefund, requestFeeRefund } from "@/features/fee-payments/actions";
import { FeeForm } from "@/features/fee-payments/components/fee-form";
import { getFeeTransaction } from "@/features/fee-payments/queries";
import { schoolAdapter } from "@/features/fee-payments/server";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { methodLabel, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from "@/lib/payments/school-adapters";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Paiement en ligne" };

const REFUND_STATUS: Record<string, string> = { requested: "Demandé", completed: "Effectué", rejected: "Refusé", failed: "Échoué" };

export default async function OnlinePaymentPage({ params }: PageProps<"/finances/paiements-en-ligne/[id]">) {
  const context = await requirePermission("finance.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = context.organization;
  const data = await getFeeTransaction(org.id, id);
  if (!data) notFound();
  const { tx, events, refunds, webhooks } = data;
  const adapter = await schoolAdapter(tx.adapter);
  const student = tx.student as unknown as { first_name: string; last_name: string; matricule: string } | null;
  const payment = tx.payment as unknown as { number: string; status: string; balance_after: number | null } | null;
  const invoice = tx.invoice as unknown as { number: string; total: number; currency: string } | null;
  const money = (v: number | string) => formatMoney(Number(v ?? 0), tx.currency);
  const refundable = (tx.status === "SUCCESS" || tx.status === "PARTIALLY_REFUNDED") && Number(tx.amount) > Number(tx.refunded_amount);
  const canCreate = can(context, "finance.payments.create");
  const canCancel = can(context, "finance.payments.cancel");
  const automatic = adapter?.refunds === "automatic";
  const rows: [string, React.ReactNode][] = [
    ["Élève", student ? `${student.first_name} ${student.last_name} (${student.matricule})` : "—"],
    ["Motif", tx.purpose],
    ["Facture", invoice ? `${invoice.number} — total ${money(invoice.total)}` : "—"],
    ["Montant", money(tx.amount)],
    ["Fournisseur", `${tx.provider_label}${tx.mode === "test" ? " (MODE TEST)" : ""}`],
    ["Moyen", methodLabel(tx.method)],
    ["Référence NeoScool", tx.internal_reference],
    ["Référence fournisseur", tx.provider_transaction_id ?? "—"],
    ["Créée le", formatDateTime(tx.created_at, "fr-FR", org.timezone)],
    ["Confirmée le", tx.confirmed_at ? formatDateTime(tx.confirmed_at, "fr-FR", org.timezone) : "—"],
    ["Expire le", formatDateTime(tx.expires_at, "fr-FR", org.timezone)],
    ["Remboursé", money(tx.refunded_amount)],
  ];

  return (
    <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-6 [&>*]:min-w-0">
      <Link href="/finances/paiements-en-ligne" className="text-sm font-semibold text-primary hover:underline">
        ← Paiements en ligne
      </Link>
      <PageHeader title={`Paiement ${tx.internal_reference}`} description={`${money(tx.amount)} · ${tx.purpose}`} />
      <div className="flex flex-wrap gap-2" data-testid="fee-tx-status">
        <Badge tone={PAYMENT_STATUS_TONES[tx.status] ?? "neutral"}>{PAYMENT_STATUS_LABELS[tx.status] ?? tx.status}</Badge>
        {tx.needs_review ? <Badge tone="warning">À traiter</Badge> : null}
        {tx.mode === "test" ? <Badge tone="warning">MODE TEST</Badge> : null}
      </div>
      {tx.needs_review && tx.review_reason ? <Alert tone="warning" title="Cas à traiter">{tx.review_reason}</Alert> : null}
      {tx.failure_reason && !["SUCCESS", "REFUNDED", "PARTIALLY_REFUNDED"].includes(tx.status) ? <Alert tone="info">{tx.failure_reason}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="grid">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comptabilité</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {payment && tx.payment_id ? (
              <>
                <p>
                  Paiement enregistré : reçu <strong>{payment.number}</strong>
                  {payment.status === "cancelled" ? " (annulé)" : ""} · reste dû après paiement : {money(payment.balance_after ?? 0)}.
                </p>
                <a href={`/api/documents/recus/${tx.payment_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline" data-testid="fee-tx-receipt">
                  <Download className="size-4" aria-hidden /> Reçu PDF {payment.number}
                </a>
              </>
            ) : (
              <p className="text-muted-foreground">Aucune écriture : un paiement n&apos;est enregistré qu&apos;après confirmation du fournisseur vérifiée par le serveur.</p>
            )}
            <FeeForm action={reconcileFeeTransaction} className="grid gap-2" showSuccess>
              <input type="hidden" name="id" value={tx.id} />
              <SubmitButton variant="secondary" pendingLabel="Vérification…" disabled={!tx.provider_transaction_id}>
                <SearchCheck aria-hidden /> Vérifier auprès du fournisseur
              </SubmitButton>
            </FeeForm>
            {tx.needs_review && canCreate ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <CheckCheck aria-hidden /> Marquer comme traité
                  </Button>
                }
                title="Marquer ce cas comme traité"
                description="Indiquez ce qui a été fait (remboursement, affectation manuelle, contact du fournisseur…). La trace est conservée."
                confirmLabel="Marquer traité"
                action={markFeeReviewed}
                fields={{ id: tx.id }}
              >
                <FormField id="review-note" label="Comment le cas a été traité *">
                  <Input id="review-note" name="note" required minLength={3} maxLength={200} />
                </FormField>
              </ConfirmAction>
            ) : null}
            {refundable && canCreate ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary" data-testid="fee-refund-request">
                    <Undo2 aria-hidden /> DEMANDER UN REMBOURSEMENT
                  </Button>
                }
                title="Demander un remboursement"
                description={`Maximum : ${money(Number(tx.amount) - Number(tx.refunded_amount))}. La demande doit ensuite être validée par une personne habilitée.`}
                confirmLabel="Demander"
                action={requestFeeRefund}
                fields={{ id: tx.id }}
              >
                <FormField id="refund-amount" label="Montant *">
                  <Input id="refund-amount" name="amount" inputMode="numeric" required defaultValue={String(Number(tx.amount) - Number(tx.refunded_amount))} />
                </FormField>
                <FormField id="refund-reason" label="Motif *">
                  <Input id="refund-reason" name="reason" required minLength={3} maxLength={500} />
                </FormField>
              </ConfirmAction>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Remboursements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {refunds.map((r) => (
              <div key={r.id} className="grid gap-3 rounded-2xl border border-border p-4 text-sm" data-testid="fee-refund">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{money(r.amount)}</strong> — {r.reason}
                  </span>
                  <Badge tone={r.status === "completed" ? "success" : r.status === "requested" ? "info" : "neutral"}>{REFUND_STATUS[r.status] ?? r.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Demandé le {formatDateTime(r.requested_at, "fr-FR", org.timezone)}
                  {r.processed_at ? ` · traité le ${formatDateTime(r.processed_at, "fr-FR", org.timezone)} (${r.mode === "automatic" ? "automatique" : "manuel"})` : ""}
                  {r.external_reference ? ` · réf. ${r.external_reference}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                {r.status === "requested" && canCancel ? (
                  <div className="flex flex-wrap gap-2">
                    {automatic ? (
                      <FeeForm action={completeFeeRefund}>
                        <input type="hidden" name="refund" value={r.id} />
                        <input type="hidden" name="mode" value="automatic" />
                        <SubmitButton pendingLabel="Remboursement…" data-testid="fee-refund-auto">
                          <RefreshCcw aria-hidden /> REMBOURSER (automatique)
                        </SubmitButton>
                      </FeeForm>
                    ) : null}
                    <ConfirmAction
                      trigger={
                        <Button variant={automatic ? "secondary" : "primary"} data-testid="fee-refund-manual">
                          <RefreshCcw aria-hidden /> REMBOURSER {automatic ? "(manuel)" : ""}
                        </Button>
                      }
                      title="Enregistrer le remboursement"
                      description={`Effectuez le remboursement chez ${tx.provider_label} (ou en espèces), puis indiquez sa référence. La comptabilité est mise à jour automatiquement.`}
                      confirmLabel="Enregistrer le remboursement"
                      action={completeFeeRefund}
                      fields={{ refund: r.id, mode: "manual" }}
                    >
                      <FormField id={`ext-${r.id}`} label="Référence du remboursement *">
                        <Input id={`ext-${r.id}`} name="external_reference" required minLength={3} maxLength={120} />
                      </FormField>
                      <FormField id={`note-${r.id}`} label="Note">
                        <Input id={`note-${r.id}`} name="note" maxLength={500} />
                      </FormField>
                    </ConfirmAction>
                    <ConfirmAction
                      trigger={<Button variant="ghost">Refuser</Button>}
                      title="Refuser cette demande ?"
                      confirmLabel="Refuser"
                      tone="danger"
                      action={rejectFeeRefund}
                      fields={{ refund: r.id }}
                      reason={{ label: "Motif du refus", required: true }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative grid gap-3 border-l border-border pl-4 text-sm" data-testid="fee-tx-events">
            {events.map((e) => (
              <li key={e.id} className="grid">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-surface bg-primary" aria-hidden />
                <span>{e.summary}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at, "fr-FR", org.timezone)}</span>
              </li>
            ))}
          </ol>
          {webhooks.length > 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Notifications reçues du fournisseur : {webhooks.length} ({webhooks.map((w) => w.processing_status).join(", ")}).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
