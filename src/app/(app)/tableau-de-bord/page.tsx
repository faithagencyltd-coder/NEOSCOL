import {
  AlertTriangle,
  BookOpen,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Megaphone,
  Pin,
  School,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activityLabel } from "@/features/dashboard/components/activity-label";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { DonutChart } from "@/features/dashboard/components/donut-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import {
  getDashboardOverview,
  getInvoiceSummary,
  getMyTeaching,
  getRecentPayments,
  getVisibleAnnouncements,
} from "@/features/dashboard/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can, displayName } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Tableau de bord" };

const METHOD_LABELS: Record<string, { label: string; tone: "neutral" | "warning" | "primary" | "info" }> = {
  cash: { label: "Espèces", tone: "neutral" },
  mobile_money: { label: "Mobile Money", tone: "warning" },
  bank_transfer: { label: "Virement", tone: "primary" },
  card: { label: "Carte", tone: "info" },
  cheque: { label: "Chèque", tone: "neutral" },
  other: { label: "Autre", tone: "neutral" },
};

const STATUS_COLORS = { paid: "#16a34a", partial: "#f59e0b", unpaid: "#dc2626" } as const;

export default async function DashboardPage() {
  const context = await requireOrganization();
  const organization = context.organization;
  const isTeacher = context.personas.has("teacher");
  const canFinance = can(context, "finance.read");

  const [overview, announcements, teaching, invoiceSummary, payments] = await Promise.all([
    getDashboardOverview(organization.id),
    getVisibleAnnouncements(organization.id),
    isTeacher ? getMyTeaching(organization.id, context.user.id) : Promise.resolve([]),
    canFinance ? getInvoiceSummary(organization.id) : Promise.resolve(null),
    canFinance ? getRecentPayments(organization.id) : Promise.resolve([]),
  ]);

  const currency = overview.currency ?? organization.currency;
  const money = (value: number) => formatMoney(value, currency);
  const tz = organization.timezone;

  const stats = [
    overview.students_active !== undefined && {
      label: "Élèves actifs",
      value: formatNumber(overview.students_active),
      hint: overview.students_by_sex
        ? `${overview.students_by_sex.F ?? 0} filles · ${overview.students_by_sex.M ?? 0} garçons`
        : undefined,
      icon: GraduationCap,
      tone: "primary" as const,
    },
    overview.enrollments_pending !== undefined && {
      label: "Inscriptions en attente",
      value: formatNumber(overview.enrollments_pending),
      hint: `${overview.enrollments_validated ?? 0} inscriptions · ${overview.reenrollments_validated ?? 0} réinscriptions validées`,
      icon: ClipboardList,
      tone: "warning" as const,
    },
    overview.classes !== undefined && {
      label: "Classes",
      value: formatNumber(overview.classes),
      hint: overview.teachers !== undefined ? `${overview.teachers} enseignants` : undefined,
      icon: School,
      tone: "info" as const,
    },
    overview.payments_month !== undefined && {
      label: "Encaissé ce mois",
      value: money(overview.payments_month),
      icon: Wallet,
      tone: "success" as const,
    },
    overview.outstanding_total !== undefined && {
      label: "Reste à encaisser",
      value: money(overview.outstanding_total),
      hint: `${overview.overdue_invoices ?? 0} facture(s) en retard`,
      hintTone: (overview.overdue_invoices ?? 0) > 0 ? ("danger" as const) : undefined,
      icon: AlertTriangle,
      tone: "danger" as const,
    },
    overview.absences_week !== undefined && {
      label: "Absences (7 jours)",
      value: formatNumber(overview.absences_week),
      hint: `${overview.absences_today ?? 0} aujourd'hui · ${overview.lates_week ?? 0} retards`,
      icon: CalendarX,
      tone: "warning" as const,
    },
  ].filter((stat) => stat !== false);

  const alerts = [
    (overview.overdue_invoices ?? 0) > 0 && {
      label: `${overview.overdue_invoices} facture(s) en retard de paiement`,
      tone: "danger" as const,
    },
    (overview.enrollments_pending ?? 0) > 0 && {
      label: `${overview.enrollments_pending} inscription(s) en attente de validation`,
      tone: "warning" as const,
    },
    (overview.absences_today ?? 0) > 0 && {
      label: `${overview.absences_today} absence(s) aujourd'hui`,
      tone: "info" as const,
    },
  ].filter((alert) => alert !== false);
  const showAlerts = overview.enrollments_pending !== undefined || overview.overdue_invoices !== undefined;

  const byClass = (overview.enrollments_by_class ?? []).map((row) => ({
    label: row.class,
    value: row.count,
    display: formatNumber(row.count),
  }));
  const averages = (overview.average_by_class ?? []).map((row) => ({
    label: row.class,
    value: row.average,
    display: `${row.average.toFixed(2).replace(".", ",")} / 20`,
  }));
  const invoiceTotal = invoiceSummary ? invoiceSummary.paid + invoiceSummary.partial + invoiceSummary.unpaid : 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            Tableau de bord{context.roleNames[0] ? ` · ${context.roleNames[0]}` : ""}
          </p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Bonjour, {displayName(context).split(" ")[0]}</h1>
        </div>
        <p className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-3.5 text-sm font-medium first-letter:uppercase">
          {formatDate(new Date(), "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {stats.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      ) : null}

      {canFinance ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Encaissements récents</CardTitle>
              <CardDescription>Derniers paiements enregistrés par la comptabilité</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <EmptyState icon={Wallet} title="Aucun paiement enregistré" />
              ) : (
                <>
                  <table className="hidden w-full text-sm sm:table">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 font-semibold">Reçu</th>
                        <th className="pb-2 font-semibold">Date</th>
                        <th className="pb-2 font-semibold">Mode</th>
                        <th className="pb-2 text-right font-semibold">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const method = METHOD_LABELS[payment.method] ?? { label: payment.method, tone: "neutral" as const };
                        return (
                          <tr key={payment.id} className="border-t border-border">
                            <td className="py-3 font-semibold text-primary">{payment.number}</td>
                            <td className="py-3 text-muted-foreground">{formatDate(payment.paid_at, "fr-FR", { dateStyle: "short", timeZone: tz })}</td>
                            <td className="py-3">
                              <Badge tone={method.tone}>{method.label}</Badge>
                            </td>
                            <td
                              className={cn(
                                "py-3 text-right font-semibold tabular-nums",
                                payment.status === "cancelled" && "text-muted-foreground line-through",
                              )}
                            >
                              {money(payment.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <ul className="grid gap-2 sm:hidden">
                    {payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                        <div className="grid min-w-0">
                          <span className="truncate text-sm font-semibold text-primary">{payment.number}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(payment.paid_at, "fr-FR", { dateStyle: "short", timeZone: tz })} ·{" "}
                            {METHOD_LABELS[payment.method]?.label ?? payment.method}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
          {invoiceSummary ? (
          <Card>
            <CardHeader>
              <CardTitle>Situation des factures</CardTitle>
              <CardDescription>Factures émises de l&apos;établissement</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <DonutChart
                total={invoiceTotal}
                unit="factures"
                caption={`${invoiceTotal} factures : ${invoiceSummary.paid} soldées, ${invoiceSummary.partial} partielles, ${invoiceSummary.unpaid} impayées`}
                segments={[
                  { label: "Soldées", value: invoiceSummary.paid, color: STATUS_COLORS.paid },
                  { label: "Partielles", value: invoiceSummary.partial, color: STATUS_COLORS.partial },
                  { label: "Impayées", value: invoiceSummary.unpaid, color: STATUS_COLORS.unpaid },
                ]}
              />
              <p className="text-sm text-muted-foreground">
                Reste à encaisser : <strong className="text-foreground">{money(invoiceSummary.outstanding)}</strong>
              </p>
            </CardContent>
          </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {overview.recent_activity ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>Dernières opérations du journal d&apos;audit</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.recent_activity.length === 0 ? (
                <EmptyState icon={Users} title="Aucune activité" />
              ) : (
                <ul className="divide-y divide-border">
                  {overview.recent_activity.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold">{activityLabel(entry.action, entry.entity_type)}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.actor_email ?? "Système"}</p>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.created_at}>
                        {formatDateTime(entry.created_at, "fr-FR", tz)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {showAlerts ? (
          <Card>
            <CardHeader>
              <CardTitle>Alertes importantes</CardTitle>
              <CardDescription>Points qui demandent une action</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2.5 rounded-xl bg-success-soft p-3 text-sm font-medium text-success">
                  <CheckCircle2 className="size-[18px]" aria-hidden /> Aucune alerte en cours.
                </p>
              ) : (
                <ul className="grid gap-2.5">
                  {alerts.map((alert) => (
                    <li
                      key={alert.label}
                      className={cn(
                        "flex items-center gap-3 rounded-xl p-3 text-sm font-medium",
                        alert.tone === "danger" && "bg-danger-soft text-danger",
                        alert.tone === "warning" && "bg-warning-soft text-warning",
                        alert.tone === "info" && "bg-primary-soft text-primary",
                      )}
                    >
                      <AlertTriangle className="size-[18px] shrink-0" aria-hidden />
                      <span className="text-foreground">{alert.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {teaching.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Mes enseignements</CardTitle>
              <CardDescription>Classes et matières qui vous sont affectées</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {teaching.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <BookOpen className="size-4" aria-hidden />
                      </span>
                      <span className="truncate">
                        <span className="font-semibold">{item.className}</span> · {item.subjectName}
                      </span>
                    </div>
                    <Badge>{item.students} élèves</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {byClass.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Effectifs par classe</CardTitle>
              <CardDescription>Inscriptions validées de l&apos;année en cours</CardDescription>
            </CardHeader>
            <CardContent>
              <HorizontalBars data={byClass} caption="Effectifs par classe" />
            </CardContent>
          </Card>
        ) : null}

        {averages.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Moyennes par classe</CardTitle>
              <CardDescription>Évaluations notées, ramenées sur 20</CardDescription>
            </CardHeader>
            <CardContent>
              <HorizontalBars data={averages} caption="Moyennes par classe sur 20" />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Annonces</CardTitle>
            <CardDescription>Communications en cours de l&apos;établissement</CardDescription>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <EmptyState icon={Megaphone} title="Aucune annonce" description="Les annonces publiées apparaîtront ici." />
            ) : (
              <ul className="grid gap-3">
                {announcements.map((announcement) => (
                  <li key={announcement.id} className="flex gap-3 rounded-xl border border-border p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      {announcement.is_pinned ? <Pin className="size-4" aria-label="Épinglée" /> : <Megaphone className="size-4" aria-hidden />}
                    </span>
                    <div className="grid gap-0.5">
                      <p className="text-sm font-semibold">{announcement.title}</p>
                      <p className="text-sm text-muted-foreground">{announcement.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {announcement.author_name ?? "Établissement"}
                        {announcement.published_at ? ` · ${formatDate(announcement.published_at)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
