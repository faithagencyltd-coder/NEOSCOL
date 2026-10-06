"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import { sendWhatsAppText } from "@/features/support/chat";
import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { encryptionKeyFrom, encryptSecret } from "@/lib/messaging/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Console › Support Center : réglages, base de connaissances, réponses aux conversations, WhatsApp. */
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const refresh = () => revalidatePath("/plateforme/support", "layout");

async function writer(): Promise<ActionResult | null> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? null : { ok: false, message: platformDeniedMessage(role) };
}

export async function saveSupportSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { error } = await (await createClient()).rpc("platform_save_support_settings", {
    p_settings: {
      chatbot_enabled: on(formData, "chatbot_enabled"),
      chatbot_on_site: on(formData, "chatbot_on_site"),
      chatbot_in_portals: on(formData, "chatbot_in_portals"),
      ai_enabled: on(formData, "ai_enabled"),
      ai_model: text(formData, "ai_model"),
      instructions: text(formData, "instructions"),
      welcome_message: text(formData, "welcome_message"),
      handoff_message: text(formData, "handoff_message"),
      whatsapp_inbound_enabled: on(formData, "whatsapp_inbound_enabled"),
      whatsapp_bot_replies: on(formData, "whatsapp_bot_replies"),
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Réglages du Support Center enregistrés." };
}

export async function saveKnowledgeArticle(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const id = text(formData, "id");
  const { error } = await (await createClient()).rpc("platform_save_knowledge_article", {
    p_id: (isUuid(id) ? id : null) as string,
    p_data: {
      category: text(formData, "category"),
      title: text(formData, "title"),
      body: text(formData, "body"),
      keywords: text(formData, "keywords").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20),
      audience: text(formData, "audience") || "all",
      published: on(formData, "published"),
      sort_order: Number(text(formData, "sort_order") || 100),
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Article enregistré." };
}

export async function replyToConversation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const id = text(formData, "conversation_id");
  const body = text(formData, "body");
  if (!isUuid(id) || body.length < 1) return { ok: false, message: "Écrivez une réponse." };
  const { data, error } = await (await createClient()).rpc("platform_support_reply", { p_conversation: id, p_body: body.slice(0, 4000) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const info = data as { channel: string; whatsapp_from: string | null; last_inbound_at: string | null } | null;
  refresh();
  if (info?.channel === "whatsapp" && info.whatsapp_from) {
    const within = info.last_inbound_at && Date.now() - Date.parse(info.last_inbound_at) < 24 * 3600_000;
    if (!within) return { ok: false, message: "Réponse enregistrée, mais non envoyée sur WhatsApp : plus de 24 h depuis le dernier message du contact (Meta impose alors un modèle approuvé)." };
    const sent = await sendWhatsAppText(info.whatsapp_from, body);
    if (!sent.ok) return { ok: false, message: `Réponse enregistrée, envoi WhatsApp impossible : ${sent.error}` };
    return { ok: true, message: "Réponse envoyée sur WhatsApp." };
  }
  return { ok: true, message: "Réponse envoyée." };
}

export async function closeConversation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { error } = await (await createClient()).rpc("platform_close_conversation", { p_conversation: text(formData, "conversation_id") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Conversation clôturée." };
}

/** Jeton de vérification et secret de l'application Meta : chiffrés / hachés, jamais réaffichés. */
export async function saveWhatsAppWebhook(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const { data: isAdmin } = await (await createClient()).rpc("is_platform_admin");
  if (!isAdmin) return { ok: false, message: "Réservé à l'administration de la plateforme." };
  const verify = text(formData, "verify_token");
  const secret = text(formData, "app_secret");
  if (!verify && !secret) return { ok: false, message: "Saisissez le jeton de vérification et/ou le secret de l'application." };
  if (verify && verify.length < 16) return { ok: false, message: "Jeton de vérification : 16 caractères au moins." };
  if (secret && !/^[a-f0-9]{32}$/i.test(secret)) return { ok: false, message: "Secret de l'application Meta : 32 caractères hexadécimaux attendus." };
  const key = encryptionKeyFrom(process.env);
  const admin = createAdminClient();
  if (!key || !admin) return { ok: false, message: "Chiffrement indisponible (configuration serveur)." };
  const patch: { updated_at: string; whatsapp_verify_token_hash?: string; whatsapp_app_secret_ciphertext?: string } = { updated_at: new Date().toISOString() };
  if (verify) patch.whatsapp_verify_token_hash = createHash("sha256").update(`wa|${verify}`).digest("hex");
  if (secret) patch.whatsapp_app_secret_ciphertext = encryptSecret(secret, key);
  const { error } = await admin.from("support_secrets").update(patch).eq("id", 1);
  if (error) return { ok: false, message: "Enregistrement impossible." };
  await (await createClient()).rpc("log_event", { p_action: "platform.support_whatsapp_webhook", p_summary: "Réception WhatsApp : identifiants du webhook mis à jour" });
  refresh();
  return { ok: true, message: "Identifiants du webhook WhatsApp enregistrés (jamais réaffichés)." };
}
