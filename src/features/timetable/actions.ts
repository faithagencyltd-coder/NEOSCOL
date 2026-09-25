"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Heure invalide (HH:MM)." });

const slotSchema = z
  .object({
    class_id: z.string().refine(isUuid, { error: "Classe invalide." }),
    class_subject_id: z.string({ error: "Choisissez la matière." }).refine(isUuid, { error: "Choisissez la matière." }),
    weekday: z.coerce.number().int().min(1).max(7),
    starts_at: time,
    ends_at: time,
    room_id: z.string().refine(isUuid).optional(),
    group_id: z.string().refine(isUuid).optional(),
  })
  .refine((v) => v.ends_at > v.starts_at, { error: "L'heure de fin doit suivre l'heure de début.", path: ["ends_at"] });

const CONFLICTS: Record<string, string> = {
  timetable_no_class_overlap: "La classe a déjà un cours sur ce créneau.",
  timetable_no_teacher_overlap: "L'enseignant a déjà un cours sur ce créneau.",
  timetable_no_room_overlap: "La salle est déjà occupée sur ce créneau.",
};

export async function createSlot(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("timetable.manage");
  if (!auth.ok) return auth;
  const parsed = slotSchema.safeParse(readFields(formData, ["class_id", "class_subject_id", "weekday", "starts_at", "ends_at", "room_id", "group_id"]));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const [{ data: klass }, { data: classSubject }] = await Promise.all([
    supabase.from("classes").select("academic_year_id").eq("organization_id", organizationId).eq("id", d.class_id).maybeSingle(),
    supabase.from("class_subjects").select("teacher_id, class_id").eq("organization_id", organizationId).eq("id", d.class_subject_id).maybeSingle(),
  ]);
  if (!klass || !classSubject || classSubject.class_id !== d.class_id) return { ok: false, message: "Classe ou matière introuvable." };

  const { error } = await supabase.from("timetable_slots").insert({
    organization_id: organizationId,
    academic_year_id: klass.academic_year_id,
    class_id: d.class_id,
    class_subject_id: d.class_subject_id,
    teacher_id: classSubject.teacher_id,
    room_id: d.room_id ?? null,
    group_id: d.group_id ?? null,
    weekday: d.weekday,
    starts_at: d.starts_at,
    ends_at: d.ends_at,
  });
  if (error) {
    const conflict = Object.entries(CONFLICTS).find(([name]) => error.message.includes(name));
    return { ok: false, message: conflict ? conflict[1] : dbErrorMessage(error) };
  }
  revalidatePath("/emploi-du-temps");
  return { ok: true, message: "Créneau ajouté." };
}

export async function deleteSlot(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("timetable.manage");
  if (!auth.ok) return auth;
  const slotId = String(formData.get("slot_id") ?? "");
  if (!isUuid(slotId)) return { ok: false, message: "Créneau introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("timetable_slots")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", slotId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/emploi-du-temps");
  return { ok: true, message: "Créneau supprimé." };
}
