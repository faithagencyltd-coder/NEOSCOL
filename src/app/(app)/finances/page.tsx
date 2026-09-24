import { Archive, ArchiveRestore, Ban, BellRing, FilePlus2, Paperclip, Pencil, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav, TabPanel } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  cancelExpense,
  createExpenseCategory,
  createInvoice,
  deleteExpense,
  deleteFeeRate,
  saveFeeType,
  sendReminder,
  sendReminders,
  setExpenseArchived,
  setFeeTypeActive,
} from "@/features/finance/actions";
import { ExpenseDialog } from "@/features/finance/components/expense-dialog";
import { FeeRateDialog } from "@/features/finance/components/fee-rate-dialog";
import {
  FINANCE_PAGE_SIZE,
  getFeeSetup,
  getFinanceSummary,
  listExpenseCategories,
  listExpenses,
  listFeeTypes,
  listInvoices,
  listOutstandingBalances,
  listPayments,
  listReminders,
  listStudentsForInvoice,
} from "@/features/finance/queries";
import { isIsoDate, todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { INVOICE_PAYMENT_STATUS, PAYMENT_METHOD } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid, pageParam, param } from "@/lib/utils/search-params";
import { AnimatedMoney } from "@/components/motion/animated-counter";

export const metadata: Metadata = { title: "Finances" };

type Params = Record<string, string | string[] | undefined>;

const FEE_CATEGORY: Record<string, string> = {
  registration: "Inscription",
  tuition: "Scolarité",
  training: "Formation",
  exam: "Examen",
  uniform: "Tenue",
  transport: "Transport",
  canteen: "Cantine",
  supplies: "Fournitures",
  other: "Autre",
};

const REMINDER_KIND: Record<string, string> = { issued: "Facture émise", upcoming: "Échéance proche", overdue: "Impayé", manual: "Rappel manuel" };

export default async function FinancePage({ searchParams }: PageProps<"/finances">) {
  const context = await requireOrganization();
  const canRead = can(context, "finance.read");
  const canExpenses = canAny(context, ["finance.expenses.read", "finance.expenses.manage"]);
  if (!canRead && !canExpenses) notFound();
  const params = await searchParams;
  const tabs = [
    ...(canRead ? [{ key: "synthese", label: "Synthèse", href: "/finances?onglet=synthese" }] : []),
    ...(canRead ? [{ key: "factures", label: "Factures", href: "/finances?onglet=factures" }] : []),
    ...(canRead ? [{ key: "paiements", label: "Paiements", href: "/finances?onglet=paiements" }] : []),
    ...(canExpenses ? [{ key: "depenses", label: "Dépenses", href: "/finances?onglet=depenses" }] : []),
    ...(canRead ? [{ key: "impayes", label: "Impayés et reliquats", href: "/finances?onglet=impayes" }] : []),
    ...(canRead ? [{ key: "rappels", label: "Rappels d'impayés", href: "/finances?onglet=rappels" }] : []),
    ...(canRead ? [{ key: "tarifs", label: "Frais et tarifs", href: "/finances?onglet=tarifs" }] : []),
  ];
  const requested = param(params, "onglet");
  const tab = tabs.some((t) => t.key === requested) ? requested! : tabs[0]!.key;
  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Administration</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Finances</h1>
          <p className="text-sm text-muted-foreground">Factures, encaissements, reçus, dépenses et relances — soldes calculés en base.</p>
        </div>
        {can(context, "finance.invoices.manage") ? <NewInvoiceButton organizationId={context.organization.id} today={todayIn(context.organization.timezone)} /> : null}
      </div>
      <TabNav tabs={tabs} active={tab} label="Rubriques financières" />
      <TabPanel active={tab}>
        {tab === "synthese" ? <SummarySection params={params} /> : null}
        {tab === "factures" ? <InvoicesSection params={params} /> : null}
        {tab === "paiements" ? <PaymentsSection params={params} /> : null}
        {tab === "depenses" ? <ExpensesSection params={params} /> : null}
        {tab === "impayes" ? <OutstandingSection params={params} /> : null}
        {tab === "rappels" ? <RemindersSection /> : null}
        {tab === "tarifs" ? <FeesSection /> : null}
      </TabPanel>
    </div>
  );
}

async function NewInvoiceButton({ organizationId, today }: { organizationId: string; today: string }) {
  const [students, fees] = await Promise.all([listStudentsForInvoice(organizationId), listFeeTypes(organizationId)]);
  return (
    <QuickFormDialog
      title="Nouvelle facture"
      description="Facture ponctuelle (tenue, transport, examen…). Elle est émise et notifiée à la famille."
      trigger={
        <Button>
          <FilePlus2 aria-hidden /> Nouvelle facture
        </Button>
      }
      submitLabel="Émettre la facture"
      action={createInvoice}
      fields={[
        { name: "student_id", label: "Élève", type: "select", required: true, wide: true, options: students.map((s) => ({ value: s.id, label: `${s.last_name} ${s.first_name} — ${s.matricule}` })) },
        { name: "fee_type_id", label: "Type de frais", type: "select", options: fees.map((f) => ({ value: f.id, label: f.name })) },
        { name: "description", label: "Désignation", required: true, placeholder: "Tenue scolaire" },
        { name: "amount", label: "Montant", type: "number", required: true, min: 1 },
        { name: "due_on", label: "Échéance", type: "date", defaultValue: today },
      ]}
    />
  );
}

function period(params: Params, timezone: string) {
  const today = todayIn(timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const from = isIsoDate(param(params, "du")) ? param(params, "du")! : monthStart;
  const to = isIsoDate(param(params, "au")) ? param(params, "au")! : today;
  return { from, to, today };
}

function PeriodForm({ tab, from, to, today, children }: { tab: string; from: string; to: string; today: string; children?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <form className="flex flex-wrap items-end gap-3" action="/finances">
        <input type="hidden" name="onglet" value={tab} />
        <div className="grid gap-1.5">
          <Label htmlFor={`${tab}-du`}>Du</Label>
          <Input id={`${tab}-du`} name="du" type="date" defaultValue={from} max={today} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${tab}-au`}>Au</Label>
          <Input id={`${tab}-au`} name="au" type="date" defaultValue={to} max={today} className="w-44" />
        </div>
        {children}
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>
    </Card>
  );
}

async function SummarySection({ params }: { params: Params }) {
  const context = await requireOrganization();
  const { from, to, today } = period(params, context.organization.timezone);
  const summary = await getFinanceSummary(context.organization.id, from, to);
  const money = (n: number) => formatMoney(n, context.organization.currency);
  return (
    <div className="grid gap-4">
      <PeriodForm tab="synthese" from={from} to={to} today={today} />
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Encaissements", value: summary.income, icon: TrendingUp, tone: "text-success" },
          { label: "Dépenses", value: summary.spent, icon: TrendingDown, tone: "text-danger" },
          { label: "Solde de la période", value: summary.net, icon: Wallet, tone: summary.net >= 0 ? "text-success" : "text-danger" },
          { label: "Restes dus (total)", value: summary.outstanding, icon: Receipt, tone: "text-warning", hint: `${summary.overdueInvoices} facture(s) en retard` },
        ].map(({ label, value, icon: Icon, tone, hint }) => (
          <Card key={label} interactive className="grid gap-1 p-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4" aria-hidden /> {label}
            </span>
            <strong className={`font-display text-xl tabular-nums ${tone}`}>
              <AnimatedMoney value={value} currency={context.organization.currency} />
            </strong>
            {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dépenses par catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune dépense sur la période.</p>
          ) : (
            <ul className="grid gap-1">
              {summary.byCategory.map(([name, total], i) => (
                <li key={name} className="group relative grid gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted/70">
                  <span className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold tabular-nums">
                      {money(total)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        {Math.round((total / (summary.spent || 1)) * 100)} %
                      </span>
                    </span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <span
                      className="block h-full origin-left animate-[bar-grow-x_0.7s_var(--ease-out)_both] rounded-full bg-primary transition-[filter] group-hover:brightness-110"
                      style={{ width: `${Math.max(4, (total / summary.spent) * 100)}%`, animationDelay: `${Math.min(i, 10) * 50}ms` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function InvoicesSection({ params }: { params: Params }) {
  const context = await requireOrganization();
  const filters = { q: param(params, "q"), status: param(params, "statut"), page: pageParam(params) };
  const { rows, total } = await listInvoices(context.organization.id, filters);
  const money = (n: number | null) => formatMoney(n ?? 0, context.organization.currency);
  return (
    <Card className="overflow-hidden">
      <Suspense>
        <FilterBar
          placeholder="Élève, matricule ou numéro de facture…"
          filters={[
            {
              name: "statut",
              label: "Situation",
              options: [
                { value: "", label: "Toutes" },
                { value: "unpaid", label: "Impayées" },
                { value: "partial", label: "Partielles" },
                { value: "paid", label: "Soldées" },
                { value: "overdue", label: "En retard" },
                { value: "cancelled", label: "Annulées" },
              ],
            },
          ]}
        />
      </Suspense>
      {rows.length === 0 ? (
        <div className="border-t border-border">
          <EmptyState icon={Receipt} title="Aucune facture" />
        </div>
      ) : (
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Facture</TH>
              <TH>Élève</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Payé</TH>
              <TH className="text-right">Reste dû</TH>
              <TH>Échéance</TH>
              <TH>Situation</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.invoice_id}>
                <TD>
                  <Link href={`/finances/factures/${row.invoice_id}`} className="font-semibold hover:text-primary">
                    {row.number}
                  </Link>
                </TD>
                <TD>
                  {row.student ? (
                    <span className="grid">
                      <span>
                        {row.student.last_name} {row.student.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{row.student.matricule}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="text-right tabular-nums">{money(row.total)}</TD>
                <TD className="text-right tabular-nums">{money(row.paid)}</TD>
                <TD className="text-right font-semibold tabular-nums">{money(row.balance)}</TD>
                <TD>
                  {row.next_due_on ? formatDate(row.next_due_on, "fr-FR", { dateStyle: "short" }) : "—"}
                  {row.is_overdue ? (
                    <Badge tone="danger" className="ml-2">
                      En retard
                    </Badge>
                  ) : null}
                </TD>
                <TD>{row.payment_status ? <StatusBadge value={row.payment_status} map={INVOICE_PAYMENT_STATUS} /> : null}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={filters.page} pageSize={FINANCE_PAGE_SIZE} total={total} basePath="/finances" searchParams={{ onglet: "factures", q: filters.q, statut: filters.status }} />
    </Card>
  );
}

async function PaymentsSection({ params }: { params: Params }) {
  const context = await requireOrganization();
  const { from, to, today } = period(params, context.organization.timezone);
  const method = param(params, "mode");
  const payments = await listPayments(context.organization.id, { from, to, method: method && method in PAYMENT_METHOD ? method : undefined });
  const money = (n: number) => formatMoney(n, context.organization.currency);
  const completed = payments.filter((p) => p.status === "completed");
  return (
    <div className="grid gap-4">
      <PeriodForm tab="paiements" from={from} to={to} today={today}>
        <div className="grid gap-1.5">
          <Label htmlFor="p-mode">Mode</Label>
          <Select id="p-mode" name="mode" defaultValue={method ?? ""} className="w-48">
            <option value="">Tous</option>
            {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </PeriodForm>
      <p className="text-sm text-muted-foreground">
        {completed.length} encaissement(s) · total <strong className="text-foreground">{money(completed.reduce((s, p) => s + Number(p.amount), 0))}</strong>
      </p>
      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun paiement sur la période" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Reçu</TH>
                <TH>Date</TH>
                <TH>Élève</TH>
                <TH>Mode</TH>
                <TH className="text-right">Montant</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {payments.map((p) => (
                <TR key={p.id} className={p.status === "cancelled" ? "text-muted-foreground line-through" : undefined}>
                  <TD className="font-semibold">{p.number}</TD>
                  <TD>{formatDateTime(p.paid_at, "fr-FR", context.organization.timezone)}</TD>
                  <TD>{p.student ? `${p.student.last_name} ${p.student.first_name}` : "—"}</TD>
                  <TD>{PAYMENT_METHOD[p.method] ?? p.method}</TD>
                  <TD className="text-right tabular-nums">{money(Number(p.amount))}</TD>
                  <TD className="text-right">
                    <span className="inline-flex gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/finances/factures/${p.invoice_id}`}>Facture</Link>
                      </Button>
                      {can(context, "documents.generate") ? (
                        <Button asChild variant="ghost" size="sm" aria-label={`Reçu ${p.number}`}>
                          <a href={`/api/documents/recus/${p.id}`} target="_blank" rel="noopener">
                            <Receipt aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                    </span>
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

async function ExpensesSection({ params }: { params: Params }) {
  const context = await requireOrganization();
  const organizationId = context.organization.id;
  const { from, to, today } = period(params, context.organization.timezone);
  const category = param(params, "categorie");
  const archived = param(params, "archives") === "1";
  const [expenses, categories] = await Promise.all([
    listExpenses(organizationId, { from, to, categoryId: isUuid(category) ? category : undefined, archived, q: param(params, "q") }),
    listExpenseCategories(organizationId),
  ]);
  const manage = can(context, "finance.expenses.manage");
  const money = (n: number) => formatMoney(n, context.organization.currency);
  const active = categories.filter((c) => c.is_active);
  const total = expenses.filter((e) => e.status === "recorded").reduce((s, e) => s + Number(e.amount), 0);
  return (
    <div className="grid gap-4">
      <PeriodForm tab="depenses" from={from} to={to} today={today}>
        <div className="grid gap-1.5">
          <Label htmlFor="e-cat-f">Catégorie</Label>
          <Select id="e-cat-f" name="categorie" defaultValue={category ?? ""} className="w-56">
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="e-q">Recherche</Label>
          <Input id="e-q" name="q" defaultValue={param(params, "q")} placeholder="Libellé, fournisseur…" className="w-56" />
        </div>
        <label className="flex min-h-12 items-center gap-2 text-sm">
          <input type="checkbox" name="archives" value="1" defaultChecked={archived} className="size-4.5 accent-[var(--primary)]" />
          Archivées
        </label>
      </PeriodForm>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {expenses.length} dépense(s) · total engagé <strong className="text-foreground">{money(total)}</strong>
        </p>
        {manage ? (
          <div className="flex gap-2">
            <QuickFormDialog title="Nouvelle catégorie" triggerLabel="Catégorie" action={createExpenseCategory} fields={[{ name: "name", label: "Nom", required: true, wide: true }]} />
            <ExpenseDialog categories={active} today={today} />
          </div>
        ) : null}
      </div>
      <Card className="overflow-hidden">
        {expenses.length === 0 ? (
          <EmptyState icon={TrendingDown} title="Aucune dépense sur la période" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Numéro</TH>
                <TH>Date</TH>
                <TH>Libellé</TH>
                <TH>Catégorie</TH>
                <TH className="text-right">Montant</TH>
                <TH>Statut</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {expenses.map((e) => (
                <TR key={e.id} className={e.status === "cancelled" ? "text-muted-foreground" : undefined}>
                  <TD className="font-mono text-xs">{e.number}</TD>
                  <TD>{formatDate(e.spent_on, "fr-FR", { dateStyle: "short" })}</TD>
                  <TD>
                    <span className="grid">
                      <span className="font-medium">{e.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {[e.supplier, PAYMENT_METHOD[e.payment_method], e.reference].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </TD>
                  <TD>{e.category?.name ?? "—"}</TD>
                  <TD className="text-right font-semibold tabular-nums">{money(Number(e.amount))}</TD>
                  <TD>{e.status === "cancelled" ? <Badge title={e.cancelled_reason ?? undefined}>Annulée</Badge> : <Badge tone="success">Enregistrée</Badge>}</TD>
                  <TD className="text-right">
                    <span className="inline-flex gap-1">
                      {e.receipt_file_id ? (
                        <Button asChild variant="ghost" size="sm" aria-label={`Justificatif ${e.number}`}>
                          <a href={`/api/fichiers/${e.receipt_file_id}`} target="_blank" rel="noopener">
                            <Paperclip aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                      {manage && e.status === "recorded" && !e.archived_at ? (
                        <>
                          <ExpenseDialog
                            categories={active}
                            today={today}
                            expense={{ ...e, amount: Number(e.amount) }}
                            trigger={
                              <Button variant="ghost" size="sm" aria-label={`Modifier ${e.number}`}>
                                <Pencil aria-hidden />
                              </Button>
                            }
                          />
                          <ConfirmAction
                            trigger={
                              <Button variant="ghost" size="sm" aria-label={`Annuler ${e.number}`}>
                                <Ban aria-hidden />
                              </Button>
                            }
                            title={`Annuler ${e.number} ?`}
                            description="La dépense reste visible (barrée) et n'est plus comptée."
                            confirmLabel="Annuler la dépense"
                            tone="danger"
                            action={cancelExpense}
                            fields={{ expense_id: e.id }}
                            reason={{ label: "Motif", required: true }}
                          />
                        </>
                      ) : null}
                      {manage ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" aria-label={`${e.archived_at ? "Restaurer" : "Archiver"} ${e.number}`}>
                              {e.archived_at ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                            </Button>
                          }
                          title={e.archived_at ? "Restaurer cette dépense ?" : "Archiver cette dépense ?"}
                          confirmLabel={e.archived_at ? "Restaurer" : "Archiver"}
                          action={setExpenseArchived}
                          fields={{ expense_id: e.id, archive: e.archived_at ? "false" : "true" }}
                        />
                      ) : null}
                      {can(context, "finance.expenses.delete") ? (
                        <ConfirmAction
                          trigger={
                            <Button variant="ghost" size="sm" className="text-danger" aria-label={`Supprimer ${e.number}`}>
                              <Trash2 aria-hidden />
                            </Button>
                          }
                          title={`Supprimer définitivement ${e.number} ?`}
                          description="Action irréversible, réservée à l'administration ; elle reste tracée dans le journal d'audit."
                          confirmLabel="Supprimer"
                          tone="danger"
                          action={deleteExpense}
                          fields={{ expense_id: e.id }}
                        />
                      ) : null}
                    </span>
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

async function RemindersSection() {
  const context = await requireOrganization();
  const reminders = await listReminders(context.organization.id);
  return (
    <div className="grid gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Rappels automatiques : avant chaque échéance et à intervalle régulier en cas d&apos;impayé (familles notifiées dans leur portail). Les présences restent
          toujours consultables, même en cas de restriction.
        </p>
        {can(context, "finance.invoices.manage") ? (
          <ConfirmAction
            trigger={
              <Button>
                <BellRing aria-hidden /> Envoyer les rappels maintenant
              </Button>
            }
            title="Envoyer les rappels ?"
            description="Chaque famille concernée reçoit au plus un rappel par intervalle configuré ; aucun doublon n'est envoyé."
            confirmLabel="Envoyer"
            action={sendReminders}
            fields={{}}
          />
        ) : null}
      </Card>
      <Card className="overflow-hidden">
        {reminders.length === 0 ? (
          <EmptyState icon={BellRing} title="Aucun rappel envoyé" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Facture</TH>
                <TH>Élève</TH>
                <TH className="text-right">Montant rappelé</TH>
                <TH className="text-right">Destinataires</TH>
              </tr>
            </THead>
            <tbody>
              {reminders.map((r) => (
                <TR key={r.id}>
                  <TD>{formatDateTime(r.sent_at, "fr-FR", context.organization.timezone)}</TD>
                  <TD>
                    <Badge tone={r.kind === "overdue" ? "danger" : "info"}>{REMINDER_KIND[r.kind] ?? r.kind}</Badge>
                  </TD>
                  <TD>
                    {r.invoice ? (
                      <Link href={`/finances/factures/${r.invoice.id}`} className="hover:text-primary">
                        {r.invoice.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{r.student ? `${r.student.last_name} ${r.student.first_name}` : "—"}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(Number(r.amount_due), context.organization.currency)}</TD>
                  <TD className="text-right">{r.recipients}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

async function OutstandingSection({ params }: { params: Params }) {
  const context = await requireOrganization();
  const overdueOnly = param(params, "retard") === "1";
  const rows = await listOutstandingBalances(context.organization.id, { q: param(params, "q"), overdueOnly });
  const money = (n: number) => formatMoney(n, context.organization.currency);
  const canRemind = can(context, "finance.invoices.manage");
  const totals = rows.reduce((t, r) => ({ balance: t.balance + r.balance, overdue: t.overdue + (r.overdue ? 1 : 0) }), { balance: 0, overdue: 0 });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Reliquat total</span>
          <strong className="font-display text-xl tabular-nums text-warning">{money(totals.balance)}</strong>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Élèves avec un reste dû</span>
          <strong className="font-display text-xl tabular-nums">{rows.length}</strong>
        </Card>
        <Card className="grid gap-1 p-4">
          <span className="text-sm text-muted-foreground">Dont en retard</span>
          <strong className="font-display text-xl tabular-nums text-danger">{totals.overdue}</strong>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Élève, matricule ou classe…"
            filters={[{ name: "retard", label: "Situation", options: [{ value: "", label: "Tous les restes dus" }, { value: "1", label: "En retard uniquement" }] }]}
          />
        </Suspense>
        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState icon={Wallet} title="Aucun impayé" description="Toutes les factures émises sont soldées." />
          </div>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Élève</TH>
                <TH>Classe</TH>
                <TH className="text-right">Facturé</TH>
                <TH className="text-right">Payé</TH>
                <TH className="text-right">Reliquat</TH>
                <TH>Prochaine échéance</TH>
                <TH>Factures</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.student.id}>
                  <TD>
                    <Link href={`/eleves/${r.student.id}?onglet=finance`} className="grid hover:text-primary">
                      <span className="font-medium">
                        {r.student.last_name} {r.student.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.student.matricule}</span>
                    </Link>
                  </TD>
                  <TD>{r.className ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{money(r.total)}</TD>
                  <TD className="text-right tabular-nums">{money(r.paid)}</TD>
                  <TD className="text-right font-semibold tabular-nums">{money(r.balance)}</TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.nextDue ? formatDate(r.nextDue) : "—"}
                      {r.overdue ? <Badge tone="danger">En retard</Badge> : null}
                    </span>
                  </TD>
                  <TD>
                    <ul className="grid gap-1">
                      {r.invoices.map((i) => (
                        <li key={i.invoice_id} className="flex items-center gap-2 text-sm">
                          <Link href={`/finances/factures/${i.invoice_id}`} className="hover:text-primary">
                            {i.number}
                          </Link>
                          <span className="text-xs tabular-nums text-muted-foreground">{money(Number(i.balance))}</span>
                          {canRemind && i.is_overdue ? (
                            <ConfirmAction
                              trigger={
                                <Button variant="ghost" size="sm" aria-label={`Envoyer un rappel pour ${i.number}`}>
                                  <BellRing aria-hidden />
                                </Button>
                              }
                              title={`Rappel pour ${i.number} ?`}
                              description="La famille est notifiée dans son portail du montant restant dû."
                              confirmLabel="Envoyer"
                              action={sendReminder}
                              fields={{ invoice_id: i.invoice_id! }}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
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

async function FeesSection() {
  const context = await requireOrganization();
  const manage = can(context, "finance.fees.manage");
  const setup = await getFeeSetup(context.organization.id);
  const currency = context.organization.currency;
  const activeTypes = setup.types.filter((t) => t.is_active);
  const target = (r: (typeof setup.rates)[number]) =>
    r.class ? `Classe ${r.class.name}` : r.level ? `Niveau ${r.level.name}` : r.program ? `Filière ${r.program.name}` : "Tout l'établissement";
  const typeFields = (t?: (typeof setup.types)[number]) => [
    { name: "name", label: "Nom", required: true, defaultValue: t?.name, placeholder: "Frais de scolarité" },
    { name: "code", label: "Code", required: true, defaultValue: t?.code, placeholder: "SCOL" },
    { name: "category", label: "Catégorie", type: "select" as const, required: true, defaultValue: t?.category ?? "tuition", options: Object.entries(FEE_CATEGORY).map(([value, label]) => ({ value, label })) },
  ];
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle>Tarifs {setup.year ? `— ${setup.year.name}` : ""}</CardTitle>
            <p className="text-sm text-muted-foreground">Facturés automatiquement à la validation des inscriptions, avec leur échéancier.</p>
          </div>
          {manage && setup.year && activeTypes.length ? (
            <FeeRateDialog feeTypes={activeTypes} levels={setup.levels} programs={setup.programs} classes={setup.classes} currency={currency} />
          ) : null}
        </CardHeader>
        {!setup.year ? (
          <EmptyState icon={Receipt} title="Aucune année scolaire en cours" description="Définissez l'année en cours pour saisir ses tarifs." />
        ) : setup.rates.length === 0 ? (
          <EmptyState icon={Receipt} title="Aucun tarif" description="Ajoutez les frais d'inscription et de scolarité de l'année." />
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Frais</TH>
                <TH>Cible</TH>
                <TH className="text-right">Montant</TH>
                <TH>Échéancier</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {setup.rates.map((r) => {
                const plan = Array.isArray(r.installment_plan) ? (r.installment_plan as { label: string; due_on: string; percent: number }[]) : [];
                return (
                  <TR key={r.id}>
                    <TD>
                      <span className="grid">
                        <span className="font-medium">{r.fee_type?.name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {FEE_CATEGORY[r.fee_type?.category ?? ""] ?? ""} · {r.is_mandatory ? "obligatoire" : "facultatif"}
                        </span>
                      </span>
                    </TD>
                    <TD>{target(r)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatMoney(Number(r.amount), currency)}</TD>
                    <TD>
                      {plan.length === 0 ? (
                        <span className="text-muted-foreground">En une fois</span>
                      ) : (
                        <ul className="grid gap-0.5 text-xs">
                          {plan.map((p, i) => (
                            <li key={i} className="tabular-nums">
                              {p.label} · {formatDate(p.due_on)} · {p.percent} % ({formatMoney((Number(r.amount) * p.percent) / 100, currency)})
                            </li>
                          ))}
                        </ul>
                      )}
                    </TD>
                    {manage ? (
                      <TD>
                        <span className="flex justify-end gap-1.5">
                          <FeeRateDialog
                            feeTypes={setup.types.filter((t) => t.is_active || t.id === r.fee_type_id)}
                            levels={setup.levels}
                            programs={setup.programs}
                            classes={setup.classes}
                            currency={currency}
                            rate={{ ...r, amount: Number(r.amount) }}
                            trigger={
                              <Button variant="secondary" size="sm" aria-label={`Modifier le tarif ${r.fee_type?.name ?? ""} — ${target(r)}`}>
                                <Pencil aria-hidden />
                              </Button>
                            }
                          />
                          <ConfirmAction
                            trigger={
                              <Button variant="ghost" size="sm" className="text-danger" aria-label={`Supprimer le tarif ${r.fee_type?.name ?? ""} — ${target(r)}`}>
                                <Trash2 aria-hidden />
                              </Button>
                            }
                            title="Supprimer ce tarif ?"
                            description="Les factures déjà émises ne sont pas modifiées ; les prochaines inscriptions ne seront plus facturées de ce montant."
                            confirmLabel="Supprimer"
                            tone="danger"
                            action={deleteFeeRate}
                            fields={{ fee_rate_id: r.id }}
                          />
                        </span>
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Types de frais</CardTitle>
          {manage ? <QuickFormDialog title="Nouveau type de frais" triggerLabel="Nouveau type de frais" action={saveFeeType} fields={typeFields()} /> : null}
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Nom</TH>
              <TH>Code</TH>
              <TH>Catégorie</TH>
              <TH>Statut</TH>
              {manage ? <TH className="text-right">Actions</TH> : null}
            </tr>
          </THead>
          <tbody>
            {setup.types.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.name}</TD>
                <TD className="font-mono text-xs">{t.code}</TD>
                <TD>{FEE_CATEGORY[t.category] ?? t.category}</TD>
                <TD>{t.is_active ? <Badge tone="success">Actif</Badge> : <Badge>Désactivé</Badge>}</TD>
                {manage ? (
                  <TD>
                    <span className="flex justify-end gap-1.5">
                      <QuickFormDialog
                        title={`Modifier « ${t.name} »`}
                        trigger={
                          <Button variant="secondary" size="sm" aria-label={`Modifier ${t.name}`}>
                            <Pencil aria-hidden />
                          </Button>
                        }
                        action={saveFeeType}
                        hidden={{ fee_type_id: t.id }}
                        fields={typeFields(t)}
                      />
                      <ConfirmAction
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`${t.is_active ? "Désactiver" : "Réactiver"} ${t.name}`}>
                            {t.is_active ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
                          </Button>
                        }
                        title={t.is_active ? `Désactiver « ${t.name} » ?` : `Réactiver « ${t.name} » ?`}
                        description={t.is_active ? "Il ne sera plus facturé aux nouvelles inscriptions ; l'historique est conservé." : undefined}
                        confirmLabel={t.is_active ? "Désactiver" : "Réactiver"}
                        action={setFeeTypeActive}
                        fields={{ fee_type_id: t.id, active: t.is_active ? "false" : "true" }}
                      />
                    </span>
                  </TD>
                ) : null}
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
