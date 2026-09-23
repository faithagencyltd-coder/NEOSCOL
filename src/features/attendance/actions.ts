"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { authorize } from "@/lib/auth/authorize";
import { isIsoDate, isTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

const recordsSchema = z
  .array(
    z.object({
      student_id: z.string().refine(isUuid),
      status: z.enum(["present", "absent", "late", "excused"]),
      minutes_late: z.number().int().min(0).max(600).nullable().optional(),
    }),
  )
  .max(500);

export async function saveRollCall(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.take", "attendance.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const classSubjectId = String(formData.get("class_subject_id") ?? "");
  if (!isUuid(classId) || !isIsoDate(date) || !isTime(startsAt) || !isTime(endsAt) || endsAt <= startsAt) {
    return { ok: false, message: "Classe, date ou horaire invalide." };
  }
  let records: z.infer<typeof recordsSchema>;
  try {
    records = recordsSchema.parse(JSON.parse(String(formData.get("records") ?? "[]")));
  } catch {
    return { ok: false, message: "Liste d'appel invalide." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", {
    p_class_id: classId,
    p_session_date: date,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_class_subject_id: isUuid(classSubjectId) ? classSubjectId : undefined,
    p_records: records,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'enregistrement de l'appel a échoué.") };
  revalidatePath("/presences");
  revalidatePath("/tableau-de-bord");
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  return {
    ok: true,
    message: `Appel enregistré : ${records.length - absent - late} présent(s), ${absent} absent(s), ${late} retard(s). Les familles concernées sont notifiées.`,
  };
}

export async function justifyAbsence(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.justify", "attendance.manage");
  if (!auth.ok) return auth;
  const recordId = String(formData.get("record_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(recordId)) return { ok: false, message: "Absence introuvable." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif de la justification." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("attendance_records")
    .update({ is_justified: true, justification: reason.slice(0, 500) }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", recordId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "La justification a échoué.") };
  revalidatePath("/presences");
  return { ok: true, message: "Absence justifiée." };
}

const lessonRecordsSchema = z
  .array(
    z.object({
      student_id: z.string().refine(isUuid),
      status: z.enum(["present", "absent", "late", "excused"]),
      minutes_late: z.number().int().min(0).max(600).nullable().optional(),
      arrived_at: z.string().refine((v) => isTime(v)).nullable().optional(),
      comment: z.string().trim().max(500).nullable().optional(),
    }),
  )
  .max(500);

/**
 * Appel d'un cours de l'emploi du temps. Le serveur refuse si le cours n'a
 * pas été déverrouillé par le scan du badge (ou manuellement par l'administration).
 * « valider » verrouille l'appel, met à jour les statistiques et prévient les familles.
 */
export async function saveLessonAttendance(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.take", "attendance.manage");
  if (!auth.ok) return auth;
  const slotId = String(formData.get("slot_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const validate = formData.get("intent") === "validate";
  if (!isUuid(slotId) || !isIsoDate(date)) return { ok: false, message: "Cours invalide." };
  let records: z.infer<typeof lessonRecordsSchema>;
  try {
    records = lessonRecordsSchema.parse(JSON.parse(String(formData.get("records") ?? "[]")));
  } catch {
    return { ok: false, message: "Liste d'appel invalide." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("take_lesson_attendance", {
    p_slot_id: slotId,
    p_date: date,
    p_records: records,
    p_validate: validate,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'enregistrement de l'appel a échoué.") };
  revalidatePath("/mes-cours", "layout");
  revalidatePath("/presences");
  revalidatePath("/tableau-de-bord");
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  return {
    ok: true,
    message: validate
      ? `Appel validé : ${records.length - absent - late} présent(s), ${absent} absent(s), ${late} retard(s). Les familles concernées sont prévenues.`
      : "Brouillon enregistré : vous pouvez corriger avant de valider.",
  };
}

/** Validation d'un appel libre (saisi par l'administration). */
export async function validateSession(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.manage");
  if (!auth.ok) return auth;
  const sessionId = String(formData.get("session_id") ?? "");
  if (!isUuid(sessionId)) return { ok: false, message: "Appel introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("validate_attendance_session", { p_session_id: sessionId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/presences");
  return { ok: true, message: "Appel validé : les familles concernées sont prévenues." };
}

/** Réouverture d'un appel validé pour correction (administration, motif obligatoire). */
export async function reopenSession(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.manage");
  if (!auth.ok) return auth;
  const sessionId = String(formData.get("session_id") ?? "");
  if (!isUuid(sessionId)) return { ok: false, message: "Appel introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_attendance_session", { p_session_id: sessionId, p_reason: String(formData.get("reason") ?? "") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/mes-cours", "layout");
  revalidatePath("/presences");
  return { ok: true, message: "Appel rouvert pour correction." };
}

/** Déverrouillage exceptionnel d'un cours (badge oublié) : administration, motif, audit. */
export async function unlockLesson(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.manage");
  if (!auth.ok) return auth;
  const slotId = String(formData.get("slot_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isUuid(slotId) || !isIsoDate(date)) return { ok: false, message: "Cours invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_lesson_manually", { p_slot_id: slotId, p_date: date, p_reason: String(formData.get("reason") ?? "") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/presences");
  return { ok: true, message: "Cours déverrouillé : l'enseignant peut faire l'appel." };
}

/** Dépôt d'un justificatif (administration ou famille) avec pièce jointe facultative. */
export async function submitJustification(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "") || startsOn;
  const reason = String(formData.get("reason") ?? "").trim();
  const existingId = String(formData.get("justification_id") ?? "");
  if (!isUuid(studentId) || !isIsoDate(startsOn) || !isIsoDate(endsOn)) return { ok: false, message: "Élève ou dates invalides." };
  if (endsOn < startsOn) return { ok: false, message: "La date de fin précède la date de début." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif de l'absence." };
  const supabase = await createClient();
  let fileId: string | undefined;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const stored = await storeUpload(supabase, {
      organizationId: auth.context.organization.id,
      file,
      owner: "absence_justification",
      category: "justificatif",
      accept: ["pdf", "image"],
    });
    if (!stored.ok) return stored;
    fileId = stored.id;
  }
  const { error } = await supabase.rpc("submit_absence_justification", {
    p_student_id: studentId,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_reason: reason,
    p_file_id: fileId,
    p_justification_id: isUuid(existingId) ? existingId : undefined,
  });
  if (error) return { ok: false, message: dbErrorMessage(error, "Le justificatif n'a pas pu être déposé.") };
  revalidatePath("/presences");
  revalidatePath("/portail", "layout");
  return { ok: true, message: "Justificatif transmis : il sera examiné par l'administration." };
}

/** Décision sur un justificatif : accepter, refuser, demander une correction. */
export async function reviewJustification(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("attendance.justify");
  if (!auth.ok) return auth;
  const id = String(formData.get("justification_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!isUuid(id) || !["accepted", "rejected", "correction_requested"].includes(decision)) return { ok: false, message: "Décision invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_absence_justification", {
    p_id: id,
    p_decision: decision,
    p_comment: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/presences");
  return {
    ok: true,
    message:
      decision === "accepted"
        ? `Justificatif accepté : ${data ?? 0} absence(s) ou retard(s) justifié(s).`
        : decision === "rejected"
          ? "Justificatif refusé : la famille est prévenue."
          : "Correction demandée à la famille.",
  };
}
