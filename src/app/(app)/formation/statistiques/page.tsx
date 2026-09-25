import { AlarmClock, Award, BadgeCheck, Briefcase, CalendarDays, GraduationCap, Hammer, Percent, UserX, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { requireTraining } from "@/features/training/guard";
import { trainingStatistics } from "@/features/training/queries";
import { isIsoDate, todayIn } from "@/lib/dates";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Statistiques de formation" };

export default async function TrainingStatsPage({ searchParams }: PageProps<"/formation/statistiques">) {
  const context = await requireTraining("reports.read", "attendance.read");
  const organization = context.organization;
  const params = await searchParams;
  const today = todayIn(organization.timezone);
  const to = isIsoDate(param(params, "au")) && param(params, "au")! <= today ? param(params, "au")! : today;
  const from = isIsoDate(param(params, "du")) && param(params, "du")! <= to ? param(params, "du")! : undefined;
  const s = await trainingStatistics(organization.id, from, to);
  const currency = organization.currency;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Statistiques de formation"
        description={s ? `Assiduité du ${formatDate(s.from, "fr-FR", { dateStyle: "medium" })} au ${formatDate(s.to, "fr-FR", { dateStyle: "medium" })} (30 derniers jours par défaut).` : undefined}
        actions={
          <form className="flex flex-wrap items-center gap-2" action="/formation/statistiques">
            <label className="flex items-center gap-1.5 text-sm">
              Du
              <input type="date" name="du" defaultValue={s?.from} max={today} className="h-10 rounded-xl border border-border bg-surface px-3" />
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              au
              <input type="date" name="au" defaultValue={s?.to} max={today} className="h-10 rounded-xl border border-border bg-surface px-3" />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              Actualiser
            </Button>
          </form>
        }
      />
      {!s ? (
        <Card>
          <EmptyState icon={Percent} title="Statistiques indisponibles" />
        </Card>
      ) : (
        <>
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Apprenants" value={{ count: s.learners }} icon={Users} hint={`${s.active_learners} en formation actuellement`} />
            <StatCard label="Formations actives" value={{ count: s.formations }} icon={Hammer} tone="info" />
            <StatCard label="Sessions" value={{ count: s.sessions.ongoing }} icon={CalendarDays} hint={`${s.sessions.planned} à venir · ${s.sessions.finished} terminées`} />
            <StatCard label="Formateurs" value={{ count: s.trainers }} icon={GraduationCap} tone="info" hint={s.groups ? `${s.groups} classe(s) / groupe(s)` : "Sans classes / groupes"} />
            <StatCard label="Taux d'assiduité" value={s.attendance_rate == null ? "—" : `${s.attendance_rate} %`} icon={Percent} tone="success" />
            <StatCard label="Absences (cours manqués)" value={{ count: s.absences }} icon={UserX} tone="danger" />
            <StatCard label="Retards" value={{ count: s.lates }} icon={AlarmClock} tone="warning" />
            <StatCard label="Formations terminées" value={{ count: s.completed }} icon={Award} tone="success" hint={`${s.certificates} certificat(s) · ${s.attestations} attestation(s) délivré(s)`} />
            <StatCard label="Badges actifs" value={{ count: s.badges_active }} icon={BadgeCheck} />
            <StatCard label="Stages" value={{ count: s.internships.ongoing }} icon={Briefcase} hint={`${s.internships.completed} terminé(s)`} />
            {s.finance ? (
              <>
                <StatCard label="Encaissé (formations)" value={{ amount: Number(s.finance.collected), currency }} icon={Wallet} tone="success" hint={`Sur la période : ${new Intl.NumberFormat("fr-FR").format(Number(s.finance.collected_period))}`} />
                <StatCard label="Reliquats (reste à payer)" value={{ amount: Number(s.finance.remaining), currency }} icon={Wallet} tone="danger" hint={`${s.finance.learners_with_balance} apprenant(s) concerné(s)`} />
              </>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Assiduité par formation</CardTitle>
                <CardDescription>Cours suivis / cours prévus sur la période</CardDescription>
              </CardHeader>
              <CardContent>
                {s.by_formation.some((f) => f.rate != null) ? (
                  <HorizontalBars
                    caption="Taux d'assiduité par formation"
                    data={s.by_formation.filter((f) => f.rate != null).map((f) => ({ label: f.name, value: Number(f.rate), display: `${f.rate} %` }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun cours sur la période.</p>
                )}
              </CardContent>
            </Card>
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Par formation</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Formation</TH>
                    <TH className="text-right">Apprenants</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Assiduité</TH>
                  </tr>
                </THead>
                <tbody>
                  {s.by_formation.map((f) => (
                    <TR key={f.name}>
                      <TD className="font-medium">{f.name}</TD>
                      <TD className="text-right tabular-nums">{f.learners}</TD>
                      <TD className="text-right tabular-nums">{f.sessions}</TD>
                      <TD className="text-right tabular-nums">{f.rate == null ? "—" : `${f.rate} %`}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
