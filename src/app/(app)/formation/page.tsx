import { AlarmClock, DoorOpen, LogOut, ScanLine, UserCheck, UserX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { requireTraining } from "@/features/training/guard";
import { trainingDashboard } from "@/features/training/queries";
import { isIsoDate, todayIn } from "@/lib/dates";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Formation — aujourd'hui" };

const rate = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "—");

export default async function TrainingTodayPage({ searchParams }: PageProps<"/formation">) {
  const context = await requireTraining("attendance.read", "reports.read", "staff_attendance.read");
  const organization = context.organization;
  const today = todayIn(organization.timezone);
  const requested = param(await searchParams, "date");
  const date = isIsoDate(requested) && requested <= today ? requested : today;
  const data = await trainingDashboard(organization.id, date);
  const isToday = date === today;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title={isToday ? "Formation professionnelle — aujourd'hui" : `Formation professionnelle — ${formatDate(date, "fr-FR", { dateStyle: "full" })}`}
        description="Apprenants et formateurs attendus, présents, absents, en retard ; entrées et sorties enregistrées par la tablette de scan."
        actions={
          <>
            <form className="flex items-center gap-2" action="/formation">
              <label htmlFor="jour" className="sr-only">
                Jour
              </label>
              <input id="jour" type="date" name="date" defaultValue={date} max={today} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm" />
              <Button type="submit" variant="secondary" size="sm">
                Afficher
              </Button>
            </form>
            {can(context, "staff_attendance.scan") ? (
              <Button asChild size="sm">
                <Link href="/pointage">
                  <ScanLine aria-hidden /> Scanner les badges
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {!data ? (
        <Card>
          <EmptyState icon={Users} title="Tableau indisponible" description="Vos droits ne permettent pas d'afficher les présences du centre." />
        </Card>
      ) : (
        <>
          <section aria-labelledby="apprenants" className="grid gap-3">
            <h2 id="apprenants" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Apprenants
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Attendus" value={{ count: data.learners.expected }} icon={Users} hint="Ont au moins un cours ce jour" />
              <StatCard label="Présents" value={{ count: data.learners.present }} icon={UserCheck} tone="success" hint={`Taux ${rate(data.learners.present, data.learners.expected)}`} />
              <StatCard label="Absents" value={{ count: data.learners.absent }} icon={UserX} tone="danger" hint="Cours commencé, aucune entrée" />
              <StatCard label="En retard" value={{ count: data.learners.late }} icon={AlarmClock} tone="warning" />
              <StatCard label="Sorties" value={{ count: data.learners.exits }} icon={LogOut} tone="info" hint={`${data.learners.on_site} actuellement sur place`} />
            </div>
          </section>

          <section aria-labelledby="formateurs" className="grid gap-3">
            <h2 id="formateurs" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Formateurs
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Attendus" value={{ count: data.trainers.expected }} icon={Users} />
              <StatCard label="Présents" value={{ count: data.trainers.present }} icon={UserCheck} tone="success" />
              <StatCard label="Absents" value={{ count: data.trainers.absent }} icon={UserX} tone="danger" />
              <StatCard label="En retard" value={{ count: data.trainers.late }} icon={AlarmClock} tone="warning" />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Présents par formation</CardTitle>
                <CardDescription>Apprenants présents / attendus</CardDescription>
              </CardHeader>
              <CardContent>
                {data.by_formation.length ? (
                  <HorizontalBars
                    caption="Apprenants présents par formation"
                    data={data.by_formation.map((f) => ({ label: f.name, value: f.present, display: `${f.present} / ${f.expected}` }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun cours prévu ce jour.</p>
                )}
              </CardContent>
            </Card>
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Par session{context.training.groupsEnabled ? " et groupe" : ""}</CardTitle>
                <CardDescription>Présents, retards et attendus</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>{context.training.groupsEnabled ? "Session — groupe" : "Session"}</TH>
                    <TH className="text-right">Attendus</TH>
                    <TH className="text-right">Présents</TH>
                    <TH className="text-right">Retards</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.by_session.length === 0 ? (
                    <TR>
                      <TD colSpan={4} className="text-muted-foreground">
                        Aucun cours prévu ce jour.
                      </TD>
                    </TR>
                  ) : (
                    data.by_session.map((s) => (
                      <TR key={s.name}>
                        <TD className="font-medium">{s.name}</TD>
                        <TD className="text-right tabular-nums">{s.expected}</TD>
                        <TD className="text-right tabular-nums">{s.present}</TD>
                        <TD className="text-right tabular-nums">{s.late ? <Badge tone="warning">{s.late}</Badge> : 0}</TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Formateurs du jour</CardTitle>
                <CardDescription>Premier cours et arrivée pointée par badge</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Formateur</TH>
                    <TH>1er cours</TH>
                    <TH>Arrivée</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.trainers.list.length === 0 ? (
                    <TR>
                      <TD colSpan={3} className="text-muted-foreground">
                        Aucun formateur attendu.
                      </TD>
                    </TR>
                  ) : (
                    data.trainers.list.map((t) => (
                      <TR key={t.name}>
                        <TD className="font-medium">{t.name}</TD>
                        <TD className="tabular-nums">{t.first_start}</TD>
                        <TD>
                          {t.arrived_at ? (
                            <span className="flex items-center gap-2 tabular-nums">
                              {t.arrived_at}
                              {t.minutes_late ? <Badge tone="warning">Retard {t.minutes_late} min</Badge> : <Badge tone="success">Présent</Badge>}
                            </span>
                          ) : (
                            <Badge tone="neutral">Non pointé</Badge>
                          )}
                        </TD>
                      </TR>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
            <Card className="anim-fade-up">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>Derniers mouvements</CardTitle>
                  <CardDescription>Entrées et sorties des apprenants</CardDescription>
                </div>
                {can(context, "attendance.read") ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/formation/presences?date=${date}`}>
                      <DoorOpen aria-hidden /> Journal complet
                    </Link>
                  </Button>
                ) : null}
              </CardHeader>
              {data.recent.length === 0 ? (
                <EmptyState icon={DoorOpen} title="Aucun mouvement" description="Les entrées et sorties apparaissent ici dès le premier scan." />
              ) : (
                <ul className="grid gap-1 px-5 pb-5">
                  {data.recent.map((r, i) => (
                    <li key={`${r.matricule}-${i}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted/60">
                      <span className="grid">
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground">{r.matricule}</span>
                      </span>
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        <Badge tone="success">Entrée {r.entered_at}</Badge>
                        {r.exited_at ? <Badge tone="info">Sortie {r.exited_at}</Badge> : null}
                        {r.minutes_late ? <Badge tone="warning">+{r.minutes_late} min</Badge> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
