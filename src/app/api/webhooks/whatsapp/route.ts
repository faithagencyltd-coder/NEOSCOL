import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { answerQuestion, loadSupportSettings, sendWhatsAppText } from "@/features/support/chat";
import { decryptSecret, encryptionKeyFrom } from "@/lib/messaging/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * WhatsApp Business Platform (API officielle Meta) → Support Center.
 *  GET  : vérification du webhook (jeton de vérification choisi dans la console, comparé haché).
 *  POST : messages reçus ; signature X-Hub-Signature-256 vérifiée avec le secret de l'application Meta.
 * Rien n'est traité si la réception WhatsApp est désactivée dans la console.
 */
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

async function secrets() {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("support_secrets").select("whatsapp_verify_token_hash, whatsapp_app_secret_ciphertext").eq("id", 1).maybeSingle();
  return data;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const s = await secrets();
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (url.searchParams.get("hub.mode") === "subscribe" && s?.whatsapp_verify_token_hash && token && sha(`wa|${token}`) === s.whatsapp_verify_token_hash) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Interdit.", { status: 403 });
}

type Inbound = { from: string; text: string };

export async function POST(request: Request) {
  const raw = await request.text();
  const s = await secrets();
  const key = encryptionKeyFrom(process.env);
  if (!s?.whatsapp_app_secret_ciphertext || !key) return new Response("Non configuré.", { status: 503 });
  let appSecret: string;
  try {
    appSecret = decryptSecret(s.whatsapp_app_secret_ciphertext, key);
  } catch {
    return new Response("Non configuré.", { status: 503 });
  }
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return new Response("Signature invalide.", { status: 401 });

  const settings = await loadSupportSettings();
  const admin = createAdminClient();
  if (!settings?.whatsapp_inbound_enabled || !admin) return new Response("ok", { status: 200 });

  const payload = JSON.parse(raw || "{}") as { entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[] };
  const inbound: Inbound[] = [];
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) for (const m of change.value?.messages ?? []) {
    if (m.from && /^\d{6,20}$/.test(m.from)) inbound.push({ from: m.from, text: m.type === "text" ? (m.text?.body ?? "").trim().slice(0, 1500) : "[message non textuel]" });
  }

  for (const msg of inbound.slice(0, 20)) {
    // Conversation ouverte de ce numéro (30 jours), sinon nouvelle conversation.
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: existing } = await admin.from("support_conversations").select("id, status").eq("channel", "whatsapp").eq("whatsapp_from", msg.from).neq("status", "closed").gte("updated_at", since).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const conv = existing ?? (await admin.from("support_conversations").insert({ channel: "whatsapp", whatsapp_from: msg.from, audience: "public" }).select("id, status").single()).data;
    if (!conv) continue;
    await admin.rpc("support_chat_record", { p_conversation: conv.id, p_token_hash: null as unknown as string, p_sender: "visitor", p_body: msg.text || "…", p_articles: [], p_answered: null as unknown as boolean });
    if (conv.status !== "bot" || !settings.whatsapp_bot_replies || !settings.chatbot_enabled) {
      // Réponse humaine attendue : transfert automatique vers une demande d'assistance (une seule fois).
      if (conv.status === "bot") await admin.rpc("support_chat_handoff", { p_conversation: conv.id, p_token_hash: null as unknown as string, p_name: "", p_email: "", p_phone: `+${msg.from}`, p_subject: "Message WhatsApp" });
      continue;
    }
    const answer = await answerQuestion(msg.text, "public", settings);
    await admin.rpc("support_chat_record", { p_conversation: conv.id, p_token_hash: null as unknown as string, p_sender: "bot", p_body: answer.text, p_articles: answer.articleIds, p_answered: answer.answered });
    await sendWhatsAppText(msg.from, answer.answered ? answer.text : `${answer.text}\nVotre message a été transmis à notre équipe Support.`);
    if (!answer.answered) await admin.rpc("support_chat_handoff", { p_conversation: conv.id, p_token_hash: null as unknown as string, p_name: "", p_email: "", p_phone: `+${msg.from}`, p_subject: "Message WhatsApp" });
  }
  return new Response("ok", { status: 200 });
}
