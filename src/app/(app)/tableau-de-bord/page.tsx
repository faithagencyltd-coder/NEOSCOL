import {
  AlertTriangle,
  BookOpen,
  CalendarX,
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
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activityLabel } from "@/features/dashboard/components/activity-label";
import { ColumnChart, HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { getDashboardOverview, getMyTeaching, getVisibleAnnouncements } from "@/features/dashboard/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { displayName } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Tableau de bord" };

const MONTH_FORMAT = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export default async function DashboardPage() {
  const context = await requireOrganization();
  const organization = context.organization;
  const isTeacher = context.personas.has("teacher");

  const [overview, announcements, teaching] = await Promise.all([
    getDashboardOverview(organization.id),
    getVisibleAnnouncements(organization.id),
    isTeacher ? getMyTeaching(organization.id, context.user.id) : Promise.resolve([]),
  ]);

  const currency = overview.currency ?? organization.currency;
  const money = (value: number) => formatMoney(value, currency);

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
      tone: overview.enrollments_pending > 0 ? ("warning" as const) : ("success" as const),
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
      icon: AlertTriangle,
      tone: (overview.overdue_invoices ?? 0) > 0 ? ("danger" as const) : ("primary" as const),
    },
    overview.absences_week !== undefined && {
      label: "Absences (7 jours)",
      value: formatNumber(overview.absences_week),
      hint: `${overview.absences_today ?? 0} aujourd'hui · ${overview.lates_week ?? 0} retards`,
      icon: CalendarX,
      tone: "warning" as const,
    },
  ].filter((stat) => stat !== false);

  const payments = (overview.payments_by_month ?? []).map((row) => ({
    label: MONTH_FORMAT.format(new Date(`${row.month}-01T00:00:00`)),
    value: row.amount,
    display: money(row.amount),
  }));
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

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Bonjour, ${displayName(context).split(" ")[0]}`}
        description={`${organization.name} · ${formatDate(new Date(), "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      {stats.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      ) : null}

      {(payments.length > 0 || byClass.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Encaissements</CardTitle>
                <CardDescription>Paiements enregistrés sur les 6 derniers mois</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ColumnChart data={payments} caption="Encaissements des 6 derniers mois" />
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
        </div>
      )}

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
                      <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">
                        <span className="font-medium">{item.className}</span> · {item.subjectName}
                      </span>
                    </div>
                    <Badge>{item.students} élèves</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {averages.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Moyennes par classe</CardTitle>
              <CardDescription>Toutes évaluations notées, ramenées sur 20</CardDescription>
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
                  <li key={announcement.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      {announcement.is_pinned ? <Pin className="size-3.5 text-primary" aria-label="Épinglée" /> : null}
                      <p className="text-sm font-medium">{announcement.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{announcement.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {announcement.author_name ?? "Établissement"}
                      {announcement.published_at ? ` · ${formatDate(announcement.published_at)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {overview.recent_activity ? (
          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>Dernières opérations enregistrées dans le journal d&apos;audit</CardDescription>
            </CardHeader>
            <CardContent>
              {overview.recent_activity.length === 0 ? (
                <EmptyState icon={Users} title="Aucune activité" />
              ) : (
                <ul className="divide-y divide-border">
                  {overview.recent_activity.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{activityLabel(entry.action, entry.entity_type)}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.actor_email ?? "Système"}</p>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.created_at}>
                        {formatDateTime(entry.created_at, "fr-FR", organization.timezone)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
