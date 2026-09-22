"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
