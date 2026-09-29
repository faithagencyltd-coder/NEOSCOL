import { AlarmClock, Award, BookOpen, Briefcase, Building2, CalendarClock, FileBadge, GitBranch, GraduationCap, Presentation, Scale, ScanLine, Sigma, UserCheck, UserX, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { trainingDashboard } from "@/features/training/queries";
import { UniversityHeader } from "@/features/university/components/university-header";
import { ESTABLISHMENT_KINDS, fmtCredits } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { myTeaching, universityStatistics } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { WEEKDAYS } from "@/lib/dates";

export const metadata: Metadata = { title: "Tableau de bord universitaire" };

export default async function UniversityDashboardPage() {
  const context = await requireUniversity([]);
  const organization = context.organization;
  const u = context.university;
  const canStats = can(context, "reports.read") || can(context, "deliberations.read") || can(context, "academic.manage");
  const canToday = can(context, "attendance.read") || can(context, "reports.read") || can(context, "staff_attendance.read");
  const [stats, today, teaching] = await Promise.all([
    canStats ? universityStatistics(organization.id) : Promise.resolve(null),
    canToday ? trainingDashboard(organization.id) : Promise.resolve(null),
    context.personas.has("teacher") ? myTeaching(organization.id, context.user.id) : Promise.resolve(null),
  ]);
  const currency = organization.currency;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title={organization.name}
        eyebrow={`Université / Enseignement supérieur · ${ESTABLISHMENT_KINDS[u.establishmentKind] ?? "Université"}`}
        description={stats?.year ? `Année académique ${stats.year}` : "Tableau de bord universitaire"}
        actions={
          <>
            {can(context, "enrollments.manage") ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/universite/inscription">
                  <GraduationCap aria-hidden /> Inscrire un étudiant
                </Link>
              </Button>
            ) : null}
            {u.features.scan && can(context, "staff_attendance.scan") ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/pointage">
                  <ScanLine aria-hidden /> Scanner les badges
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {teaching ? (
        <Card className="anim-fade-up">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Mes enseignements</CardTitle>
              <CardDescription>
                {teaching.me.academic_rank ? `${teaching.me.academic_rank} · ` : ""}
                {teaching.courses.length} matière(s) cette année
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/universite/mes-enseignements">
                <Presentation aria-hidden /> Portail enseignant
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {teaching.courses.slice(0, 8).map((c) => (
              <Badge key={c.id} tone="primary">
                {c.subject?.name} · {c.class?.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {stats ? (
        <>
          <section aria-labelledby="effectifs" className="grid gap-3">
            <h2 id="effectifs" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Établissement
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Étudiants inscrits" value={{ count: stats.students_enrolled }} icon={GraduationCap} hint={`${stats.students_active} étudiants actifs`} />
              <StatCard label="Enseignants" value={{ count: stats.teachers }} icon={Users} tone="info" />
              <StatCard
                label={u.features.faculties ? "Facultés / départements" : "Filières"}
                value={u.features.faculties ? `${stats.faculties} / ${stats.departments}` : { count: stats.programs }}
                icon={Building2}
                hint={`${stats.programs} filière(s) · ${stats.tracks} parcours`}
              />
              <StatCard label="Cours" value={{ count: stats.courses }} icon={BookOpen} tone="info" hint={`${stats.teaching_units} UE`} />
            </div>
          </section>
          <section aria-labelledby="academique" className="grid gap-3">
            <h2 id="academique" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Académique (30 derniers jours)
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Taux de présence" value={stats.attendance_rate == null ? "—" : `${stats.attendance_rate} %`} icon={UserCheck} tone="success" hint={`${stats.absences} absences · ${stats.lates} retards`} />
              <StatCard label="Réussite (semestres)" value={stats.results.success_rate == null ? "—" : `${stats.results.success_rate} %`} icon={Sigma} tone="primary" hint={`${stats.results.validated} / ${stats.results.computed} semestres validés`} />
              {u.features.credits ? (
                <StatCard label="Crédits acquis" value={`${fmtCredits(stats.credits.earned)} / ${fmtCredits(stats.credits.total)}`} icon={Award} tone="success" />
              ) : null}
              <StatCard label="Diplômes délivrés" value={{ count: stats.diplomas }} icon={Award} tone="info" />
              {u.features.internships ? <StatCard label="Stages en cours" value={{ count: stats.internships.ongoing }} icon={Briefcase} hint={`${stats.internships.total} au total`} /> : null}
              {u.features.theses ? <StatCard label="Mémoires en cours" value={{ count: stats.theses.in_progress }} icon={FileBadge} hint={`${stats.theses.defended} soutenu(s)`} /> : null}
              {u.features.defenses ? <StatCard label="Soutenances à venir" value={{ count: stats.defenses.upcoming }} icon={Presentation} hint={`${stats.defenses.held} tenue(s)`} /> : null}
              {stats.finance && u.features.payments ? (
                <StatCard label="Reliquats" value={{ amount: Number(stats.finance.remaining), currency }} icon={Wallet} tone="danger" hint={`${stats.finance.students_with_balance} étudiant(s) · encaissé ${new Intl.NumberFormat("fr-FR").format(Number(stats.finance.collected))}`} />
              ) : null}
            </div>
          </section>
          {stats.by_program.length ? (
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Étudiants par filière</CardTitle>
                <CardDescription>Inscriptions validées de l&apos;année et taux de réussite des semestres</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  caption="Étudiants par filière"
                  data={stats.by_program.map((p) => ({ label: p.name, value: p.students, display: `${p.students}${p.success_rate != null ? ` · ${p.success_rate} %` : ""}` }))}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {today ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Card className="anim-fade-up">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Présences du jour</CardTitle>
                <CardDescription>Scans des badges étudiants et enseignants</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/universite/presences">
                  <CalendarClock aria-hidden /> Journal
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Étudiants attendus", value: today.learners.expected, icon: Users },
                { label: "Présents", value: today.learners.present, icon: UserCheck },
                { label: "Absents", value: today.learners.absent, icon: UserX },
                { label: "Retards", value: today.learners.late, icon: AlarmClock },
              ].map((x) => (
                <div key={x.label} className="grid gap-1 rounded-2xl bg-surface-muted/60 p-3">
                  <x.icon className="size-4 text-primary" aria-hidden />
                  <span className="font-display text-2xl font-semibold tabular-nums">{x.value}</span>
                  <span className="text-xs text-muted-foreground">{x.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="anim-fade-up">
            <CardHeader>
              <CardTitle>Enseignants du jour</CardTitle>
              <CardDescription>
                {today.trainers.present} présent(s) sur {today.trainers.expected} attendu(s)
              </CardDescription>
            </CardHeader>
            <Table>
              <THead>
                <tr>
                  <TH>Enseignant</TH>
                  <TH>1er cours</TH>
                  <TH>Présence</TH>
                </tr>
              </THead>
              <tbody>
                {today.trainers.list.length === 0 ? (
                  <TR>
                    <TD colSpan={3} className="text-muted-foreground">
                      Aucun cours aujourd&apos;hui.
                    </TD>
                  </TR>
                ) : (
                  today.trainers.list.map((t) => (
                    <TR key={t.name}>
                      <TD className="font-medium">{t.name}</TD>
                      <TD className="tabular-nums">{t.first_start}</TD>
                      <TD>{t.arrived_at ? <Badge tone={t.minutes_late ? "warning" : "success"}>{t.minutes_late ? `Retard ${t.minutes_late} min` : `Présent ${t.arrived_at}`}</Badge> : <Badge tone="neutral">Non pointé</Badge>}</TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      {teaching && teaching.slots.length ? (
        <Card className="anim-fade-up">
          <CardHeader>
            <CardTitle>Mon emploi du temps</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {teaching.slots.slice(0, 12).map((s) => (
              <Badge key={s.id} tone="neutral">
                {WEEKDAYS[s.weekday]} {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
                {s.room ? ` · ${s.room.name}` : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {can(context, "deliberations.read") ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/universite/resultats">
              <Sigma aria-hidden /> Résultats et crédits
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/universite/deliberations">
              <Scale aria-hidden /> Délibérations
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/universite/structure">
              <GitBranch aria-hidden /> Structure universitaire
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
