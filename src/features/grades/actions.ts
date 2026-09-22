"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { ASSESSMENT_KINDS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const assessmentSchema = z.object({
  class_subject_id: z.string().refine(isUuid, { error: "Matière invalide." }),
  academic_period_id: z.string({ error: "Choisissez la période." }).refine(isUuid, { error: "Choisissez la période." }),
  title: z.string({ error: "Titre requis." }).trim().min(1, { error: "Titre requis." }).max(120),
  kind: z.enum(Object.keys(ASSESSMENT_KINDS) as [keyof typeof ASSESSMENT_KINDS], { error: "Type invalide." }),
  assessed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." }),
  coefficient: z.coerce.number().positive({ error: "Coefficient positif." }).max(100),
  max_score: z.coerce.number().positive({ error: "Barème positif." }).max(1000),
});

export async function createAssessment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const parsed = assessmentSchema.safeParse(
    readFields(formData, ["class_subject_id", "academic_period_id", "title", "kind", "assessed_on", "coefficient", "max_score"]),
  );
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
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
