import { BellRing, CreditCard, Download, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeeOptions, getStudentFeeTransactions } from "@/features/fee-payments/queries";
import { expireStaleFeePayments } from "@/features/fee-payments/server";
import { requirePortalSection } from "@/features/portal/context";
import { getStudentFinance } from "@/features/portal/queries";
import { todayIn } from "@/lib/dates";
import { INVOICE_PAYMENT_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { GLOBAL_OFF_MESSAGE, methodLabel, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from "@/lib/payments/school-adapters";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Finances" };

const REMINDER_KIND: Record<string, string> = {
  issued: "Facture émise",
  upcoming: "Échéance à venir",
  overdue: "Échéance dépassée",
  manual: "Rappel de l'établissement",
};

/** Situation financière : factures, échéancier, paiements et reçus (jamais restreinte). */
export default async function PortalFinancePage() {
  const { organization, student, status, parent } = await requirePortalSection("finances");
  if (!student) return <EmptyState icon={Wallet} title="Aucun dossier rattaché" />;
  await expireStaleFeePayments(organization.id);
  const supabase = await createClient();
  const [{ invoices, payments, reminders, installments }, options, online, { data: year }] = await Promise.all([
    getStudentFinance(organization.id, student.id),
    getFeeOptions(organization.id),
    getStudentFeeTransactions(organization.id, student.id),
    student.academic_year_id ? supabase.from("academic_years").select("name").eq("id", student.academic_year_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const currency = organization.currency;
  const money = (v: number | string | null) => formatMoney(Number(v ?? 0), currency);
  const today = todayIn(organization.timezone);
  const billed = invoices.filter((i) => i.status !== "cancelled");
  const totalBilled = billed.reduce((sum, i) => sum + Number(i.total ?? 0), 0);
  const totalPaid = billed.reduce((sum, i) => sum + Number(i.paid ?? 0), 0);
  // Bouton « Payer maintenant » : parent, paiement ouvert (plateforme + établissement) et au moins un fournisseur actif.
  const canPay = parent && options.open && options.providers.length > 0;
  const pendingOnline = online.filter((t) => t.status === "PENDING" || t.status === "PROCESSING");
  const doneOnline = online.filter((t) => t.status !== "PENDING" && t.status !== "PROCESSING");

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Finances</h1>
        <p className="text-sm text-muted-foreground">
          {student.first_name} {student.last_name} · {canPay ? "payez en ligne une échéance ou le solde ; le reçu est disponible ici dès la confirmation." : "les paiements sont enregistrés par l'établissement ; le reçu est disponible ici aussitôt."}
        </p>
      </div>

      {parent && options.org_enabled && !options.global_enabled ? <Alert tone="warning">{GLOBAL_OFF_MESSAGE}</Alert> : null}

      <Card className="grid gap-3 p-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr]" data-testid="portal-finance-summary">
        <div className="grid gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Élève</span>
          <span className="font-semibold">
            {student.first_name} {student.last_name}
          </span>
          <span className="text-xs text-muted-foreground">
            {student.matricule}
            {student.class_name ? ` · ${student.class_name}` : ""}
            {year?.name ? ` · ${year.name}` : ""}
          </span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Total facturé</span>
          <span className="text-lg font-bold tabular-nums">{money(totalBilled)}</span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Total payé</span>
          <span className="text-lg font-bold tabular-nums text-success">{money(totalPaid)}</span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">Paiements en attente</span>
          <span className="text-lg font-bold tabular-nums">{pendingOnline.length}</span>
        </div>
      </Card>

      <section aria-label="Synthèse" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="grid gap-1 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Reste à payer</span>
          <span className="text-xl font-bold tabular-nums">{money(status?.balance ?? 0)}</span>
        </Card>
        <Card className="grid gap-1 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Échu non réglé</span>
          <span className={cn("text-xl font-bold tabular-nums", (status?.overdue_amount ?? 0) > 0 ? "text-danger" : "text-success")}>{money(status?.overdue_amount ?? 0)}</span>
        </Card>
        <Card className="col-span-2 grid gap-1 p-3.5 sm:col-span-1">
          <span className="text-xs font-medium text-muted-foreground">Prochaine échéance</span>
          <span className="text-xl font-bold">{status?.next_due_on ? formatDate(status.next_due_on) : "—"}</span>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Factures</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune facture.</p>
          ) : (
            invoices.map((inv) => {
              const plan = installments.filter((i) => i.invoice_id === inv.invoice_id);
              let covered = Number(inv.paid ?? 0);
              return (
                <div key={inv.invoice_id} className="grid gap-3 rounded-xl border border-border p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="grid">
                      <span className="font-semibold">Facture {inv.number}</span>
                      <span className="text-xs text-muted-foreground">Émise le {inv.issued_on ? formatDate(inv.issued_on) : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {inv.is_overdue ? <Badge tone="danger">En retard</Badge> : null}
                      <StatusBadge value={inv.status === "cancelled" ? "cancelled" : (inv.payment_status ?? "unpaid")} map={INVOICE_PAYMENT_STATUS} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Total</dt>
                      <dd className="font-semibold tabular-nums">{money(inv.total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Payé</dt>
                      <dd className="font-semibold tabular-nums text-success">{money(inv.paid)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Reste</dt>
                      <dd className="font-semibold tabular-nums">{money(inv.balance)}</dd>
                    </div>
                  </dl>
                  {plan.length > 0 ? (
                    <ul className="grid grid-cols-1 gap-1.5 text-sm">
                      {plan.map((ins) => {
                        const amount = Number(ins.amount);
                        const paid = covered >= amount;
                        covered = Math.max(0, covered - amount);
                        const late = !paid && ins.due_on < today;
                        return (
                          <li key={ins.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2">
                            <span className="min-w-0 truncate">
                              {ins.label ?? `Échéance ${ins.sequence}`} · {formatDate(ins.due_on)}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="tabular-nums">{money(amount)}</span>
                              <Badge tone={paid ? "success" : late ? "danger" : "neutral"}>{paid ? "Réglée" : late ? "En retard" : "À venir"}</Badge>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <a href={`/api/documents/factures/${inv.invoice_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                      <Download className="size-4" aria-hidden /> Facture (PDF)
                    </a>
                    {canPay && inv.status === "issued" && Number(inv.balance ?? 0) > 0 ? (
                      <Link href={`/portail/finances/payer?facture=${inv.invoice_id}`} className={buttonVariants({ size: "sm" })} data-testid="pay-now">
                        <CreditCard aria-hidden /> PAYER MAINTENANT
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paiements et reçus</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <Receipt className="size-5 shrink-0 text-primary" aria-hidden />
                  <span className="grid min-w-0 flex-1">
                    <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(p.paid_at, "fr-FR", organization.timezone)} · {PAYMENT_METHOD[p.method] ?? p.method}
                      {p.invoice?.number ? ` · facture ${p.invoice.number}` : ""}
                    </span>
                  </span>
                  {p.status === "completed" ? (
                    <a href={`/api/documents/recus/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                      <Download className="size-4" aria-hidden /> Reçu {p.number}
                    </a>
                  ) : (
                    <Badge tone="neutral">Annulé</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {online.length > 0 ? (
        <Card data-testid="portal-online-payments">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-primary" aria-hidden /> Paiements en ligne
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {pendingOnline.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">En attente de confirmation</h3>
                <ul className="grid gap-2">
                  {pendingOnline.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-soft/40 px-3 py-2 text-sm">
                      <span className="grid">
                        <span className="font-semibold tabular-nums">{formatMoney(Number(t.amount), t.currency)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.purpose} · {t.provider_label} · {t.internal_reference}
                        </span>
                      </span>
                      <Link href={`/portail/finances/retour?ref=${t.internal_reference}`} className="text-sm font-semibold text-primary hover:underline">
                        Vérifier le statut
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {doneOnline.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-sm font-semibold">Historique</h3>
                <ul className="divide-y divide-border">
                  {doneOnline.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="grid min-w-0 flex-1">
                        <span className="font-semibold tabular-nums">{formatMoney(Number(t.amount), t.currency)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(t.created_at, "fr-FR", organization.timezone)} · {t.provider_label} · {methodLabel(t.method)} · {t.internal_reference}
                        </span>
                      </span>
                      <Badge tone={PAYMENT_STATUS_TONES[t.status] ?? "neutral"}>{PAYMENT_STATUS_LABELS[t.status] ?? t.status}</Badge>
                      {t.payment_id ? (
                        <a href={`/api/documents/recus/${t.payment_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                          <Download className="size-4" aria-hidden /> Reçu
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {reminders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" aria-hidden /> Rappels reçus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {REMINDER_KIND[r.kind] ?? r.kind} · {formatDateTime(r.sent_at, "fr-FR", organization.timezone)}
                  </span>
                  <span className="font-semibold tabular-nums">{money(r.amount_due)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
