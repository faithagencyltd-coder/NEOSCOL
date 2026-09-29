import { Archive, CalendarCheck2, CalendarPlus, Download, Lock } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { closeYear, prepareNextYear } from "@/features/year-transition/actions";
import { TransitionTable, type Proposal } from "@/features/year-transition/components/transition-table";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Passage d'année" };

const YEAR_STATUS = { planned: { label: "À venir", tone: "neutral" }, active: { label: "En cours", tone: "success" }, closed: { label: "Clôturée", tone: "primary" } } as const;

/**
 * Passage d'année : préparer l'année suivante, réinscrire en groupe selon les
 * décisions de fin d'année, clôturer, archiver. Aucune donnée supprimée.
 */
export default async function YearTransitionPage() {
  const context = await requirePermission("academic.manage");
  const orgId = context.organization.id;
  const supabase = await createClient();
  const [{ data: years }, { data: proposals }] = await Promise.all([
    supabase.from("academic_years").select("id, name, starts_on, ends_on, is_current, status").eq("organization_id", orgId).order("starts_on", { ascending: false }),
    supabase.rpc("year_transition_proposals", { p_org: orgId }),
  ]);
  const current = years?.find((y) => y.is_current) ?? null;
  const next = current ? [...(years ?? [])].reverse().find((y) => y.starts_on > current.starts_on) ?? null : null;
  const { data: nextClasses } = next
    ? await supabase.from("classes").select("id, name").eq("academic_year_id", next.id).eq("kind", "class").is("archived_at", null).order("name")
    : { data: null };
  const list = (proposals ?? []) as unknown as Proposal[];
  const count = (a: Proposal["action"]) => list.filter((p) => p.action === a).length;
  const reenrolled = list.filter((p) => p.next_enrollment).length;
  const canEnroll = can(context, "enrollments.manage");
  const graduates = count("graduate");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Passage d'année"
        description="Préparez l'année suivante, réinscrivez les élèves selon les décisions de fin d'année, puis clôturez. Rien n'est supprimé : les années closes restent consultables."
      />
      {!current ? <Alert tone="warning">Aucune année scolaire en cours : définissez-la dans Structure.</Alert> : null}

      <section className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Synthèse">
        <StatCard label="Année en cours" value={current?.name ?? "—"} hint={`${list.length} élève(s) inscrit(s)`} icon={CalendarCheck2} tone="primary" />
        <StatCard label="Année suivante" value={next?.name ?? "À préparer"} hint={next ? `${nextClasses?.length ?? 0} classe(s)` : "Étape 1"} icon={CalendarPlus} tone="info" />
        <StatCard label="Réinscrits" value={{ count: reenrolled }} hint={`sur ${list.length}`} icon={Archive} tone="success" />
        <StatCard label="À décider" value={{ count: count("undecided") }} hint={`${count("promote")} passage(s) · ${count("repeat")} redoublement(s) · ${count("leave")} départ(s)`} icon={Lock} tone="warning" />
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>1. Préparer l&apos;année suivante</CardTitle>
            <CardDescription>
              {next
                ? `${next.name} existe : les classes, périodes et tarifs manquants peuvent être complétés à tout moment.`
                : "Crée l'année suivante et y copie les périodes, les classes (matières, coefficients, enseignants) et les tarifs."}
            </CardDescription>
          </div>
          {current ? (
            <ConfirmAction
              trigger={
                <Button variant={next ? "secondary" : "primary"}>
                  <CalendarPlus aria-hidden /> {next ? "Compléter" : "Préparer"} {next?.name ?? "l'année suivante"}
                </Button>
              }
              title="Préparer l'année suivante ?"
              description="Seuls les éléments absents sont créés (aucune modification de l'existant). L'emploi du temps n'est pas copié."
              confirmLabel="Préparer"
              action={prepareNextYear}
              fields={{}}
            />
          ) : null}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Réinscriptions</CardTitle>
          <CardDescription>
            Proposées selon les décisions de fin d&apos;année (Résultats annuels) : passage dans le niveau suivant, redoublement, départ ou fin de cycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyState icon={Archive} title="Aucun élève inscrit cette année" />
          ) : !next ? (
            <Alert tone="info">Préparez d&apos;abord l&apos;année suivante (étape 1).</Alert>
          ) : !canEnroll ? (
            <Alert tone="info">La création des réinscriptions nécessite le droit de gérer les inscriptions.</Alert>
          ) : (
            <TransitionTable proposals={list} classes={nextClasses ?? []} nextYear={next.name} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>3. Clôturer {current?.name ?? "l'année"}</CardTitle>
            <CardDescription>
              Verrouille les périodes (notes, présences) et fait de {next?.name ?? "l'année suivante"} l&apos;année en cours. Les données de {current?.name ?? "l'année"} restent consultables et exportables.
            </CardDescription>
          </div>
          {current && next ? (
            <ConfirmAction
              trigger={
                <Button variant="danger">
                  <Lock aria-hidden /> Clôturer {current.name}
                </Button>
              }
              title={`Clôturer ${current.name} ?`}
              description={`${list.length - reenrolled} élève(s) sans réinscription pour ${next.name}. Les périodes seront verrouillées et ${next.name} deviendra l'année en cours.`}
              confirmLabel="Clôturer l'année"
              tone="danger"
              action={closeYear}
              fields={{}}
            >
              {graduates ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="mark_graduates" value="true" defaultChecked />
                  Passer les {graduates} élève(s) en fin de cycle non réinscrits au statut « ancien élève »
                </label>
              ) : null}
            </ConfirmAction>
          ) : null}
        </CardHeader>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Archives</CardTitle>
          <CardDescription>Résultats de chaque année (moyenne annuelle, rang, mention, décision) au format tableur.</CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <tr className="border-t border-border">
              <TH>Année</TH>
              <TH>Statut</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {(years ?? []).map((y) => {
              const st = YEAR_STATUS[y.status as keyof typeof YEAR_STATUS];
              return (
                <TR key={y.id}>
                  <TD className="font-medium">{y.name}</TD>
                  <TD>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </TD>
                  <TD className="text-right">
                    <Button asChild size="sm" variant="secondary">
                      <a href={`/api/archives/annee/${y.id}`} download>
                        <Download aria-hidden /> Exporter
                      </a>
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
