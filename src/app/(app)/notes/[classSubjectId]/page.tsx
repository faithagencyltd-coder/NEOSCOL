import { ClipboardList, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getPeriods } from "@/features/academic/queries";
import { canEditGradeBook } from "@/features/grades/access";
import { createAssessment } from "@/features/grades/actions";
import { getGradeBook, gradeStats } from "@/features/grades/queries";
import { todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";
import { ASSESSMENT_KINDS, options } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Carnet de notes" };

const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2).replace(".", ","));

export default async function GradeBookPage({ params, searchParams }: PageProps<"/notes/[classSubjectId]">) {
  const context = await requireOrganization();
  if (!canAny(context, ["grades.read", "grades.enter", "grades.manage"])) notFound();
  const { classSubjectId } = await params;
  if (!isUuid(classSubjectId)) notFound();
  const organizationId = context.organization.id;
  const book = await getGradeBook(organizationId, classSubjectId);
  if (!book || !book.class) notFound();

  const periods = await getPeriods(organizationId, book.class.academic_year_id);
  const today = todayIn(context.organization.timezone);
  const requested = param(await searchParams, "periode");
  const current =
    periods.find((p) => p.id === requested) ??
    periods.find((p) => p.starts_on <= today && p.ends_on >= today) ??
    periods[0];
  const canEdit = await canEditGradeBook(context, book.teacher_id);
  const assessments = book.assessments
    .filter((a) => a.academic_period_id === current?.id)
    .sort((a, b) => (a.assessed_on < b.assessed_on ? 1 : -1));
  const title = `${book.subject?.name ?? "Matière"} · ${book.class.name}`;

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/notes" className="hover:text-primary">
          Notes
        </Link>{" "}
        / <span className="text-foreground">{title}</span>
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold sm:text-[26px]">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Coefficient {book.coefficient}
            {book.teacher ? ` · ${book.teacher.first_name} ${book.teacher.last_name}` : ""}
          </p>
        </div>
        {canEdit && current && !current.is_locked ? (
          <QuickFormDialog
            title={`Nouvelle évaluation — ${current.name}`}
            triggerLabel="Nouvelle évaluation"
            submitLabel="Créer et saisir les notes"
            action={createAssessment}
            hidden={{ class_subject_id: book.id, academic_period_id: current.id }}
            fields={[
              { name: "title", label: "Intitulé", required: true, placeholder: "Devoir surveillé n°2", wide: true },
              { name: "kind", label: "Type", type: "select", required: true, options: options(ASSESSMENT_KINDS), defaultValue: "test" },
              { name: "assessed_on", label: "Date", type: "date", required: true, defaultValue: today },
              { name: "coefficient", label: "Coefficient", type: "number", required: true, min: 0.5, step: "0.5", defaultValue: "1" },
              { name: "max_score", label: "Noté sur", type: "number", required: true, min: 1, defaultValue: "20" },
            ]}
          />
        ) : null}
      </div>

      {periods.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={ClipboardList} title="Aucune période définie" description="La direction doit créer les périodes (trimestres, semestres…)." />
          </CardContent>
        </Card>
      ) : (
        <>
          <TabNav
            label="Périodes"
            active={current?.id ?? ""}
            tabs={periods.map((p) => ({
              key: p.id,
              label: p.is_locked ? `${p.name} (verrouillée)` : p.name,
              href: `/notes/${book.id}?periode=${p.id}`,
              count: book.assessments.filter((a) => a.academic_period_id === p.id).length,
            }))}
          />
          {current?.is_locked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" aria-hidden /> Période verrouillée : les notes ne sont plus modifiables.
            </p>
          ) : null}
          <Card className="overflow-hidden">
            {assessments.length === 0 ? (
              <CardContent className="pt-5">
                <EmptyState icon={ClipboardList} title="Aucune évaluation sur cette période" />
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Évaluation</TH>
                    <TH>Date</TH>
                    <TH className="text-right">Coef.</TH>
                    <TH className="text-right">Notes</TH>
                    <TH className="text-right">Moyenne</TH>
                    <TH>Statut</TH>
                  </tr>
                </THead>
                <tbody>
                  {assessments.map((a) => {
                    const stats = gradeStats(a.grades, a.max_score);
                    return (
                      <TR key={a.id}>
                        <TD>
                          <Link href={`/notes/evaluations/${a.id}`} className="grid font-semibold hover:text-primary">
                            {a.title}
                            <span className="text-xs font-normal text-muted-foreground">{ASSESSMENT_KINDS[a.kind as keyof typeof ASSESSMENT_KINDS] ?? a.kind}</span>
                          </Link>
                        </TD>
                        <TD className="text-muted-foreground">{formatDate(a.assessed_on, "fr-FR", { dateStyle: "short" })}</TD>
                        <TD className="text-right tabular-nums">{a.coefficient}</TD>
                        <TD className="text-right tabular-nums">{stats.count}</TD>
                        <TD className="text-right font-semibold tabular-nums">
                          {fmt(stats.average)} <span className="text-xs font-normal text-muted-foreground">/ {a.max_score}</span>
                        </TD>
                        <TD>{a.is_published ? <Badge tone="success">Publiée</Badge> : <Badge>Brouillon</Badge>}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
