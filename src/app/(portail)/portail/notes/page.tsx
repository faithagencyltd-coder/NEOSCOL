import { Download, FileText, NotebookPen } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LockedFeature } from "@/features/portal/components/locked-feature";
import { requirePortal } from "@/features/portal/context";
import { getStudentGrades, getStudentReportCards } from "@/features/portal/queries";
import { ASSESSMENT_KINDS } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Notes et bulletins" };

type Grade = Awaited<ReturnType<typeof getStudentGrades>>[number];

/** Moyenne /20 pondérée par les coefficients des évaluations (absences et dispenses exclues). */
function average(grades: Grade[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const g of grades) {
    if (g.score === null || g.is_absent || g.is_exempt) continue;
    const coef = Number(g.assessment.coefficient ?? 1);
    sum += (Number(g.score) / Number(g.assessment.max_score)) * 20 * coef;
    weight += coef;
  }
  return weight ? sum / weight : null;
}

export default async function PortalGradesPage({ searchParams }: PageProps<"/portail/notes">) {
  const { organization, parent, student, status } = await requirePortal();
  if (!student) return <EmptyState icon={NotebookPen} title="Aucun dossier rattaché" />;
  const tab = param(await searchParams, "onglet") === "bulletins" ? "bulletins" : "notes";
  const restricted = tab === "notes" ? status?.features.grades : status?.features.report_cards;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Notes et bulletins</h1>
        <p className="text-sm text-muted-foreground">
          {student.first_name} · {student.class_name ?? "classe non affectée"} — seules les notes publiées par l&apos;établissement apparaissent.
        </p>
      </div>
      <TabNav
        label="Notes ou bulletins"
        active={tab}
        tabs={[
          { key: "notes", label: "Notes", href: "/portail/notes" },
          { key: "bulletins", label: "Bulletins", href: "/portail/notes?onglet=bulletins" },
        ]}
      />
      {restricted && status ? (
        <LockedFeature feature={tab === "notes" ? "Notes" : "Bulletins"} overdue={status.overdue_amount} currency={organization.currency} parent={parent} />
      ) : tab === "notes" ? (
        <GradesList organizationId={organization.id} studentId={student.id} />
      ) : (
        <ReportCardsList organizationId={organization.id} studentId={student.id} />
      )}
    </>
  );
}

async function GradesList({ organizationId, studentId }: { organizationId: string; studentId: string }) {
  const grades = await getStudentGrades(organizationId, studentId);
  if (grades.length === 0) return <EmptyState icon={NotebookPen} title="Aucune note publiée" description="Les notes apparaissent dès leur publication par l'enseignant." />;
  const periods = new Map<string, { name: string; sequence: number; grades: Grade[] }>();
  for (const g of grades) {
    const key = g.assessment.period?.id ?? "none";
    const entry = periods.get(key) ?? { name: g.assessment.period?.name ?? "Hors période", sequence: g.assessment.period?.sequence ?? 99, grades: [] };
    entry.grades.push(g);
    periods.set(key, entry);
  }
  return (
    <div className="grid gap-5">
      {[...periods.values()]
        .sort((a, b) => b.sequence - a.sequence)
        .map((period) => {
          const subjects = new Map<string, { color: string | null; grades: Grade[] }>();
          for (const g of period.grades) {
            const name = g.assessment.subject?.name ?? "Autre";
            const entry = subjects.get(name) ?? { color: g.assessment.subject?.color ?? null, grades: [] };
            entry.grades.push(g);
            subjects.set(name, entry);
          }
          return (
            <section key={period.name} className="grid gap-3" aria-label={period.name}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{period.name}</h2>
              {[...subjects.entries()]
                .sort(([a], [b]) => a.localeCompare(b, "fr"))
                .map(([name, subject]) => {
                  const avg = average(subject.grades);
                  return (
                    <Card key={name} className="overflow-hidden">
                      <div className="flex items-center justify-between gap-3 border-l-4 px-4 py-3" style={{ borderLeftColor: subject.color ?? "var(--primary)" }}>
                        <h3 className="font-semibold">{name}</h3>
                        <span className="text-sm">
                          Moyenne : <strong className="tabular-nums">{avg === null ? "—" : `${formatNumber(Math.round(avg * 100) / 100)}/20`}</strong>
                        </span>
                      </div>
                      <ul className="divide-y divide-border border-t border-border">
                        {subject.grades.map((g) => (
                          <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                            <span className="grid min-w-0 flex-1">
                              <span className="truncate font-medium">{g.assessment.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {ASSESSMENT_KINDS[g.assessment.kind as keyof typeof ASSESSMENT_KINDS] ?? g.assessment.kind}
                                {g.assessment.assessed_on ? ` · ${formatDate(g.assessment.assessed_on)}` : ""} · coef. {formatNumber(Number(g.assessment.coefficient))}
                              </span>
                              {g.comment ? <span className="text-xs text-muted-foreground">« {g.comment} »</span> : null}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {g.is_absent ? <Badge tone="danger">Absent</Badge> : g.is_exempt ? <Badge tone="neutral">Dispensé</Badge> : `${formatNumber(Number(g.score))}/${formatNumber(Number(g.assessment.max_score))}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
            </section>
          );
        })}
    </div>
  );
}

async function ReportCardsList({ organizationId, studentId }: { organizationId: string; studentId: string }) {
  const cards = await getStudentReportCards(organizationId, studentId);
  if (cards.length === 0) return <EmptyState icon={FileText} title="Aucun bulletin publié" description="Les bulletins apparaissent ici dès leur publication par l'établissement." />;
  return (
    <div className="grid gap-3">
      {cards.map((c) => (
        <Card key={c.id} className="flex flex-wrap items-center gap-4 p-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <FileText className="size-5" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="font-semibold">Bulletin — {c.period?.name ?? "Période"}</h2>
            <p className="text-sm text-muted-foreground">
              {c.class?.name} · Moyenne {c.average === null ? "—" : `${formatNumber(Number(c.average))}/20`}
              {c.rank ? ` · Rang ${c.rank}${c.class_size ? `/${c.class_size}` : ""}` : ""}
              {c.decision ? ` · ${c.decision}` : ""}
            </p>
          </div>
          <a
            href={`/api/documents/bulletins/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Download className="size-4" aria-hidden /> Télécharger (PDF)
          </a>
        </Card>
      ))}
    </div>
  );
}
