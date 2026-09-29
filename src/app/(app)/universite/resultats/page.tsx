import { Calculator, ClipboardList, GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav, TabPanel, type TabLink } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { computeResults } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtCredits, fmtNote, RETAKE_RULES, UE_STATUS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { promotionResults, promotions } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Résultats et crédits" };

type SubjectLine = { subject_id?: string; name?: string; coefficient?: number; session1?: number | null; retake?: number | null; average?: number | null };

export default async function UniversityResultsPage({ searchParams }: PageProps<"/universite/resultats">) {
  const context = await requireUniversity(["deliberations.read", "grades.manage"]);
  const orgId = context.organization.id;
  const sp = await searchParams;
  const u = context.university;
  const semesterLabel = u.features.semesters ? "Semestre" : "Période";
  const classes = (await promotions(orgId)).sort((a, b) => Number(b.academic_year?.is_current ?? false) - Number(a.academic_year?.is_current ?? false));
  const requestedClass = param(sp, "promotion");
  const klass = classes.find((c) => c.id === requestedClass) ?? classes[0];
  const supabase = await createClient();
  const { data: periods } = klass
    ? await supabase.from("academic_periods").select("id, name, sequence, is_locked").eq("academic_year_id", klass.academic_year_id).order("sequence")
    : { data: [] };
  const requestedPeriod = param(sp, "semestre");
  const period = (periods ?? []).find((p) => p.id === requestedPeriod) ?? (periods ?? [])[0];
  const tab = param(sp, "onglet") === "rattrapage" ? "rattrapage" : "resultats";
  const data = klass && period && isUuid(klass.id) ? await promotionResults(klass.id, period.id) : null;
  const canCompute = can(context, "deliberations.manage") || can(context, "grades.manage");

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { promotion: klass?.id, semestre: period?.id, onglet: tab === "rattrapage" ? "rattrapage" : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/universite/resultats?${q.toString()}`;
  };
  const tabs: TabLink[] = [
    { key: "resultats", label: "Résultats et crédits", href: href({ onglet: undefined }) },
    { key: "rattrapage", label: "Rattrapage", href: href({ onglet: "rattrapage" }) },
  ];

  const rows = data?.semester ?? [];
  const validated = rows.filter((r) => r.validated).length;
  const retakes = rows.filter((r) => r.retake_needed).length;
  const avg = rows.length ? rows.reduce((s, r) => s + Number(r.average ?? 0), 0) / rows.filter((r) => r.average !== null).length : null;
  const ueOf = (enrollmentId: string, unitId: string) => data?.ues.find((x) => x.enrollment_id === enrollmentId && x.teaching_unit_id === unitId);
  const failedUes = (data?.ues ?? []).filter((x) => x.status === "failed" || x.retake_average !== null);
  const lastComputed = rows.map((r) => r.computed_at).filter(Boolean).sort().at(-1);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Résultats et crédits"
        description={`Moyennes par matière, UE et ${semesterLabel.toLowerCase()} ; crédits capitalisés ; compensation ${u.rules.ue_compensation ? "activée" : "désactivée"} ; rattrapage : ${RETAKE_RULES[u.rules.retake_rule]?.toLowerCase()}. Seuil de validation : ${fmtNote(u.rules.pass_mark)}/20.`}
        actions={
          canCompute && klass && period ? (
            <ConfirmAction
              trigger={
                <Button size="sm">
                  <Calculator aria-hidden /> Calculer les résultats
                </Button>
              }
              title={`Calculer les résultats — ${klass.name}, ${period.name}`}
              description="Moyennes des matières, des UE et du semestre recalculées depuis les notes saisies, selon les règles des paramètres universitaires. Les décisions de jury déjà prises sont conservées."
              confirmLabel="Calculer"
              action={computeResults}
              fields={{ class_id: klass.id, period_id: period.id }}
            />
          ) : null
        }
      />

      {classes.length === 0 ? (
        <Card>
          <EmptyState icon={GraduationCap} title="Aucune promotion" />
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
              <LinkSelect
                label="Promotion"
                value={klass?.id ?? ""}
                className="min-w-0 sm:w-80"
                options={classes.map((c) => ({ value: c.id, label: `${c.name} — ${c.academic_year?.name ?? ""}`, href: `/universite/resultats?promotion=${c.id}${tab === "rattrapage" ? "&onglet=rattrapage" : ""}` }))}
              />
              <LinkSelect
                label={semesterLabel}
                value={period?.id ?? ""}
                className="min-w-0 sm:w-56"
                options={(periods ?? []).map((p) => ({ value: p.id, label: p.name, href: href({ semestre: p.id }) }))}
              />
              <p className="text-sm text-muted-foreground sm:ml-auto">
                {klass?.program?.name} · {klass?.level?.name}
                {lastComputed ? ` · calculé le ${formatDateTime(lastComputed, "fr-FR", context.organization.timezone)}` : ""}
              </p>
            </CardContent>
          </Card>

          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Étudiants évalués" value={String(rows.length)} icon={GraduationCap} />
            <StatCard label={`${semesterLabel} validé`} value={String(validated)} icon={GraduationCap} tone="success" hint={rows.length ? `${Math.round((validated / rows.length) * 100)} % de réussite` : undefined} />
            <StatCard label="Autorisés au rattrapage" value={String(retakes)} icon={ClipboardList} tone="warning" />
            <StatCard label="Moyenne de la promotion" value={avg === null || Number.isNaN(avg) ? "—" : `${fmtNote(avg)}/20`} icon={Calculator} tone="info" />
          </div>

          <TabNav tabs={tabs} active={tab} label="Résultats" />
          <TabPanel active={tab}>
            {rows.length === 0 ? (
              <Card>
                <EmptyState icon={Calculator} title="Aucun résultat calculé" description="Saisissez les notes, puis lancez le calcul des résultats pour ce semestre." />
              </Card>
            ) : tab === "resultats" ? (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Étudiant</TH>
                        {data!.units.map((unit) => (
                          <TH key={unit.id} className="text-center">
                            <span className="font-mono">{unit.code}</span>
                            <span className="block text-[10px] font-normal normal-case">{fmtCredits(unit.credits)} cr.</span>
                          </TH>
                        ))}
                        <TH className="text-center">Moyenne</TH>
                        {u.features.credits ? <TH className="text-center">Crédits</TH> : null}
                        {u.features.ranking ? <TH className="text-center">Rang</TH> : null}
                        <TH>Résultat</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {rows.map((r) => (
                        <TR key={r.id}>
                          <TD>
                            <Link href={`/eleves/${r.student_id}?onglet=resultats`} className="grid hover:text-primary">
                              <span className="font-medium">
                                {r.student?.last_name} {r.student?.first_name}
                              </span>
                              <span className="text-xs text-muted-foreground">{r.student?.matricule}</span>
                            </Link>
                          </TD>
                          {data!.units.map((unit) => {
                            const ue = ueOf(r.enrollment_id, unit.id);
                            const tone = !ue ? "" : ue.status === "failed" ? "text-danger" : ue.status === "compensated" ? "text-info" : ue.status === "incomplete" ? "text-warning" : "text-success";
                            return (
                              <TD key={unit.id} className={`text-center tabular-nums ${tone}`} title={ue ? UE_STATUS[ue.status]?.label : "Non inscrite"}>
                                {ue ? fmtNote(ue.average) : "·"}
                              </TD>
                            );
                          })}
                          <TD className="text-center font-semibold tabular-nums">{fmtNote(r.average)}</TD>
                          {u.features.credits ? (
                            <TD className="text-center tabular-nums">
                              {fmtCredits(r.credits_earned)}/{fmtCredits(r.credits_total)}
                            </TD>
                          ) : null}
                          {u.features.ranking ? <TD className="text-center tabular-nums">{r.rank ? `${r.rank}/${r.population}` : "—"}</TD> : null}
                          <TD>
                            <div className="flex flex-wrap items-center gap-1">
                              {r.validated ? (
                                <Badge tone="success">{r.compensated ? "Validé (compensation)" : "Validé"}</Badge>
                              ) : r.retake_needed ? (
                                <Badge tone="warning">Rattrapage</Badge>
                              ) : (
                                <Badge tone="danger">Non validé</Badge>
                              )}
                              {r.decision ? <span className="text-xs text-muted-foreground">{r.decision}</span> : null}
                              {r.published_at ? <Badge tone="info">Publié</Badge> : null}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Session de rattrapage</CardTitle>
                  <CardDescription>
                    UE non validées : la note initiale est conservée ; la note de rattrapage est saisie dans{" "}
                    <Link href="/notes" className="text-primary underline-offset-2 hover:underline">
                      Évaluations et notes
                    </Link>{" "}
                    (type « Rattrapage »), puis appliquée selon la règle : {RETAKE_RULES[u.rules.retake_rule]?.toLowerCase()}
                    {u.rules.retake_rule === "cap" ? ` (plafond ${fmtNote(u.rules.retake_cap)})` : ""}.
                  </CardDescription>
                </CardHeader>
                {failedUes.length === 0 ? (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Aucune UE à rattraper pour ce semestre.</p>
                  </CardContent>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Étudiant</TH>
                          <TH>UE</TH>
                          <TH>Matières</TH>
                          <TH className="text-center">Note initiale</TH>
                          <TH className="text-center">Rattrapage</TH>
                          <TH className="text-center">Note retenue</TH>
                          <TH>Statut</TH>
                        </TR>
                      </THead>
                      <tbody>
                        {failedUes.map((x) => {
                          const student = rows.find((r) => r.enrollment_id === x.enrollment_id)?.student;
                          const unit = data!.units.find((un) => un.id === x.teaching_unit_id);
                          return (
                            <TR key={`${x.enrollment_id}-${x.teaching_unit_id}`}>
                              <TD className="text-sm font-medium">
                                {student?.last_name} {student?.first_name}
                                <span className="block text-xs font-normal text-muted-foreground">{student?.matricule}</span>
                              </TD>
                              <TD className="text-sm">
                                <span className="font-mono text-xs text-primary">{unit?.code}</span> {unit?.name}
                              </TD>
                              <TD className="text-xs text-muted-foreground">
                                {((x.subjects as SubjectLine[] | null) ?? []).map((m) => (
                                  <span key={m.subject_id ?? m.name} className="block">
                                    {m.name} : {fmtNote(m.session1)}
                                    {m.retake !== null && m.retake !== undefined ? ` → ${fmtNote(m.retake)}` : ""}
                                  </span>
                                ))}
                              </TD>
                              <TD className="text-center tabular-nums">{fmtNote(x.session1_average)}</TD>
                              <TD className="text-center tabular-nums">{fmtNote(x.retake_average)}</TD>
                              <TD className="text-center font-semibold tabular-nums">{fmtNote(x.average)}</TD>
                              <TD>
                                <StatusBadge value={x.status} map={UE_STATUS} />
                              </TD>
                            </TR>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card>
            )}
          </TabPanel>
        </>
      )}
    </div>
  );
}
