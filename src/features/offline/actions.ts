"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ScanResult } from "@/features/staff/schemas";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/utils/db-error";

/**
 * Synchronisation des saisies faites hors ligne. Mêmes droits et mêmes règles
 * qu'en ligne, appliqués EN BASE à l'heure réelle de la saisie ; un envoi rejoué
 * (même identifiant) renvoie le résultat déjà enregistré.
 */
export type SyncOutcome<T = unknown> = { ok: true; data: T; duplicate: boolean } | { ok: false; message: string };

const base = z.object({ id: z.uuid(), capturedAt: z.iso.datetime({ offset: true }) });

const lessonSchema = base.extend({
  payload: z.object({
    slot_id: z.uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validate: z.boolean(),
    records: z
      .array(
        z.object({
          student_id: z.uuid(),
          status: z.enum(["present", "absent", "late", "excused"]),
          minutes_late: z.number().int().min(0).max(600).nullable(),
          arrived_at: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
          comment: z.string().max(500).nullable(),
        }),
      )
      .max(300),
  }),
});

export async function syncLessonAttendance(item: unknown): Promise<SyncOutcome<{ validated: boolean }>> {
  const auth = await authorize("attendance.take", "attendance.manage");
  if (!auth.ok) return auth;
  const parsed = lessonSchema.safeParse(item);
  if (!parsed.success) return { ok: false, message: "Appel hors ligne illisible." };
  const { id, capturedAt, payload } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_offline_lesson_attendance", {
    p_client_id: id,
    p_slot_id: payload.slot_id,
    p_date: payload.date,
    p_records: payload.records,
    p_validate: payload.validate,
    p_captured_at: capturedAt,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "L'appel n'a pas pu être enregistré.") };
  revalidatePath("/mes-cours", "layout");
  revalidatePath("/presences");
  const r = data as { validated: boolean; duplicate?: boolean };
  return { ok: true, data: { validated: r.validated }, duplicate: Boolean(r.duplicate) };
}

const scanSchema = base.extend({ payload: z.object({ code: z.string().min(1).max(200) }) });

export async function syncStaffScan(item: unknown): Promise<SyncOutcome<ScanResult>> {
  const auth = await authorize("staff_attendance.scan");
  if (!auth.ok) return auth;
  const parsed = scanSchema.safeParse(item);
  if (!parsed.success) return { ok: false, message: "Scan hors ligne illisible." };
  const supabase = await createClient();
  const device = `${((await headers()).get("user-agent") ?? "").slice(0, 100)} (hors ligne)`;
  const { data, error } = await supabase.rpc("sync_offline_staff_scan", {
    p_organization_id: auth.context.organization.id,
    p_client_id: parsed.data.id,
    p_code: parsed.data.payload.code,
    p_captured_at: parsed.data.capturedAt,
    p_device: device,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Le scan n'a pas pu être enregistré.") };
  const r = data as ScanResult & { duplicate?: boolean };
  return { ok: true, data: r, duplicate: Boolean(r.duplicate) };
}
