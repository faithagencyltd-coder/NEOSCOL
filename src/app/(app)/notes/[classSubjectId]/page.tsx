import { ClipboardList, FileSpreadsheet, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getPeriods } from "@/features/academic/queries";
import { canEditGradeBook } from "@/features/grades/access";
import { createAssessment, openGradeSlot } from "@/features/grades/actions";
import { getGradeBook, gradeStats } from "@/features/grades/queries";
import { todayIn } from "@/lib/dates";
import { requireOrganization } from "@/lib/auth/guards";
import { canAny } from "@/lib/auth/session";
import { isHigherOrg } from "@/features/university/config";
import { assessmentKindLabel, assessmentKinds, options } from "@/lib/labels";
import { readReportConfig } from "@/features/report-cards/config";
import { getReportCardConfig, getReportColumns } from "@/features/report-cards/queries";
import { Alert } from "@/components/ui/alert";
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

  const [periods, columns, rawConfig] = await Promise.all([
    getPeriods(organizationId, book.class.academic_year_id),
    getReportColumns(organizationId),
    getReportCardConfig(organizationId),
  ]);
  const today = todayIn(context.organization.timezone);
  const query = await searchParams;
  const requested = param(query, "periode");
  const slotError = param(query, "erreur");
  const current =
    periods.find((p) => p.id === requested) ??
    periods.find((p) => p.starts_on <= today && p.ends_on >= today) ??
    periods[0];
  const canEdit = await canEditGradeBook(context, book.teacher_id);
  const assessments = book.assessments
    .filter((a) => a.academic_period_id === current?.id)
    .sort((a, b) => (a.assessed_on < b.assessed_on ? 1 : -1));
  const title = `${book.subject?.name ?? "Matière"} · ${book.class.name}`;
  const higher = isHigherOrg(context.organization.type);
  // Saisie simple (module scolaire) : cases INT 1…n et DEV 1…m fixées par l'école.
  const slots = higher ? undefined : readReportConfig(rawConfig).slots;
  const system = periods.length > 0 && periods.every((p) => p.type === "semester") ? "semester" : "trimester";
  const slotCases = slots
    ? [
        ...Array.from({ length: slots[system].interro }, (_, i) => ({ group: "interro", slot: i + 1, label: `INT ${i + 1}` })),
        ...Array.from({ length: slots[system].devoir }, (_, i) => ({ group: "devoir", slot: i + 1, label: `DEV ${i + 1}` })),
      ]
    : [];

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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={`/api/notes/carnets/${book.id}/export`}>
              <FileSpreadsheet aria-hidden /> Exporter le carnet (Excel)
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={`/api/notes/carnets/${book.id}/export?format=csv`}>CSV</a>
          </Button>
        </div>
        {canEdit && current && !current.is_locked && !slots ? (
          <QuickFormDialog
            title={`Nouvelle évaluation — ${current.name}`}
            triggerLabel="Nouvelle évaluation"
            submitLabel="Créer et saisir les notes"
            action={createAssessment}
            hidden={{ class_subject_id: book.id, academic_period_id: current.id }}
            fields={[
              { name: "title", label: "Intitulé", required: true, placeholder: "Devoir surveillé n°2", wide: true },
              { name: "kind", label: "Type", type: "select", required: true, options: options(assessmentKinds(higher)), defaultValue: higher ? "continuous" : "test" },
              { name: "assessed_on", label: "Date", type: "date", required: true, defaultValue: today },
              { name: "coefficient", label: "Coefficient", type: "number", required: true, min: 0.5, step: "0.5", defaultValue: "1" },
              { name: "max_score", label: "Noté sur", type: "number", required: true, min: 1, defaultValue: "20" },
              // Colonnes du bulletin : Module Scolaire uniquement.
              ...(higher
                ? []
                : [
                    {
                      name: "column_key",
                      label: "Colonne du bulletin",
                      type: "select" as const,
                      options: columns.map((c) => ({ value: c.key, label: c.label })),
                      hint: "Compte dans cette colonne du bulletin (ex. INTERRO, DEVOIR, COMPO). Vide : placée automatiquement selon le type.",
                    },
                  ]),
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
          {slotError ? <Alert tone="danger">{slotError}</Alert> : null}
          {slots && current ? (
            <Card data-testid="slot-picker">
              <CardContent className="grid gap-3 pt-5">
                <div className="grid gap-0.5">
                  <h2 className="text-base font-semibold">Saisir des notes — {current.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {canEdit && !current.is_locked
                      ? "Choisissez l'interrogation ou le devoir, puis remplissez les notes des élèves."
                      : "Notes saisies par case. Cliquez pour consulter."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {slotCases.map((c) => {
                    const existing = book.assessments.find(
                      (a) => a.academic_period_id === current.id && a.column_key === c.group && a.slot === c.slot,
                    );
                    const filled = existing ? existing.grades.filter((g) => g.score !== null || g.is_exempt || g.is_absent).length : 0;
                    const status = existing ? `${filled} note${filled > 1 ? "s" : ""}` : "à saisir";
                    if (existing && !(canEdit && !current.is_locked)) {
                      return (
                        <Button key={c.label} asChild variant="secondary" className="h-auto min-w-24 flex-col gap-0 py-2">
                          <Link href={`/notes/evaluations/${existing.id}`}>
                            <span className="text-base font-semibold">{c.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">{status}</span>
                          </Link>
                        </Button>
                      );
                    }
                    if (!(canEdit && !current.is_locked)) {
                      return (
                        <span key={c.label} className="grid min-w-24 place-items-center rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                          <span className="font-semibold">{c.label}</span>
                          <span className="text-xs">aucune note</span>
                        </span>
                      );
                    }
                    return (
                      <form key={c.label} action={openGradeSlot}>
                        <input type="hidden" name="class_subject_id" value={book.id} />
                        <input type="hidden" name="academic_period_id" value={current.id} />
                        <input type="hidden" name="group" value={c.group} />
                        <input type="hidden" name="slot" value={c.slot} />
                        <Button type="submit" variant={existing ? "secondary" : "primary"} className="h-auto min-w-24 flex-col gap-0 py-2">
                          <span className="text-base font-semibold">{c.label}</span>
                          <span className={existing ? "text-xs font-normal text-muted-foreground" : "text-xs font-normal opacity-90"}>{status}</span>
                        </Button>
                      </form>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}
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
                            <span className="text-xs font-normal text-muted-foreground">{assessmentKindLabel(a.kind, higher)}</span>
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
