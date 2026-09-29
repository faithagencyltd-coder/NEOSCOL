import { Award, BookOpenCheck, Briefcase, GraduationCap, Mic, ScrollText } from "lucide-react";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { addCourseRegistration, registerCurriculum, setCourseRegistration } from "@/features/university/actions";
import { DEFENSE_STATUS, DIPLOMA_STATUS, fmtCredits, fmtNote, INTERNSHIP_HOSTS, THESIS_KINDS, THESIS_STATUS, UE_STATUS, type UniversityConfig } from "@/features/university/config";
import type { AcademicRecord } from "@/features/university/queries";
import { formatDate, formatDateTime } from "@/lib/utils/format";

const ENROLLMENT_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "danger" | "info" }> = {
  validated: { label: "Validée", tone: "success" },
  pending: { label: "En attente", tone: "warning" },
  draft: { label: "Brouillon", tone: "neutral" },
  rejected: { label: "Refusée", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};
const ENROLLMENT_TYPE: Record<string, string> = { new: "Première inscription", reenrollment: "Réinscription", transfer: "Transfert" };
const REG_STATUS: Record<string, { label: string; tone: "success" | "neutral" | "info" }> = {
  registered: { label: "Inscrite", tone: "success" },
  dropped: { label: "Abandonnée", tone: "neutral" },
  exempted: { label: "Dispensée", tone: "info" },
};
const INTERNSHIP_STATUS: Record<string, string> = { planned: "Prévu", ongoing: "En cours", completed: "Terminé", cancelled: "Annulé" };
const d = (v: string | null | undefined) => (v ? formatDate(v, "fr-FR", { dateStyle: "medium" }) : "—");

type SubjectLine = { name?: string; coefficient?: number; session1?: number | null; retake?: number | null; average?: number | null };

/** Crédits obtenus cumulés par cycle (tous semestres, toutes années). */
function creditsByCycle(record: AcademicRecord) {
  const cycles = new Map<string, { name: string; required: number | null; earned: number; total: number }>();
  for (const s of record.semesters) {
    const e = record.enrollments.find((x) => x.id === s.enrollment_id);
    const cycle = e?.level?.cycle;
    const key = cycle?.id ?? "—";
    const row = cycles.get(key) ?? { name: cycle?.name ?? "Hors cycle", required: cycle?.credits_required ?? null, earned: 0, total: 0 };
    row.earned += Number(s.credits_earned ?? 0);
    row.total += Number(s.credits_total ?? 0);
    cycles.set(key, row);
  }
  return [...cycles.values()];
}

/** Dossier académique permanent : parcours de toutes les années, crédits par cycle, stages, mémoires, soutenances, diplômes. */
export function AcademicRecordTab({ record, config }: { record: AcademicRecord; config: UniversityConfig }) {
  const cycles = creditsByCycle(record);
  const f = config.features;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>Parcours universitaire</CardTitle>
          <CardDescription>Toutes les inscriptions administratives, année par année. L&apos;historique n&apos;est jamais effacé.</CardDescription>
        </CardHeader>
        {record.enrollments.length === 0 ? (
          <CardContent>
            <EmptyState icon={GraduationCap} title="Aucune inscription" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Année</TH>
                <TH>Filière</TH>
                <TH>Niveau</TH>
                <TH>Parcours</TH>
                <TH>Promotion</TH>
                <TH>Type</TH>
                <TH>Statut</TH>
              </TR>
            </THead>
            <tbody>
              {record.enrollments.map((e) => (
                <TR key={e.id}>
                  <TD className="font-medium">
                    {e.academic_year?.name ?? "—"} {e.academic_year?.is_current ? <Badge tone="info">En cours</Badge> : null}
                  </TD>
                  <TD className="text-sm">
                    {e.program?.name ?? "—"}
                    {e.program?.degree_title ? <span className="block text-xs text-muted-foreground">{e.program.degree_title}</span> : null}
                  </TD>
                  <TD className="text-sm">{e.level?.name ?? "—"}</TD>
                  <TD className="text-sm">{e.track?.name ?? "—"}</TD>
                  <TD className="text-sm">{e.class?.name ?? "—"}</TD>
                  <TD className="text-sm">{ENROLLMENT_TYPE[e.type] ?? e.type}</TD>
                  <TD>
                    <StatusBadge value={e.status} map={ENROLLMENT_STATUS} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {f.credits ? (
        <Card>
          <CardHeader>
            <CardTitle>Crédits par cycle</CardTitle>
            <CardDescription>Crédits capitalisés (UE validées, compensées ou accordées par le jury).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cycles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun résultat calculé.</p>
            ) : (
              cycles.map((c) => {
                const pct = c.required ? Math.min(100, Math.round((c.earned / c.required) * 100)) : null;
                return (
                  <div key={c.name} className="grid gap-2 rounded-2xl border border-border p-4">
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="font-display text-2xl font-semibold tabular-nums">
                      {fmtCredits(c.earned)}
                      <span className="text-base text-muted-foreground"> / {c.required ? fmtCredits(c.required) : fmtCredits(c.total)} crédits</span>
                    </p>
                    {pct !== null ? (
                      <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Crédits ${c.name}`}>
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {f.internships ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="size-4" aria-hidden /> Stages
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {record.internships.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun stage.</p>
              ) : (
                record.internships.map((i) => (
                  <div key={i.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <p className="font-medium">
                      {i.company_name} <span className="text-muted-foreground">({INTERNSHIP_HOSTS[i.host_kind ?? ""] ?? "—"})</span>
                    </p>
                    <p className="text-muted-foreground">
                      {d(i.starts_on)} → {d(i.ends_on)} · {INTERNSHIP_STATUS[i.status] ?? i.status}
                      {i.evaluation_score !== null ? ` · évaluation ${fmtNote(i.evaluation_score)}/20` : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
        {f.theses ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="size-4" aria-hidden /> Mémoire / thèse
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {record.theses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun mémoire.</p>
              ) : (
                record.theses.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <p className="font-medium">
                      {THESIS_KINDS[t.kind] ?? t.kind} : {t.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <StatusBadge value={t.status} map={THESIS_STATUS} />
                      {t.director_name ? `Directeur : ${t.director_name}` : null}
                      {t.grade !== null ? ` · ${fmtNote(t.grade)}/20` : null}
                      {t.mention ? ` · ${t.mention}` : null}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
        {f.defenses ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="size-4" aria-hidden /> Soutenances
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {record.defenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune soutenance.</p>
              ) : (
                record.defenses.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <StatusBadge value={s.status} map={DEFENSE_STATUS} />
                      {s.scheduled_at ? formatDateTime(s.scheduled_at, "fr-FR") : ""}
                      {s.room?.name ? ` · ${s.room.name}` : ""}
                      {s.grade !== null ? ` · ${fmtNote(s.grade)}/20` : ""}
                      {s.mention ? ` · ${s.mention}` : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="size-4" aria-hidden /> Diplômes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {record.diplomas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun diplôme délivré.</p>
            ) : (
              record.diplomas.map((x) => (
                <div key={x.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                  <p className="font-medium">{x.title}</p>
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    {x.source === "app" ? <StatusBadge value={x.status ?? "issued"} map={DIPLOMA_STATUS} /> : <Badge tone="neutral">Antérieur</Badge>}
                    {x.number ? `N° ${x.number}` : ""}
                    {x.year_label ? ` · ${x.year_label}` : ""}
                    {x.mention ? ` · ${x.mention}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Inscription pédagogique : UE suivies par semestre (distincte de l'inscription
 * administrative). Ajout d'UE optionnelles, dispense, abandon, réinscription.
 */
export function PedagogicalTab({
  studentId,
  record,
  periods,
  units,
  canManage,
  semesterLabel,
}: {
  studentId: string;
  record: AcademicRecord;
  periods: { id: string; name: string; academic_year_id: string; sequence: number }[];
  units: { id: string; code: string; name: string; credits: number; semester_no: number; program_id: string | null; level_id: string | null; is_optional: boolean }[];
  canManage: boolean;
  semesterLabel: string;
}) {
  const enrollments = record.enrollments.filter((e) => e.status === "validated");
  if (enrollments.length === 0) return <EmptyState icon={BookOpenCheck} title="Aucune inscription administrative validée" description="L'inscription pédagogique suit l'inscription administrative." />;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      {enrollments.map((e) => {
        const yearPeriods = periods.filter((p) => p.academic_year_id === e.academic_year?.id).sort((a, b) => a.sequence - b.sequence);
        return (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {e.academic_year?.name} — {e.program?.name} · {e.level?.name}
                {e.academic_year?.is_current ? <Badge tone="info">Année en cours</Badge> : null}
              </CardTitle>
              <CardDescription>{e.track?.name ? `Parcours : ${e.track.name}` : "Tronc commun"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {yearPeriods.length === 0 ? <p className="text-sm text-muted-foreground">Aucun {semesterLabel.toLowerCase()} défini pour cette année.</p> : null}
              {yearPeriods.map((p) => {
                const regs = record.registrations.filter((r) => r.enrollment_id === e.id && r.academic_period_id === p.id);
                const registered = regs.filter((r) => r.status === "registered");
                const credits = registered.reduce((s, r) => s + Number(r.unit?.credits ?? 0), 0);
                const regIds = new Set(regs.map((r) => r.unit?.id));
                const addable = units.filter((u) => u.program_id === e.program_id && (!u.level_id || u.level_id === e.level_id) && u.semester_no === p.sequence && !regIds.has(u.id));
                return (
                  <div key={p.id} className="grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {p.name} · {registered.length} UE · {fmtCredits(credits)} crédits
                      </p>
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <ConfirmAction
                            trigger={
                              <Button variant="secondary" size="sm">
                                Inscrire aux UE obligatoires
                              </Button>
                            }
                            title={`Inscription pédagogique — ${p.name}`}
                            description="Ajoute les UE obligatoires de la filière, du niveau et du parcours qui ne sont pas encore inscrites."
                            confirmLabel="Inscrire"
                            action={registerCurriculum}
                            fields={{ enrollment_id: e.id, period_id: p.id, student_id: studentId }}
                          />
                          {addable.length > 0 ? (
                            <QuickFormDialog
                              title={`Ajouter une UE — ${p.name}`}
                              triggerLabel="Ajouter une UE"
                              action={addCourseRegistration}
                              hidden={{ enrollment_id: e.id, period_id: p.id, student_id: studentId }}
                              fields={[
                                {
                                  name: "teaching_unit_id",
                                  label: "UE",
                                  type: "select",
                                  required: true,
                                  wide: true,
                                  options: addable.map((u) => ({ value: u.id, label: `${u.code} — ${u.name} (${fmtCredits(u.credits)} cr.)${u.is_optional ? " · optionnelle" : ""}` })),
                                },
                              ]}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {regs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune UE inscrite.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <Table>
                          <THead>
                            <TR>
                              <TH>UE</TH>
                              <TH>Crédits</TH>
                              <TH>Statut</TH>
                              {canManage ? <TH className="text-right">Actions</TH> : null}
                            </TR>
                          </THead>
                          <tbody>
                            {regs
                              .sort((a, b) => `${a.unit?.code}`.localeCompare(`${b.unit?.code}`))
                              .map((r) => (
                                <TR key={r.id}>
                                  <TD className="text-sm">
                                    <span className="font-mono text-xs text-primary">{r.unit?.code}</span> {r.unit?.name}
                                  </TD>
                                  <TD>{fmtCredits(r.unit?.credits)}</TD>
                                  <TD>
                                    <StatusBadge value={r.status} map={REG_STATUS} />
                                  </TD>
                                  {canManage ? (
                                    <TD className="text-right">
                                      <div className="flex flex-wrap justify-end gap-1">
                                        {(["registered", "exempted", "dropped"] as const)
                                          .filter((s) => s !== r.status)
                                          .map((s) => (
                                            <ConfirmAction
                                              key={s}
                                              trigger={
                                                <Button variant="ghost" size="sm">
                                                  {s === "registered" ? "Réinscrire" : s === "exempted" ? "Dispenser" : "Abandon"}
                                                </Button>
                                              }
                                              title={`${r.unit?.code} : ${REG_STATUS[s]!.label.toLowerCase()} ?`}
                                              description="Les résultats du semestre sont recalculés au prochain calcul."
                                              confirmLabel="Confirmer"
                                              action={setCourseRegistration}
                                              fields={{ id: r.id, status: s, student_id: studentId }}
                                            />
                                          ))}
                                      </div>
                                    </TD>
                                  ) : null}
                                </TR>
                              ))}
                          </tbody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Résultats par semestre : moyennes des UE (session 1, rattrapage, finale), crédits, décision. */
export function ResultsTab({ record, showRank, transcriptHref }: { record: AcademicRecord; showRank: boolean; transcriptHref?: (periodId: string) => string }) {
  const semesters = [...record.semesters].sort((a, b) =>
    `${a.period?.academic_year?.name ?? ""}${a.period?.sequence ?? 0}`.localeCompare(`${b.period?.academic_year?.name ?? ""}${b.period?.sequence ?? 0}`),
  );
  if (semesters.length === 0) return <EmptyState icon={GraduationCap} title="Aucun résultat calculé" description="Les résultats apparaissent après le calcul par la scolarité ou le jury." />;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      {semesters.map((s) => {
        const ues = record.ues.filter((u) => u.enrollment_id === s.enrollment_id && u.academic_period_id === s.academic_period_id).sort((a, b) => `${a.unit?.code}`.localeCompare(`${b.unit?.code}`));
        return (
          <Card key={s.id}>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid gap-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {s.period?.name} — {s.period?.academic_year?.name}
                  {s.validated ? <Badge tone="success">{s.compensated ? "Validé par compensation" : "Validé"}</Badge> : <Badge tone="warning">Non validé</Badge>}
                  {!s.published_at ? <Badge tone="neutral">Non publié</Badge> : null}
                </CardTitle>
                <CardDescription>
                  Moyenne {fmtNote(s.average)}/20 · {fmtCredits(s.credits_earned)} / {fmtCredits(s.credits_total)} crédits
                  {showRank && s.rank ? ` · rang ${s.rank}/${s.population}` : ""}
                  {s.decision ? ` · ${s.decision}` : ""}
                </CardDescription>
              </div>
              {transcriptHref ? (
                <Button asChild variant="secondary" size="sm">
                  <a href={transcriptHref(s.academic_period_id)} target="_blank" rel="noreferrer">
                    Relevé de notes (PDF)
                  </a>
                </Button>
              ) : null}
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>UE et matières</TH>
                    <TH>Session 1</TH>
                    <TH>Rattrapage</TH>
                    <TH>Moyenne</TH>
                    <TH>Crédits</TH>
                    <TH>Statut</TH>
                  </TR>
                </THead>
                <tbody>
                  {ues.map((u) => (
                    <TR key={u.teaching_unit_id}>
                      <TD className="text-sm">
                        <span className="font-medium">
                          <span className="font-mono text-xs text-primary">{u.unit?.code}</span> {u.unit?.name}
                        </span>
                        {((u.subjects as SubjectLine[] | null) ?? []).map((m) => (
                          <span key={m.name} className="block text-xs text-muted-foreground">
                            {m.name} : {fmtNote(m.session1)}
                            {m.retake !== null && m.retake !== undefined ? ` → ${fmtNote(m.retake)}` : ""}
                          </span>
                        ))}
                      </TD>
                      <TD className="tabular-nums">{fmtNote(u.session1_average)}</TD>
                      <TD className="tabular-nums">{fmtNote(u.retake_average)}</TD>
                      <TD className="font-semibold tabular-nums">{fmtNote(u.average)}</TD>
                      <TD className="tabular-nums">
                        {fmtCredits(u.credits_earned)} / {fmtCredits(u.credits)}
                      </TD>
                      <TD>
                        <StatusBadge value={u.status} map={UE_STATUS} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Les notes détaillées par évaluation sont dans l&apos;onglet{" "}
        <Link href="?onglet=notes" className="text-primary underline-offset-2 hover:underline">
          Notes
        </Link>
        .
      </p>
    </div>
  );
}
