import { AlarmClock, Award, BookOpen, Building2, GraduationCap, Layers, Mic, Percent, ScrollText, UserX, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtCredits } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { universityStatistics } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { isIsoDate, todayIn } from "@/lib/dates";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Statistiques universitaires" };

export default async function UniversityStatsPage({ searchParams }: PageProps<"/universite/statistiques">) {
  const context = await requireUniversity(["reports.read", "deliberations.read", "academic.manage"]);
  const organization = context.organization;
  const params = await searchParams;
  const today = todayIn(organization.timezone);
  const to = isIsoDate(param(params, "au")) && param(params, "au")! <= today ? param(params, "au")! : today;
  const from = isIsoDate(param(params, "du")) && param(params, "du")! <= to ? param(params, "du")! : undefined;
  const s = await universityStatistics(organization.id, from, to);
  const currency = organization.currency;
  const f = context.university.features;
  const showFinance = f.payments && can(context, "finance.read");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Statistiques universitaires"
        description={
          s
            ? `Année ${s.year ?? "—"} · présences du ${formatDate(s.from, "fr-FR", { dateStyle: "medium" })} au ${formatDate(s.to, "fr-FR", { dateStyle: "medium" })} (30 derniers jours par défaut).`
            : undefined
        }
        actions={
          <form className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 p-2" action="/universite/statistiques">
            <label className="flex items-center gap-1.5 text-sm">
              Du
              <input type="date" name="du" defaultValue={s?.from} max={today} className="h-10 rounded-xl border border-white/30 bg-white px-3 text-foreground" />
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              au
              <input type="date" name="au" defaultValue={s?.to} max={today} className="h-10 rounded-xl border border-white/30 bg-white px-3 text-foreground" />
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
            <StatCard label="Étudiants inscrits" value={{ count: s.students_enrolled }} icon={Users} hint={`${s.students_active} étudiant(s) actif(s)`} />
            <StatCard label="Enseignants" value={{ count: s.teachers }} icon={GraduationCap} tone="info" />
            <StatCard
              label="Structure"
              value={{ count: s.programs }}
              icon={Building2}
              hint={`filière(s) · ${f.faculties ? `${s.faculties} faculté(s) · ` : ""}${f.departments ? `${s.departments} département(s) · ` : ""}${s.tracks} parcours`}
            />
            <StatCard label="UE / matières" value={{ count: s.teaching_units }} icon={BookOpen} hint={`${s.courses} enseignement(s) affecté(s)`} />
            <StatCard label="Taux de réussite" value={s.results.success_rate == null ? "—" : `${s.results.success_rate} %`} icon={Percent} tone="success" hint={`${s.results.validated}/${s.results.computed} semestre(s) validé(s) · ${s.results.published} publié(s)`} />
            {f.credits ? (
              <StatCard label="Crédits capitalisés" value={fmtCredits(s.credits.earned)} icon={Layers} tone="info" hint={`sur ${fmtCredits(s.credits.total)} crédits inscrits`} />
            ) : null}
            <StatCard label="Taux d'assiduité" value={s.attendance_rate == null ? "—" : `${s.attendance_rate} %`} icon={Percent} tone="success" hint={`${s.presences} présence(s) enregistrée(s)`} />
            <StatCard label="Absences" value={{ count: s.absences }} icon={UserX} tone="danger" />
            <StatCard label="Retards" value={{ count: s.lates }} icon={AlarmClock} tone="warning" />
            {f.theses ? <StatCard label="Mémoires en cours" value={{ count: s.theses.in_progress }} icon={ScrollText} hint={`${s.theses.defended} soutenu(s)`} /> : null}
            {f.defenses ? <StatCard label="Soutenances à venir" value={{ count: s.defenses.upcoming }} icon={Mic} hint={`${s.defenses.held} tenue(s)`} /> : null}
            <StatCard label="Diplômes délivrés" value={{ count: s.diplomas }} icon={Award} tone="success" />
            {f.internships ? <StatCard label="Stages en cours" value={{ count: s.internships.ongoing }} icon={Building2} hint={`${s.internships.total} au total`} /> : null}
            {showFinance && s.finance ? (
              <>
                <StatCard label="Encaissé" value={{ amount: Number(s.finance.collected), currency }} icon={Wallet} tone="success" hint={`Facturé : ${new Intl.NumberFormat("fr-FR").format(Number(s.finance.invoiced))}`} />
                <StatCard label="Reliquats" value={{ amount: Number(s.finance.remaining), currency }} icon={Wallet} tone="danger" hint={`${s.finance.students_with_balance} étudiant(s) concerné(s)`} />
              </>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Réussite par filière</CardTitle>
                <CardDescription>Semestres validés / semestres calculés</CardDescription>
              </CardHeader>
              <CardContent>
                {s.by_program.some((p) => p.success_rate != null) ? (
                  <HorizontalBars
                    caption="Taux de réussite par filière"
                    data={s.by_program.filter((p) => p.success_rate != null).map((p) => ({ label: p.name, value: Number(p.success_rate), display: `${p.success_rate} %` }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun résultat calculé.</p>
                )}
              </CardContent>
            </Card>
            <Card className="anim-fade-up">
              <CardHeader>
                <CardTitle>Effectifs par filière</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Filière</TH>
                    <TH className="text-right">Étudiants</TH>
                    <TH className="text-right">Réussite</TH>
                  </tr>
                </THead>
                <tbody>
                  {s.by_program.map((p) => (
                    <TR key={p.name}>
                      <TD className="font-medium">{p.name}</TD>
                      <TD className="text-right tabular-nums">{p.students}</TD>
                      <TD className="text-right tabular-nums">{p.success_rate == null ? "—" : `${p.success_rate} %`}</TD>
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
