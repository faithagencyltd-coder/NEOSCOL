"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

import { VOICE_EVENTS } from "./messages";

/** Réglages des messages vocaux (voice_checkin.manage) ; variables et bornes vérifiées en base. */
export async function saveVoiceSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("voice_checkin.manage");
  if (!auth.ok) return auth;
  const messages = Object.fromEntries(VOICE_EVENTS.map((e) => [e.key, String(formData.get(`msg_${e.key}`) ?? "").slice(0, 300)]));
  const language = String(formData.get("language") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_voice_checkin_settings", {
    p_org: auth.context.organization.id,
    p_enabled: formData.get("enabled") === "on",
    p_language: (language === "fr" || language === "en" ? language : null) as string,
    p_rate: Number(formData.get("rate") ?? 1),
    p_volume: Number(formData.get("volume") ?? 1),
    p_announce_names: formData.get("announce_names") === "on",
    p_messages: messages,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/parametres/messages-vocaux");
  revalidatePath("/pointage");
  return { ok: true, message: "Messages vocaux enregistrés." };
}
