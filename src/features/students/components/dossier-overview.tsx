import { AlertCircle, CalendarCheck, CalendarClock, CheckCircle2, Coins, FileText, Printer, Receipt, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { allocateInstallments, installmentState, type InstallmentState } from "@/features/finance/installments";
import { PAYMENT_METHOD } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Fiche élève : cartes chiffrées, Aperçu, Paiements, Échéancier (présentation, données lues sous RLS). */

export type FinanceKpis = { total: number; paid: number; balance: number; overdue: boolean };

function Kpi({ icon, label, value, tone = "neutral" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "neutral" | "success" | "danger" | "info" }) {
  const toneCls = { neutral: "bg-surface-muted text-muted-foreground", success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" }[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", toneCls)}>{icon}</span>
      <span className="grid min-w-0">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-base font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  );
}

function Ring({ percent, tone }: { percent: number; tone: "success" | "danger" | "neutral" }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = { success: "text-success", danger: "text-danger", neutral: "text-muted-foreground" }[tone];
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-surface-muted" />
        <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" strokeLinecap="round" stroke="currentColor" className={color} strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, percent)) / 100} />
      </svg>
      <span className="text-xs font-bold tabular-nums">{percent}%</span>
    </span>
  );
}

/** Les 5 cartes du haut. Les montants ne sont affichés qu'avec le droit finance.read. */
export function DossierKpis({ finance, presence, currency }: { finance: FinanceKpis | null; presence: { days: number; absences: number } | null; currency: string }) {
  const money = (n: number) => formatMoney(n, currency);
  const rate = finance && finance.total > 0 ? Math.round((finance.paid / finance.total) * 100) : null;
  const cards: ReactNode[] = [];
  if (finance) {
    cards.push(
      <Kpi key="total" icon={<Coins aria-hidden />} label="Total dû" value={money(finance.total)} />,
      <Kpi key="paid" icon={<CheckCircle2 aria-hidden />} label="Déjà payé" value={money(finance.paid)} tone="success" />,
      <Kpi key="balance" icon={<AlertCircle aria-hidden />} label="Reste à payer" value={money(finance.balance)} tone={finance.balance > 0 ? "danger" : "success"} />,
    );
  }
  if (presence) {
    cards.push(<Kpi key="presence" icon={<CalendarCheck aria-hidden />} label="Présences ce mois" value={`${presence.days} jour${presence.days > 1 ? "s" : ""}`} tone="info" />);
  }
  if (finance) {
    cards.push(
      <div key="rate" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <Ring percent={rate ?? 0} tone={rate === null ? "neutral" : finance.overdue ? "danger" : "success"} />
        <span className="grid min-w-0">
          <span className="text-xs text-muted-foreground">Recouvrement</span>
          <span className={cn("text-base font-semibold", rate === null ? "text-muted-foreground" : finance.overdue ? "text-danger" : "text-success")}>
            {rate === null ? "Aucune facture" : finance.overdue ? "En retard" : finance.balance === 0 ? "Soldé" : "À jour"}
          </span>
        </span>
      </div>,
    );
  }
  if (!cards.length) return null;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", cards.length >= 5 ? "lg:grid-cols-5" : cards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")} data-testid="dossier-kpis">
      {cards}
    </div>
  );
}

type ScheduleInvoice = {
  invoice_id: string | null;
  number: string | null;
  label: string | null;
  issued_on: string | null;
  due_on: string | null;
  total: number | null;
  paid: number | null;
  balance: number | null;
  is_overdue: boolean | null;
  installments: { id: string; label: string; due_on: string; amount: number | string; sequence: number }[];
};

const STATE: Record<InstallmentState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Payée", tone: "success" },
  partial: { label: "Partielle", tone: "warning" },
  overdue: { label: "En retard", tone: "danger" },
  upcoming: { label: "À venir", tone: "neutral" },
};

/** Lignes d'échéancier (tranches ; une facture sans échéancier forme une seule ligne). */
function scheduleRows(invoices: ScheduleInvoice[], today: string) {
  return invoices.flatMap((inv) => {
    const paid = Number(inv.paid ?? 0);
    const rows = inv.installments.length
      ? allocateInstallments(paid, inv.installments)
      : [{ id: inv.invoice_id ?? "", label: inv.label ?? "Solde de la facture", dueOn: inv.due_on ?? inv.issued_on ?? today, amount: Number(inv.total ?? 0), remaining: Number(inv.balance ?? 0) }];
    return rows.map((r) => ({ ...r, invoiceId: inv.invoice_id, number: inv.number, state: installmentState(r, today) }));
  });
}

export function ScheduleTab({ invoices, currency, today, cashier }: { invoices: ScheduleInvoice[]; currency: string; today: string; cashier: ReactNode }) {
  const money = (n: number) => formatMoney(n, currency);
  const rows = scheduleRows(invoices, today);
  return (
    <Card className="overflow-hidden" data-testid="schedule-tab">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Échéancier</CardTitle>
        {cashier}
      </CardHeader>
      {rows.length ? (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Échéance</TH>
              <TH>Date limite</TH>
              <TH>Facture</TH>
              <TH className="text-right">Montant</TH>
              <TH className="text-right">Reste</TH>
              <TH>État</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={`${r.invoiceId}-${r.id}`}>
                <TD className="font-medium">{r.label}</TD>
                <TD>{formatDate(r.dueOn, "fr-FR", { dateStyle: "medium" })}</TD>
                <TD>
                  {r.invoiceId ? (
                    <Link href={`/finances/factures/${r.invoiceId}`} className="hover:text-primary">
                      {r.number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-right tabular-nums">{money(r.amount)}</TD>
                <TD className={cn("text-right font-semibold tabular-nums", r.remaining > 0 ? "text-danger" : "text-success")}>{money(r.remaining)}</TD>
                <TD>
                  <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <CardContent>
          <EmptyState icon={CalendarClock} title="Aucune échéance" description="Aucune facture émise pour le moment." />
        </CardContent>
      )}
    </Card>
  );
}

type PaymentRow = {
  id: string;
  number: string;
  amount: number;
  method: string;
  paid_at: string;
  status: string;
  invoice_id: string;
  reference: string | null;
  payer_name: string | null;
  received_by_name: string | null;
};

export function PaymentsTab({ payments, currency, timezone, cashier, canReceipt }: { payments: PaymentRow[]; currency: string; timezone: string; cashier: ReactNode; canReceipt: boolean }) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <Card className="overflow-hidden" data-testid="payments-tab">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Paiements</CardTitle>
        {cashier}
      </CardHeader>
      {payments.length ? (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Reçu</TH>
              <TH>Date</TH>
              <TH>Mode</TH>
              <TH>Versé par</TH>
              <TH className="text-right">Montant</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {payments.map((p) => (
              <TR key={p.id} className={p.status === "cancelled" ? "opacity-60" : undefined}>
                <TD className="font-medium">
                  {p.number}
                  {p.status === "cancelled" ? (
                    <Badge tone="danger" className="ml-2">
                      Annulé
                    </Badge>
                  ) : null}
                </TD>
                <TD>{formatDateTime(p.paid_at, "fr-FR", timezone)}</TD>
                <TD>
                  {PAYMENT_METHOD[p.method] ?? p.method}
                  {p.reference ? <span className="block text-xs text-muted-foreground">{p.reference}</span> : null}
                </TD>
                <TD>{p.payer_name ?? "—"}</TD>
                <TD className="text-right font-semibold tabular-nums">{money(Number(p.amount))}</TD>
                <TD className="text-right">
                  <span className="inline-flex gap-1">
                    {canReceipt && p.status !== "cancelled" ? (
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/api/documents/recus/${p.id}`} target="_blank" rel="noopener" aria-label={`Reçu ${p.number}`}>
                          <Printer aria-hidden /> Reçu
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/finances/factures/${p.invoice_id}`}>
                        <FileText aria-hidden /> Facture
                      </Link>
                    </Button>
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <CardContent>
          <EmptyState icon={Receipt} title="Aucun paiement" description="Les encaissements apparaîtront ici avec leur reçu." />
        </CardContent>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

/** Aperçu : l'essentiel du dossier sur une page. */
export function OverviewTab({
  enrollment,
  guardians,
  contact,
  finance,
  presence,
  labels,
}: {
  enrollment: { klass: string | null; year: string | null; program: string | null; reference: string | null } | null;
  guardians: { name: string; relationship: string | null; phone: string | null; primary: boolean }[];
  contact: { phone: string | null; email: string | null; address: string | null };
  finance: { lastPayment: { number: string; amount: number; at: string; id: string } | null; next: { label: string; dueOn: string; remaining: number; overdue: boolean } | null; currency: string; timezone: string; canReceipt: boolean } | null;
  presence: { days: number; absences: number } | null;
  labels: { klass: string; year: string; guardians: string };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="overview-tab">
      <Card>
        <CardHeader>
          <CardTitle>Inscription en cours</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollment ? (
            <>
              <Row label={labels.klass} value={enrollment.klass} />
              {enrollment.program ? <Row label="Filière / formation" value={enrollment.program} /> : null}
              <Row label={labels.year} value={enrollment.year} />
              <Row label="Référence" value={enrollment.reference} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune inscription validée.</p>
          )}
        </CardContent>
      </Card>
      {finance ? (
        <Card>
          <CardHeader>
            <CardTitle>Paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              label="Prochaine échéance"
              value={
                finance.next ? (
                  <span className={finance.next.overdue ? "text-danger" : undefined}>
                    {finance.next.label} · {formatMoney(finance.next.remaining, finance.currency)} · {formatDate(finance.next.dueOn, "fr-FR", { dateStyle: "medium" })}
                  </span>
                ) : (
                  "Aucune"
                )
              }
            />
            <Row
              label="Dernier paiement"
              value={
                finance.lastPayment ? (
                  <span>
                    {formatMoney(finance.lastPayment.amount, finance.currency)} · {formatDateTime(finance.lastPayment.at, "fr-FR", finance.timezone)}
                    {finance.canReceipt ? (
                      <a href={`/api/documents/recus/${finance.lastPayment.id}`} target="_blank" rel="noopener" className="ml-2 text-primary hover:underline">
                        Reçu
                      </a>
                    ) : null}
                  </span>
                ) : (
                  "Aucun"
                )
              }
            />
            <div className="mt-3 flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="?onglet=echeancier" scroll={false}>
                  <CalendarClock aria-hidden /> Échéancier
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="?onglet=paiements" scroll={false}>
                  <Receipt aria-hidden /> Paiements
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{labels.guardians}</CardTitle>
          <Users className="size-4 text-muted-foreground" aria-hidden />
        </CardHeader>
        <CardContent>
          {guardians.length ? (
            guardians.map((g) => (
              <Row
                key={`${g.name}-${g.phone}`}
                label={`${g.name}${g.primary ? " (principal)" : ""}`}
                value={
                  <span>
                    {g.relationship ? <span className="text-muted-foreground">{g.relationship} · </span> : null}
                    {g.phone ?? "—"}
                  </span>
                }
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucun parent ou tuteur enregistré.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Contact et présences</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Téléphone" value={contact.phone} />
          <Row label="E-mail" value={contact.email} />
          <Row label="Adresse" value={contact.address} />
          {presence ? (
            <>
              <Row label="Jours de présence ce mois" value={presence.days} />
              <Row label="Absences ce mois" value={<span className={presence.absences ? "text-danger" : undefined}>{presence.absences}</span>} />
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
