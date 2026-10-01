import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { TabNav, TabPanel } from "@/components/shared/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getFeeAdminState, getFeeStats, listFeeEvents, listFeeRefunds, listFeeTransactions, listFeeWebhooks } from "@/features/fee-payments/queries";
import { expireStaleFeePayments } from "@/features/fee-payments/server";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { todayIn } from "@/lib/dates";
import { GLOBAL_OFF_MESSAGE, methodLabel, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES, SCHOOL_METHODS } from "@/lib/payments/school-adapters";
import { formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiements en ligne" };

const TABS = ["transactions", "a-traiter", "remboursements", "notifications", "journal"] as const;
type Tab = (typeof TABS)[number];
const SELECT = "h-10 rounded-xl border border-border bg-surface px-3 text-sm";
const REFUND_STATUS: Record<string, { label: string; tone: "info" | "success" | "neutral" | "danger" }> = {
  requested: { label: "Demandé", tone: "info" },
  completed: { label: "Effectué", tone: "success" },
  rejected: { label: "Refusé", tone: "neutral" },
  failed: { label: "Échoué", tone: "danger" },
};
const HOOK_STATUS: Record<string, string> = { received: "Reçue", processed: "Traitée", duplicate: "Doublon ignoré", ignored: "En attente (ignorée)", rejected: "Rejetée", error: "Erreur" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Comptabilité › Paiements en ligne : transactions, totaux, cas à traiter, remboursements, notifications, journal. */
export default async function OnlinePaymentsPage({ searchParams }: PageProps<"/finances/paiements-en-ligne">) {
  const context = await requirePermission("finance.read");
  const org = context.organization;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(one(sp.onglet)) ? (one(sp.onglet) as Tab) : "transactions";
  const today = todayIn(org.timezone);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.du)) ? one(sp.du) : `${today.slice(0, 4)}-01-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.au)) ? one(sp.au) : today;
  const filters = { from, to, status: one(sp.statut) || undefined, provider: one(sp.fournisseur) || undefined, method: one(sp.moyen) || undefined, q: one(sp.q) || undefined };
  await expireStaleFeePayments(org.id);
  const [state, stats, transactions, review, refunds, webhooks, events] = await Promise.all([
    getFeeAdminState(org.id),
    getFeeStats(org.id, from, to),
    tab === "transactions" ? listFeeTransactions(org.id, filters) : Promise.resolve([]),
    listFeeTransactions(org.id, { review: true }, 100),
    tab === "remboursements" ? listFeeRefunds(org.id) : Promise.resolve([]),
    tab === "notifications" ? listFeeWebhooks(org.id) : Promise.resolve([]),
    tab === "journal" ? listFeeEvents(org.id) : Promise.resolve([]),
  ]);
  const money = (v: number | string, currency = org.currency) => formatMoney(Number(v ?? 0), currency);
  const qs = (t: Tab) => `/finances/paiements-en-ligne?onglet=${t}`;
  const rows = tab === "a-traiter" ? review : transactions;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Paiements en ligne"
        description="Paiements des familles confirmés par les fournisseurs et enregistrés automatiquement en comptabilité (reçu, solde, notifications)."
        actions={
          can(context, "finance.online.manage") ? (
            <Link href="/parametres/paiements" className={buttonVariants({ variant: "secondary" })}>
              <Settings2 aria-hidden /> Paramètres
            </Link>
          ) : null
        }
      />
      {!state.globalEnabled ? <Alert tone="warning">{GLOBAL_OFF_MESSAGE}</Alert> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Totaux" data-testid="fee-stats">
        {(
          [
            ["Encaissé (net)", stats ? money(stats.collected) : "—", "text-success"],
            ["Réussis", stats?.success ?? 0, ""],
            ["En attente", stats?.pending ?? 0, ""],
            ["Échoués / annulés / expirés", stats?.failed ?? 0, ""],
            ["Remboursé", stats ? money(stats.refunded) : "—", ""],
            ["À traiter", stats?.review ?? 0, (stats?.review ?? 0) > 0 ? "text-warning" : ""],
          ] as const
        ).map(([label, value, tone]) => (
          <Card key={label} className="grid gap-1 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className={`text-lg font-bold tabular-nums ${tone}`}>{value}</span>
          </Card>
        ))}
      </section>
      {stats && (stats.by_provider.length > 0 || stats.by_method.length > 0) ? (
        <section className="grid gap-3 md:grid-cols-2" aria-label="Répartition">
          <Card className="grid gap-2 p-4">
            <h2 className="text-sm font-semibold">Par fournisseur</h2>
            {stats.by_provider.map((p) => (
              <div key={p.label} className="flex justify-between text-sm">
                <span>
                  {p.label} <span className="text-xs text-muted-foreground">({p.count})</span>
                </span>
                <span className="font-semibold tabular-nums">{money(p.amount)}</span>
              </div>
            ))}
          </Card>
          <Card className="grid gap-2 p-4">
            <h2 className="text-sm font-semibold">Par moyen de paiement</h2>
            {stats.by_method.map((m) => (
              <div key={m.method} className="flex justify-between text-sm">
                <span>
                  {methodLabel(m.method)} <span className="text-xs text-muted-foreground">({m.count})</span>
                </span>
                <span className="font-semibold tabular-nums">{money(m.amount)}</span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <TabNav
        label="Paiements en ligne"
        active={tab}
        tabs={[
          { key: "transactions", label: "Transactions", href: qs("transactions") },
          { key: "a-traiter", label: "À traiter (rapprochement)", href: qs("a-traiter"), count: review.length },
          { key: "remboursements", label: "Remboursements", href: qs("remboursements") },
          { key: "notifications", label: "Notifications reçues", href: qs("notifications") },
          { key: "journal", label: "Journal", href: qs("journal") },
        ]}
      />
      <TabPanel active={tab}>
        {tab === "transactions" || tab === "a-traiter" ? (
          <div className="grid gap-4">
            {tab === "transactions" ? (
              <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Filtres">
                <input type="hidden" name="onglet" value="transactions" />
                <label className="grid gap-1 text-xs font-medium">
                  Du
                  <Input type="date" name="du" defaultValue={from} className="w-40" />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Au
                  <Input type="date" name="au" defaultValue={to} className="w-40" />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Statut
                  <select name="statut" defaultValue={filters.status ?? ""} className={SELECT}>
                    <option value="">Tous</option>
                    {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Fournisseur
                  <select name="fournisseur" defaultValue={filters.provider ?? ""} className={SELECT}>
                    <option value="">Tous</option>
                    {state.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Moyen
                  <select name="moyen" defaultValue={filters.method ?? ""} className={SELECT}>
                    <option value="">Tous</option>
                    {SCHOOL_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Référence
                  <Input name="q" defaultValue={filters.q ?? ""} placeholder="NEO-… ou réf. fournisseur" className="w-52" />
                </label>
                <Button type="submit" variant="secondary">
                  Filtrer
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Paiements à vérifier : montant, devise ou référence différents de la demande, confirmation reçue alors que la facture ne pouvait plus la recevoir… Ouvrez chaque cas pour le traiter (vérifier auprès du fournisseur, rembourser ou marquer traité).
              </p>
            )}
            {rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{tab === "a-traiter" ? "Aucun cas à traiter." : "Aucune transaction sur cette période."}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <Table data-testid="fee-transactions">
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Élève</TH>
                      <TH>Motif</TH>
                      <TH className="text-right">Montant</TH>
                      <TH>Fournisseur</TH>
                      <TH>Statut</TH>
                      <TH>Reçu</TH>
                    </TR>
                  </THead>
                  <tbody>
                    {rows.map((t) => {
                      const student = t.student as unknown as { first_name: string; last_name: string; matricule: string } | null;
                      const payment = t.payment as unknown as { number: string } | null;
                      return (
                        <TR key={t.id}>
                          <TD className="whitespace-nowrap text-xs">{formatDateTime(t.created_at, "fr-FR", org.timezone)}</TD>
                          <TD>
                            <Link href={`/finances/paiements-en-ligne/${t.id}`} className="font-semibold text-primary hover:underline">
                              {student ? `${student.first_name} ${student.last_name}` : "—"}
                            </Link>
                            <span className="block text-xs text-muted-foreground">{t.internal_reference}</span>
                          </TD>
                          <TD className="max-w-56 truncate text-xs">{t.purpose}</TD>
                          <TD className="text-right font-semibold tabular-nums">{money(t.amount, t.currency)}</TD>
                          <TD className="text-xs">
                            {t.provider_label}
                            <span className="block text-muted-foreground">
                              {methodLabel(t.method)}
                              {t.mode === "test" ? " · TEST" : ""}
                            </span>
                          </TD>
                          <TD>
                            <Badge tone={PAYMENT_STATUS_TONES[t.status] ?? "neutral"}>{PAYMENT_STATUS_LABELS[t.status] ?? t.status}</Badge>
                            {t.needs_review ? (
                              <Badge tone="warning" className="ml-1">
                                À traiter
                              </Badge>
                            ) : null}
                          </TD>
                          <TD className="text-xs">
                            {t.payment_id && payment ? (
                              <a href={`/api/documents/recus/${t.payment_id}`} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                                {payment.number}
                              </a>
                            ) : (
                              "—"
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </div>
        ) : null}

        {tab === "remboursements" ? (
          refunds.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune demande de remboursement. Elles se font depuis la fiche d&apos;un paiement confirmé.</p>
          ) : (
            <ul className="grid gap-2" data-testid="fee-refunds">
              {refunds.map((r) => {
                const tx = r.tx as unknown as { internal_reference: string; currency: string; provider_label: string; student: { first_name: string; last_name: string } | null } | null;
                return (
                  <li key={r.id}>
                    <Link href={`/finances/paiements-en-ligne/${r.transaction_id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 text-sm hover:border-primary/50">
                      <span className="grid min-w-0 flex-1">
                        <span className="font-semibold">
                          {money(r.amount, tx?.currency)} — {tx?.student ? `${tx.student.first_name} ${tx.student.last_name}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tx?.internal_reference} · {tx?.provider_label} · {r.reason} · {r.mode === "automatic" ? "automatique" : "manuel"}
                          {r.external_reference ? ` · réf. ${r.external_reference}` : ""}
                        </span>
                      </span>
                      <Badge tone={REFUND_STATUS[r.status]?.tone ?? "neutral"}>{REFUND_STATUS[r.status]?.label ?? r.status}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {tab === "notifications" ? (
          webhooks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune notification reçue des fournisseurs.</p>
          ) : (
            <ul className="grid gap-2 text-sm" data-testid="fee-webhooks">
              {webhooks.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <span className="grid">
                    <span className="font-semibold">{(w.provider as unknown as { label: string } | null)?.label ?? "Fournisseur"}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(w.received_at, "fr-FR", org.timezone)} · {w.provider_transaction_id ?? "identifiant absent"}
                      {w.error ? ` · ${w.error}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={w.processing_status === "processed" ? "success" : w.processing_status === "error" || w.processing_status === "rejected" ? "danger" : "neutral"}>{HOOK_STATUS[w.processing_status] ?? w.processing_status}</Badge>
                    {w.transaction_id ? (
                      <Link href={`/finances/paiements-en-ligne/${w.transaction_id}`} className="text-xs font-semibold text-primary hover:underline">
                        Voir
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "journal" ? (
          events.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Journal vide.</p>
          ) : (
            <ol className="grid gap-1.5 text-sm" data-testid="fee-journal">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 last:border-0">
                  <span>
                    {e.transaction_id ? (
                      <Link href={`/finances/paiements-en-ligne/${e.transaction_id}`} className="hover:underline">
                        {e.summary}
                      </Link>
                    ) : (
                      e.summary
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.created_at, "fr-FR", org.timezone)}</span>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </TabPanel>
    </div>
  );
}
