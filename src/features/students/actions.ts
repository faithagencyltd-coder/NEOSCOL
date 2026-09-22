"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { parseCustomValues } from "@/features/forms/fields";
import { getStudentFormFields } from "@/features/students/queries";
import {
  GUARDIAN_FIELDS,
  guardianSchema,
  MEDICAL_FIELDS,
  medicalSchema,
  STUDENT_FIELDS,
  studentSchema,
} from "@/features/students/schemas";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean, readFields } from "@/lib/utils/form-data";
import { escapeLike, isUuid } from "@/lib/utils/search-params";

type FieldErrors = Record<string, string[] | undefined>;

function prefixed(errors: FieldErrors, prefix: string): FieldErrors {
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [`${prefix}${key}`, value]));
}

/** Parent facultatif : ignoré si aucun champ n'est rempli, validé sinon. */
function parseOptionalGuardian(formData: FormData) {
  const raw = readFields(formData, GUARDIAN_FIELDS, "guardian_");
  const filled = raw.first_name || raw.last_name || raw.phone || raw.email;
  if (!filled) return { ok: true as const, guardian: null };
  const parsed = guardianSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, errors: prefixed(z.flattenError(parsed.error).fieldErrors, "guardian_") };
  return { ok: true as const, guardian: parsed.data };
}

export async function createStudent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.create");
  if (!auth.ok) return auth;
  const organizationId = auth.context.organization.id;

  const student = studentSchema.safeParse(readFields(formData, STUDENT_FIELDS));
  const guardian = parseOptionalGuardian(formData);
  const custom = parseCustomValues(await getStudentFormFields(organizationId), formData);
  if (!student.success || !guardian.ok || !custom.ok) {
    return {
      ok: false,
      message: "Certains champs sont à corriger.",
      fieldErrors: {
        ...(student.success ? {} : z.flattenError(student.error).fieldErrors),
        ...(guardian.ok ? {} : guardian.errors),
        ...(custom.ok ? {} : custom.errors),
      },
    };
  }

  const supabase = await createClient();
  // Doublon probable : même nom, prénom et date de naissance.
  if (!readBoolean(formData, "allow_duplicate") && student.data.birth_date) {
    const { data: duplicates } = await supabase
      .from("students")
      .select("matricule")
      .eq("organization_id", organizationId)
      .ilike("last_name", escapeLike(student.data.last_name))
      .ilike("first_name", escapeLike(student.data.first_name))
      .eq("birth_date", student.data.birth_date)
      .limit(1);
    if (duplicates && duplicates.length > 0) {
      return {
        ok: false,
        message: `Un élève portant ce nom et né le même jour existe déjà (matricule ${duplicates[0]!.matricule}). Cochez « Créer quand même » si ce n'est pas la même personne.`,
        fieldErrors: { allow_duplicate: ["Doublon probable"] },
      };
    }
  }

  const { data: id, error } = await supabase.rpc("create_student_record", {
    p_organization_id: organizationId,
    p_payload: { student: student.data, guardian: guardian.guardian, custom_fields: custom.values, status: "prospect" },
  });
  if (error || !id) return { ok: false, message: dbErrorMessage(error, "La création du dossier a échoué.") };

  revalidatePath("/eleves");
  redirect(`/eleves/${id}?cree=1`);
}

export async function updateStudent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.update");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Élève introuvable." };

  const organizationId = auth.context.organization.id;
  const student = studentSchema.safeParse(readFields(formData, STUDENT_FIELDS));
  const custom = parseCustomValues(await getStudentFormFields(organizationId), formData);
  if (!student.success || !custom.ok) {
    return {
      ok: false,
      message: "Certains champs sont à corriger.",
      fieldErrors: {
        ...(student.success ? {} : z.flattenError(student.error).fieldErrors),
        ...(custom.ok ? {} : custom.errors),
      },
    };
  }

  const supabase = await createClient();
  const d = student.data;
  const { error, count } = await supabase
    .from("students")
    .update(
      {
        first_name: d.first_name,
        last_name: d.last_name.toUpperCase(),
        other_names: d.other_names ?? null,
        sex: d.sex ?? null,
        birth_date: d.birth_date ?? null,
        birth_place: d.birth_place ?? null,
        nationality: d.nationality ?? null,
        national_id: d.national_id ?? null,
        address: d.address ?? null,
        city: d.city ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
        notes: d.notes ?? null,
        custom_fields: custom.values,
      },
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("id", studentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "La modification a échoué.") };

  revalidatePath(`/eleves/${studentId}`);
  revalidatePath("/eleves");
  redirect(`/eleves/${studentId}?modifie=1`);
}

export async function setStudentArchived(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.archive");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const archive = formData.get("archive") === "true";
  if (!isUuid(studentId)) return { ok: false, message: "Élève introuvable." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("students")
    .update({ archived_at: archive ? new Date().toISOString() : null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", studentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/eleves/${studentId}`);
  revalidatePath("/eleves");
  return { ok: true, message: archive ? "Dossier archivé." : "Dossier restauré." };
}

export async function saveMedicalRecord(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.medical.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Élève introuvable." };
  const parsed = medicalSchema.safeParse(readFields(formData, MEDICAL_FIELDS));
  if (!parsed.success) {
    return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const supabase = await createClient();
  const values = Object.fromEntries(MEDICAL_FIELDS.map((key) => [key, parsed.data[key] ?? null]));
  const { error } = await supabase
    .from("student_medical_records")
    .upsert({ ...values, student_id: studentId, organization_id: auth.context.organization.id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/eleves/${studentId}`);
  return { ok: true, message: "Informations médicales enregistrées." };
}

export async function addGuardianToStudent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("guardians.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Élève introuvable." };

  const existingId = String(formData.get("guardian_id") ?? "");
  const relationship = String(formData.get("guardian_relationship") ?? "tutor");
  const flags = {
    is_primary: readBoolean(formData, "is_primary"),
    is_financial_responsible: readBoolean(formData, "is_financial_responsible"),
    portal_access: readBoolean(formData, "portal_access"),
  };

  let payload: { [key: string]: string | boolean | undefined };
  if (isUuid(existingId)) {
    payload = { id: existingId, relationship, ...flags };
  } else {
    const parsed = guardianSchema.safeParse(readFields(formData, GUARDIAN_FIELDS, "guardian_"));
    if (!parsed.success) {
      return {
        ok: false,
        message: "Certains champs sont à corriger.",
        fieldErrors: prefixed(z.flattenError(parsed.error).fieldErrors, "guardian_"),
      };
    }
    payload = { ...parsed.data, ...flags };
  }

  const supabase = await createClient();
  if (flags.is_primary) {
    await supabase.from("student_guardians").update({ is_primary: false }).eq("student_id", studentId);
  }
  const { error } = await supabase.rpc("add_student_guardian", { p_student_id: studentId, p_guardian: payload });
  if (error) return { ok: false, message: dbErrorMessage(error, "Le rattachement a échoué.") };
  revalidatePath(`/eleves/${studentId}`);
  return { ok: true, message: "Parent / tuteur rattaché." };
}

export async function removeGuardianLink(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("guardians.manage");
  if (!auth.ok) return auth;
  const linkId = String(formData.get("link_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(linkId) || !isUuid(studentId)) return { ok: false, message: "Lien introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_guardians")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", linkId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/eleves/${studentId}`);
  return { ok: true, message: "Lien retiré." };
}
