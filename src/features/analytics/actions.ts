"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

/** Console › Analytics › Réglages (écriture réservée aux rôles de plateforme autorisés, revérifiée en base). */
async function writer(): Promise<ActionResult | null> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? null : { ok: false, message: platformDeniedMessage(role) };
}
const on = (formData: FormData, key: string) => formData.get(key) === "on" || formData.get(key) === "true";

export async function saveAnalyticsSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { error } = await (await createClient()).rpc("platform_save_analytics_settings", {
    p_enabled: on(formData, "enabled"),
    p_consent: on(formData, "consent_required"),
    p_clicks: on(formData, "track_clicks"),
    p_duration: on(formData, "track_duration"),
    p_app: on(formData, "track_app_usage"),
    p_retention: Number(formData.get("retention_months") ?? 13),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/analytics");
  return { ok: true, message: "Réglages Analytics enregistrés." };
}

export async function purgeAnalytics(): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { data, error } = await (await createClient()).rpc("platform_purge_analytics");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { sessions: number; app_usage: number } | null;
  revalidatePath("/plateforme/analytics");
  return { ok: true, message: `Purge effectuée : ${r?.sessions ?? 0} session(s) et ${r?.app_usage ?? 0} ligne(s) d'usage supprimées.` };
}
