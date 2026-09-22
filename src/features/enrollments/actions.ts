"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEnrollmentForms } from "@/features/enrollments/queries";
import { parseCustomValues, parseFields } from "@/features/forms/fields";
import { GUARDIAN_FIELDS, guardianSchema, STUDENT_FIELDS, studentSchema } from "@/features/students/schemas";
import { authorize } from "@/lib/auth/authorize";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid, likePattern, normalizeSearch } from "@/lib/utils/search-params";
import type { Enums } from "@/types/database";

type FieldErrors = Record<string, string[] | undefined>;
const prefixed = (errors: FieldErrors, prefix: string): FieldErrors =>
  Object.fromEntries(Object.entries(errors).map(([key, value]) => [`${prefix}${key}`, value]));

const baseSchema = z.object({
  type: z.enum(["new", "reenrollment", "transfer"], { error: "Type d'inscription invalide." }),
  academic_year_id: z.string().refine(isUuid, { error: "Choisissez l'année scolaire." }),
  class_id: z.string({ error: "Choisissez la classe." }).refine(isUuid, { error: "Choisissez la classe." }),
  notes: z.string().trim().max(2000).optional(),
});

export async function createEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok) return auth;
  const organizationId = auth.context.organization.id;

  const base = baseSchema.safeParse(readFields(formData, ["type", "academic_year_id", "class_id", "notes"]));
  const existingStudentId = String(formData.get("student_id") ?? "");
  const isExisting = isUuid(existingStudentId);

  const errors: FieldErrors = {};
  if (!base.success) Object.assign(errors, z.flattenError(base.error).fieldErrors);

  let student: z.infer<typeof studentSchema> | null = null;
  if (formData.get("student_mode") === "existing" && !isExisting) {
    errors.student_id = ["Sélectionnez l'élève à inscrire."];
  } else if (!isExisting) {
    const parsed = studentSchema.safeParse(readFields(formData, STUDENT_FIELDS, "student_"));
    if (parsed.success) student = parsed.data;
    else Object.assign(errors, prefixed(z.flattenError(parsed.error).fieldErrors, "student_"));
  }

  const guardianRaw = readFields(formData, GUARDIAN_FIELDS, "guardian_");
  let guardian: z.infer<typeof guardianSchema> | null = null;
  if (guardianRaw.first_name || guardianRaw.last_name || guardianRaw.phone) {
    const parsed = guardianSchema.safeParse(guardianRaw);
    if (parsed.success) guardian = parsed.data;
    else Object.assign(errors, prefixed(z.flattenError(parsed.error).fieldErrors, "guardian_"));
  }

  const forms = await getEnrollmentForms(organizationId);
  const form = base.success && base.data.type === "reenrollment" ? (forms.reenrollment ?? forms.enrollment) : forms.enrollment;
  const custom = parseCustomValues(form?.fields ?? [], formData);
  if (!custom.ok) Object.assign(errors, custom.errors);

  if (!base.success || Object.keys(errors).length > 0 || !custom.ok) {
    return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: errors };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_enrollment_application", {
    p_organization_id: organizationId,
    p_payload: {
      type: base.data.type,
      submit: formData.get("intent") === "submit",
      student_id: isExisting ? existingStudentId : undefined,
      student: student ?? undefined,
      guardian: guardian ?? undefined,
      academic_year_id: base.data.academic_year_id,
      class_id: base.data.class_id,
      form_definition_id: form?.id,
      form_data: custom.values,
      notes: base.data.notes,
    },
  });
  if (error || !id) {
    return {
      ok: false,
      message:
        error?.code === "23505"
          ? "Cet élève a déjà une inscription en cours ou validée dans cette classe."
          : dbErrorMessage(error, "L'enregistrement de l'inscription a échoué."),
    };
  }
  revalidatePath("/inscriptions");
  revalidatePath("/eleves");
  redirect(`/inscriptions/${id}?cree=1`);
}

async function setStatus(
  enrollmentId: string,
  organizationId: string,
  values: { status: "pending" | "rejected" | "cancelled"; decision_reason?: string },
  from: Enums<"enrollment_status">[],
) {
  const supabase = await createClient();
  return supabase
    .from("enrollments")
    .update(values, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("id", enrollmentId)
    .in("status", from);
}

function refresh(enrollmentId: string) {
  revalidatePath(`/inscriptions/${enrollmentId}`);
  revalidatePath("/inscriptions");
  revalidatePath("/eleves");
  revalidatePath("/tableau-de-bord");
}

export async function submitEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("enrollment_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Inscription introuvable." };
  const { error, count } = await setStatus(id, auth.context.organization.id, { status: "pending" }, ["draft", "rejected"]);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "L'inscription ne peut pas être soumise.") };
  refresh(id);
  return { ok: true, message: "Inscription soumise pour validation." };
}

export async function validateEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.validate");
  if (!auth.ok) return auth;
  const id = String(formData.get("enrollment_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Inscription introuvable." };
  const wantsInvoice = formData.get("generate_invoice") === "on";
  const generateInvoice = wantsInvoice && can(auth.context, "finance.invoices.manage");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_enrollment", {
    p_enrollment_id: id,
    p_generate_invoice: generateInvoice,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "La validation a échoué.") };
  refresh(id);
  const result = (data ?? {}) as { invoice_id?: string | null; reason?: string };
  if (generateInvoice && !result.invoice_id) {
    return { ok: true, message: "Inscription validée. Aucune facture générée : aucun tarif ne s'applique à cette classe." };
  }
  if (wantsInvoice && !generateInvoice) {
    return { ok: true, message: "Inscription validée. La facture devra être établie par la comptabilité." };
  }
  return { ok: true, message: result.invoice_id ? "Inscription validée et facture émise." : "Inscription validée." };
}

export async function rejectEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.validate");
  if (!auth.ok) return auth;
  const id = String(formData.get("enrollment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Inscription introuvable." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif du rejet." };
  const { error, count } = await setStatus(id, auth.context.organization.id, { status: "rejected", decision_reason: reason.slice(0, 500) }, ["pending"]);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Le rejet a échoué.") };
  refresh(id);
  return { ok: true, message: "Inscription rejetée." };
}

export async function cancelEnrollment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.manage", "enrollments.validate");
  if (!auth.ok) return auth;
  const id = String(formData.get("enrollment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Inscription introuvable." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif de l'annulation." };
  const allowed: Enums<"enrollment_status">[] = can(auth.context, "enrollments.validate")
    ? ["draft", "pending", "validated"]
    : ["draft", "pending"];
  const { error, count } = await setStatus(id, auth.context.organization.id, { status: "cancelled", decision_reason: reason.slice(0, 500) }, allowed);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "L'annulation a échoué.") };
  refresh(id);
  return { ok: true, message: "Inscription annulée." };
}

export async function updateEnrollmentDetails(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("enrollment_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Inscription introuvable." };
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("status, type, class_id, form_definition:form_definitions(fields)")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (!enrollment) return { ok: false, message: "Inscription introuvable." };
  if (!["draft", "pending"].includes(enrollment.status)) {
    return { ok: false, message: "Seules les inscriptions en brouillon ou en attente sont modifiables." };
  }
  const custom = parseCustomValues(parseFields(enrollment.form_definition?.fields), formData);
  if (!custom.ok) return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: custom.errors };
  const classId = String(formData.get("class_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const { error } = await supabase
    .from("enrollments")
    .update({
      form_data: custom.values,
      class_id: isUuid(classId) ? classId : enrollment.class_id,
      notes: notes === "" ? null : notes.slice(0, 2000),
    })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "L'élève a déjà une inscription active dans cette classe." : dbErrorMessage(error),
    };
  }
  refresh(id);
  return { ok: true, message: "Inscription mise à jour." };
}

export type StudentMatch = { id: string; name: string; matricule: string; className: string | null };

/** Recherche d'élèves pour une réinscription (RLS appliquée). */
export async function searchStudentsForEnrollment(query: string): Promise<StudentMatch[]> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok || query.trim().length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name, matricule, enrollments(status, class:classes(name), created_at)")
    .eq("organization_id", auth.context.organization.id)
    .is("archived_at", null)
    .ilike("search_text", likePattern(normalizeSearch(query.trim().slice(0, 60))))
    .order("last_name")
    .limit(8);
  return (data ?? []).map((s) => {
    const last = [...s.enrollments].filter((e) => e.status === "validated").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return { id: s.id, name: `${s.last_name} ${s.first_name}`, matricule: s.matricule, className: last?.class?.name ?? null };
  });
}
