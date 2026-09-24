import { Ban, BellRing, FileDown, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelInvoice, cancelPayment, sendReminder } from "@/features/finance/actions";
import { PaymentDialog } from "@/features/finance/components/payment-dialog";
import { getInvoice } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { INVOICE_PAYMENT_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";
import { AnimatedMoney } from "@/components/motion/animated-counter";

export const metadata: Metadata = { title: "Facture" };

const REMINDER_KIND: Record<string, string> = { issued: "Facture émise", upcoming: "Échéance proche", overdue: "Impayé", manual: "Rappel manuel" };

export default async function InvoicePage({ params, searchParams }: PageProps<"/finances/factures/[id]">) {
  const context = await requirePermission("finance.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const result = await getInvoice(context.organization.id, id);
  if (!result) notFound();
  const { invoice, balance, reminders } = result;
  const money = (n: number | string | null | undefined) => formatMoney(Number(n ?? 0), context.organization.currency);
  const issued = invoice.status === "issued";
  const remaining = Number(balance?.balance ?? 0);
  const payments = [...invoice.payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/finances?onglet=factures" className="hover:text-primary">
          Finances
        </Link>{" "}
        / <span className="text-foreground">{invoice.number}</span>
      </nav>
      {query.creee ? <Alert tone="success">Facture émise : la famille a été notifiée.</Alert> : null}
      {invoice.status === "cancelled" ? <Alert tone="warning">Facture annulée : {invoice.cancelled_reason}</Alert> : null}
      <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{invoice.number}</h1>
            {balance?.payment_status ? <StatusBadge value={balance.payment_status} map={INVOICE_PAYMENT_STATUS} /> : null}
            {balance?.is_overdue ? <Badge tone="danger">En retard</Badge> : null}
          </div>
          {invoice.student ? (
            <Link href={`/eleves/${invoice.student.id}?onglet=finance`} className="text-sm font-medium hover:text-primary">
              {invoice.student.last_name} {invoice.student.first_name} · {invoice.student.matricule}
            </Link>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Émise le {formatDate(invoice.issued_on, "fr-FR", { dateStyle: "long" })}
            {balance?.next_due_on ? ` · prochaine échéance le ${formatDate(balance.next_due_on, "fr-FR", { dateStyle: "long" })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {issued && can(context, "finance.payments.create") ? (
            <PaymentDialog invoiceId={invoice.id} balance={remaining} currency={context.organization.currency} />
          ) : null}
          {can(context, "documents.generate") ? (
            <Button asChild variant="secondary">
              <a href={`/api/documents/factures/${invoice.id}`} target="_blank" rel="noopener">
                <FileDown aria-hidden /> Facture PDF
              </a>
            </Button>
          ) : null}
          {issued && remaining > 0 && can(context, "finance.invoices.manage") ? (
            <ConfirmAction
              trigger={
                <Button variant="secondary">
                  <BellRing aria-hidden /> Relancer
                </Button>
              }
              title="Envoyer un rappel à la famille ?"
              confirmLabel="Envoyer"
              action={sendReminder}
              fields={{ invoice_id: invoice.id }}
            />
          ) : null}
          {issued && Number(balance?.paid ?? 0) === 0 && can(context, "finance.invoices.manage") ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" className="text-danger">
                  <Ban aria-hidden /> Annuler
                </Button>
              }
              title="Annuler la facture ?"
              confirmLabel="Annuler la facture"
              tone="danger"
              action={cancelInvoice}
              fields={{ invoice_id: invoice.id }}
              reason={{ label: "Motif", required: true }}
            />
          ) : null}
        </div>
      </Card>

      <div className="stagger grid grid-cols-3 gap-3">
        {(
          [
            ["Total", Number(invoice.total), ""],
            ["Payé", Number(balance?.paid ?? 0), "text-success"],
            ["Reste dû", remaining, remaining > 0 ? "text-danger" : "text-success"],
          ] as const
        ).map(([label, value, tone]) => (
          <Card key={label} className="grid gap-1 p-4">
            <span className="text-sm text-muted-foreground">{label}</span>
            <strong className={`font-display text-xl tabular-nums ${tone}`}>
              <AnimatedMoney value={value} currency={context.organization.currency} />
            </strong>
          </Card>
        ))}
      </div>
      {Number(invoice.total) > 0 ? (
        <div className="grid gap-1.5" aria-hidden>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full origin-left animate-[bar-grow-x_0.9s_var(--ease-out)_both] rounded-full bg-success"
              style={{ width: `${Math.min(100, (Number(balance?.paid ?? 0) / Number(invoice.total)) * 100)}%` }}
            />
          </div>
          <p className="text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(Math.min(100, (Number(balance?.paid ?? 0) / Number(invoice.total)) * 100))} % réglé
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Détail</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <tr>
                <TH>Désignation</TH>
                <TH className="text-right">Remise</TH>
                <TH className="text-right">Montant</TH>
              </tr>
            </THead>
            <tbody>
              {[...invoice.invoice_lines].sort((a, b) => a.sort_order - b.sort_order).map((line) => (
                <TR key={line.id}>
                  <TD>
                    {line.description}
                    {line.discount_reason ? <span className="block text-xs text-muted-foreground">{line.discount_reason}</span> : null}
                  </TD>
                  <TD className="text-right tabular-nums">{Number(line.discount_amount) ? money(line.discount_amount) : "—"}</TD>
                  <TD className="text-right font-semibold tabular-nums">{money(line.amount)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          {invoice.installments.length ? (
            <CardContent className="grid gap-2 pt-4">
              <p className="text-sm font-semibold">Échéancier</p>
              <ul className="grid gap-1 text-sm">
                {[...invoice.installments].sort((a, b) => a.sequence - b.sequence).map((i) => (
                  <li key={i.id} className="flex justify-between rounded-lg bg-muted/40 px-3 py-1.5">
                    <span>
                      {i.label} · {formatDate(i.due_on, "fr-FR", { dateStyle: "short" })}
                    </span>
                    <span className="tabular-nums">{money(i.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>

        <div className="grid content-start gap-5">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Paiements</CardTitle>
            </CardHeader>
            {payments.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">Aucun paiement.</p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span className="grid">
                      <span className={p.status === "cancelled" ? "font-semibold line-through" : "font-semibold"}>
                        {p.number} · {money(p.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(p.paid_at, "fr-FR", context.organization.timezone)} · {PAYMENT_METHOD[p.method] ?? p.method}
                        {p.received_by_name ? ` · reçu par ${p.received_by_name}` : ""}
                        {p.status === "cancelled" ? ` · annulé : ${p.cancelled_reason}` : ""}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      {can(context, "documents.generate") && p.status === "completed" ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/api/documents/recus/${p.id}`} target="_blank" rel="noopener">
                            <Receipt aria-hidden /> Reçu
                          </a>
                        </Button>
                      ) : null}
                      {can(context, "finance.payments.cancel") && p.status === "completed" ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger">
                              Annuler
                            </Button>
                          }
                          title={`Annuler le paiement ${p.number} ?`}
                          description="Le paiement reste dans l'historique ; le solde et les restrictions sont recalculés immédiatement."
                          confirmLabel="Annuler le paiement"
                          tone="danger"
                          action={cancelPayment}
                          fields={{ payment_id: p.id }}
                          reason={{ label: "Motif", required: true }}
                        />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notifications et rappels</CardTitle>
            </CardHeader>
            <CardContent>
              {reminders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun rappel envoyé.</p>
              ) : (
                <ul className="grid gap-1 text-sm">
                  {reminders.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span>{REMINDER_KIND[r.kind] ?? r.kind}</span>
                      <span className="text-muted-foreground">
                        {formatDateTime(r.sent_at, "fr-FR", context.organization.timezone)} · {r.recipients} dest.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
