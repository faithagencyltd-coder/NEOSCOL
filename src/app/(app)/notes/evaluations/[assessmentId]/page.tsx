import { Eye, EyeOff, Lock, LockOpen, ShieldCheck, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canEditGradeBook } from "@/features/grades/access";
import { deleteAssessment, setAssessmentPublished, setGradesValidated } from "@/features/grades/actions";
import { GradeSheet } from "@/features/grades/components/grade-sheet";
import { getAssessmentSheet } from "@/features/grades/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can, canAny } from "@/lib/auth/session";
import { ASSESSMENT_KINDS } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Saisie des notes" };

export default async function AssessmentPage({ params }: PageProps<"/notes/evaluations/[assessmentId]">) {
  const context = await requireOrganization();
  if (!canAny(context, ["grades.read", "grades.enter", "grades.manage"])) notFound();
  const { assessmentId } = await params;
  if (!isUuid(assessmentId)) notFound();
  const sheet = await getAssessmentSheet(context.organization.id, assessmentId);
  if (!sheet) notFound();
  const { assessment, students } = sheet;
  const locked = assessment.period?.is_locked ?? false;
  const manage = can(context, "grades.manage");
  const lockAfterValidation =
    ((context.organization.settings as { grading?: { lock_after_validation?: boolean } } | null)?.grading?.lock_after_validation ?? true) !== false;
  const validated = assessment.grades_status === "validated";
  const isTeacherOfSubject = await canEditGradeBook(context, assessment.class_subject?.teacher_id ?? null);
  const canEdit = !locked && isTeacherOfSubject && (!validated || !lockAfterValidation || manage);

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/notes" className="hover:text-primary">
          Notes
        </Link>{" "}
        /{" "}
        <Link href={`/notes/${assessment.class_subject_id}`} className="hover:text-primary">
          {assessment.subject?.name} · {assessment.class?.name}
        </Link>{" "}
        / <span className="text-foreground">{assessment.title}</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold sm:text-[26px]">{assessment.title}</h1>
            {assessment.is_published ? <Badge tone="success">Publiée</Badge> : <Badge>Non publiée</Badge>}
            {validated ? (
              <Badge tone="info">
                <ShieldCheck className="size-3.5" aria-hidden /> Notes validées
              </Badge>
            ) : (
              <Badge tone="warning">Brouillon</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {ASSESSMENT_KINDS[assessment.kind as keyof typeof ASSESSMENT_KINDS] ?? assessment.kind} ·{" "}
            {formatDate(assessment.assessed_on, "fr-FR", { dateStyle: "long" })} · coefficient {assessment.coefficient} · noté sur{" "}
            {assessment.max_score} · {assessment.period?.name}
          </p>
        </div>
        {isTeacherOfSubject && !locked ? (
          <div className="flex flex-wrap gap-2">
            {!validated ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <ShieldCheck aria-hidden /> Valider les notes
                  </Button>
                }
                title="Valider les notes ?"
                description={
                  lockAfterValidation
                    ? "Les notes seront verrouillées : seule l'administration pourra les rouvrir. Les moyennes des bulletins sont recalculées automatiquement."
                    : "Les notes sont marquées comme validées. Les moyennes des bulletins sont recalculées automatiquement."
                }
                confirmLabel="Valider"
                action={setGradesValidated}
                fields={{ assessment_id: assessment.id, validate: "true" }}
              />
            ) : manage ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <LockOpen aria-hidden /> Rouvrir les notes
                  </Button>
                }
                title="Rouvrir les notes ?"
                description="L'enseignant pourra de nouveau les modifier ; la réouverture est tracée dans le journal d'audit."
                confirmLabel="Rouvrir"
                action={setGradesValidated}
                fields={{ assessment_id: assessment.id, validate: "false" }}
              />
            ) : null}
          </div>
        ) : null}
        {isTeacherOfSubject && !locked ? (
          <div className="flex flex-wrap gap-2">
            {/* Publier ne modifie pas les notes : possible aussi après validation. */}
            <ConfirmAction
              trigger={
                <Button variant={assessment.is_published ? "secondary" : "primary"}>
                  {assessment.is_published ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  {assessment.is_published ? "Retirer la publication" : "Publier les notes"}
                </Button>
              }
              title={assessment.is_published ? "Retirer la publication ?" : "Publier les notes ?"}
              description={
                assessment.is_published
                  ? "Les notes ne seront plus visibles des élèves et des parents."
                  : "Les élèves et leurs parents verront ces notes et recevront une notification."
              }
              confirmLabel={assessment.is_published ? "Retirer" : "Publier"}
              action={setAssessmentPublished}
              fields={{ assessment_id: assessment.id, publish: assessment.is_published ? "false" : "true" }}
            />
            {canEdit ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-danger">
                    <Trash2 aria-hidden /> Supprimer
                  </Button>
                }
                title="Supprimer cette évaluation ?"
                description="L'évaluation et toutes ses notes seront supprimées (l'opération reste tracée dans le journal d'audit)."
                confirmLabel="Supprimer"
                tone="danger"
                action={deleteAssessment}
                fields={{ assessment_id: assessment.id, class_subject_id: assessment.class_subject_id }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {locked ? (
        <Alert tone="warning" title="Période verrouillée">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden /> Les notes de cette période ne sont plus modifiables.
          </span>
        </Alert>
      ) : null}
      {validated && lockAfterValidation && !manage && isTeacherOfSubject ? (
        <Alert tone="info" title="Notes validées et verrouillées">
          Toute correction doit être demandée à l&apos;administration.
        </Alert>
      ) : null}
      {!isTeacherOfSubject && !locked ? <Alert tone="info">Consultation seule : vous n&apos;enseignez pas cette matière.</Alert> : null}

      <GradeSheet
        assessmentId={assessment.id}
        maxScore={assessment.max_score}
        students={students}
        grades={assessment.grades}
        readOnly={!canEdit}
      />
    </div>
  );
}
