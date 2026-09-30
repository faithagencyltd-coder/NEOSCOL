"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { isHigherOrg } from "@/features/university/config";
import { ASSESSMENT_KINDS, UNIVERSITY_ASSESSMENT_KINDS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const assessmentSchema = z.object({
  class_subject_id: z.string().refine(isUuid, { error: "Matière invalide." }),
  academic_period_id: z.string({ error: "Choisissez la période." }).refine(isUuid, { error: "Choisissez la période." }),
  title: z.string({ error: "Titre requis." }).trim().min(1, { error: "Titre requis." }).max(120),
  kind: z.enum([...new Set([...Object.keys(ASSESSMENT_KINDS), ...Object.keys(UNIVERSITY_ASSESSMENT_KINDS)])] as [string, ...string[]], { error: "Type invalide." }),
  assessed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." }),
  coefficient: z.coerce.number().positive({ error: "Coefficient positif." }).max(100),
  max_score: z.coerce.number().positive({ error: "Barème positif." }).max(1000),
  column_key: z.string().regex(/^[a-z0-9_]{1,30}$/).optional(),
});

export async function createAssessment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const parsed = assessmentSchema.safeParse(
    readFields(formData, ["class_subject_id", "academic_period_id", "title", "kind", "assessed_on", "coefficient", "max_score", "column_key"]),
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  // Contrôle continu, soutenance et rattrapage : réservés à l'enseignement supérieur.
  const higher = isHigherOrg(auth.context.organization.type);
  if (!(parsed.data.kind in (higher ? UNIVERSITY_ASSESSMENT_KINDS : ASSESSMENT_KINDS))) {
    return { ok: false, message: "Type d'évaluation non disponible pour cet établissement.", fieldErrors: { kind: ["Type invalide."] } };
  }
  const supabase = await createClient();
  const { data: classSubject } = await supabase
    .from("class_subjects")
    .select("class_id, subject_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", parsed.data.class_subject_id)
    .maybeSingle();
  if (!classSubject) return { ok: false, message: "Matière introuvable." };
  const { data, error } = await supabase
    .from("assessments")
    .insert({ organization_id: auth.context.organization.id, ...parsed.data, ...classSubject })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "La création de l'évaluation a échoué.") };
  revalidatePath(`/notes/${parsed.data.class_subject_id}`);
  redirect(`/notes/evaluations/${data.id}`);
}

const gradesSchema = z
  .array(
    z.object({
      student_id: z.string().refine(isUuid),
      score: z.number().min(0).nullable(),
      is_absent: z.boolean(),
      is_exempt: z.boolean(),
      comment: z.string().max(300).optional(),
    }),
  )
  .max(500);

export async function saveGradeSheet(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!isUuid(assessmentId)) return { ok: false, message: "Évaluation introuvable." };
  let grades: z.infer<typeof gradesSchema>;
  try {
    grades = gradesSchema.parse(JSON.parse(String(formData.get("grades") ?? "[]")));
  } catch {
    return { ok: false, message: "Une note saisie n'est pas valide." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_grades", { p_assessment_id: assessmentId, p_grades: grades });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'enregistrement des notes a échoué.") };
  revalidatePath(`/notes/evaluations/${assessmentId}`);
  return { ok: true, message: `${data ?? 0} note(s) enregistrée(s).` };
}

export async function setAssessmentPublished(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!isUuid(assessmentId)) return { ok: false, message: "Évaluation introuvable." };
  const publish = formData.get("publish") === "true";
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("assessments")
    .update({ is_published: publish }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", assessmentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Action impossible.") };
  revalidatePath(`/notes/evaluations/${assessmentId}`);
  return { ok: true, message: publish ? "Notes publiées : les familles sont notifiées." : "Publication retirée." };
}

export async function deleteAssessment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const assessmentId = String(formData.get("assessment_id") ?? "");
  const classSubjectId = String(formData.get("class_subject_id") ?? "");
  if (!isUuid(assessmentId) || !isUuid(classSubjectId)) return { ok: false, message: "Évaluation introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("assessments")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", assessmentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Suppression impossible.") };
  revalidatePath(`/notes/${classSubjectId}`);
  redirect(`/notes/${classSubjectId}`);
}

/**
 * Validation des notes d'une évaluation (enseignant) ou réouverture
 * (administration, grades.manage). Le verrouillage est appliqué en base.
 */
export async function setGradesValidated(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const validate = formData.get("validate") === "true";
  const auth = validate ? await authorize("grades.enter", "grades.manage") : await authorize("grades.manage");
  if (!auth.ok) return auth;
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!isUuid(assessmentId)) return { ok: false, message: "Évaluation introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("assessments")
    .update({ grades_status: validate ? "validated" : "draft" }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", assessmentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Opération impossible.") };
  revalidatePath(`/notes/evaluations/${assessmentId}`);
  return { ok: true, message: validate ? "Notes validées : elles sont désormais verrouillées." : "Notes rouvertes pour correction." };
}

export type GradeImportPreview = {
  applied: boolean;
  counts: { ok: number; skip: number; error: number; missing: number };
  lines: { line: number; matricule: string; name: string; status: "ok" | "skip" | "error"; message: string; value: string }[];
};

/**
 * Import des notes d'une évaluation depuis Excel (.xlsx) ou CSV : 1) aperçu
 * ligne par ligne (erreurs, notes inchangées), 2) enregistrement des lignes
 * valides par save_grades — les droits et verrous restent appliqués par la base.
 */
export async function importGradeSheet(_: ActionResult<GradeImportPreview> | null, formData: FormData): Promise<ActionResult<GradeImportPreview>> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const assessmentId = String(formData.get("assessment_id") ?? "");
  if (!isUuid(assessmentId)) return { ok: false, message: "Évaluation introuvable." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez un fichier Excel (.xlsx) ou CSV." };
  const apply = formData.get("mode") === "apply";
  const { getAssessmentSheet } = await import("@/features/grades/queries");
  const { parseImportFile } = await import("@/features/migration/parse");
  const { checkGradeImport } = await import("@/features/grades/transfer");
  const sheet = await getAssessmentSheet(auth.context.organization.id, assessmentId);
  if (!sheet) return { ok: false, message: "Évaluation introuvable." };
  const parsed = await parseImportFile(file);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const checked = checkGradeImport(parsed.table, sheet.students, Number(sheet.assessment.max_score));
  if (!checked.ok) return { ok: false, message: checked.message };
  const preview = { counts: checked.counts, lines: checked.lines.slice(0, 500) };
  if (!apply) {
    return {
      ok: true,
      message: `${checked.counts.ok} note(s) prête(s), ${checked.counts.error} erreur(s), ${checked.counts.skip} inchangée(s). Vérifiez puis confirmez.`,
      data: { applied: false, ...preview },
    };
  }
  if (checked.grades.length === 0) return { ok: false, message: "Aucune note valide à enregistrer." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_grades", { p_assessment_id: assessmentId, p_grades: checked.grades });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'import des notes a échoué.") };
  await supabase.rpc("log_event", {
    p_organization_id: auth.context.organization.id,
    p_action: "grades.imported",
    p_entity_type: "assessments",
    p_entity_id: assessmentId,
    p_summary: `Import de ${data ?? 0} note(s) depuis ${file.name.slice(0, 80)} (${sheet.assessment.title})`,
  });
  revalidatePath(`/notes/evaluations/${assessmentId}`);
  return {
    ok: true,
    message: `${data ?? 0} note(s) importée(s)${checked.counts.error ? ` ; ${checked.counts.error} ligne(s) en erreur ignorée(s)` : ""}.`,
    data: { applied: true, ...preview },
  };
}
