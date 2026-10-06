import { answerQuestion, hashToken, loadSupportSettings, newToken } from "@/features/support/chat";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Chatbot NeoScool (site public et portails).
 *  POST : message du visiteur → réponse de l'assistant (ou de l'équipe Support après transfert).
 *  GET  : nouveaux messages d'une conversation (réponses de l'équipe Support).
 * Visiteur sans compte : conversation reconnue par un jeton (empreinte seule conservée).
 * Compte connecté : établissement et utilisateur lus dans la session, côté serveur.
 */
type Msg = { id: number; sender: string; body: string; created_at: string };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

async function owned(conversationId: unknown, token: unknown) {
  if (typeof conversationId !== "string" || !isUuid(conversationId) || typeof token !== "string" || token.length < 20) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("support_conversations").select("id, status, ticket_id, audience").eq("id", conversationId).eq("token_hash", hashToken(token)).maybeSingle();
  return data;
}

async function messagesAfter(conversationId: string, after: number): Promise<Msg[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin.from("support_conversation_messages").select("id, sender, body, created_at").eq("conversation_id", conversationId).gt("id", after).order("id").limit(100);
  return (data ?? []) as Msg[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const conv = await owned(url.searchParams.get("conversation"), url.searchParams.get("jeton"));
  if (!conv) return json({ error: "Conversation introuvable." }, 404);
  return json({ status: conv.status, messages: await messagesAfter(conv.id, Number(url.searchParams.get("apres") ?? 0) || 0) });
}

export async function POST(request: Request) {
  const settings = await loadSupportSettings();
  const body = (await request.json().catch(() => null)) as { conversation?: unknown; token?: unknown; message?: unknown; page?: unknown; locale?: unknown; after?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 1500) : "";
  if (!settings?.chatbot_enabled) return json({ error: "L'assistant n'est pas disponible pour le moment." }, 403);
  if (message.length < 2) return json({ error: "Écrivez votre question." }, 400);
  const admin = createAdminClient();
  if (!admin) return json({ error: "Service indisponible." }, 503);

  const context = await getSessionContext();
  const audience: "public" | "school" = context?.organization ? "school" : "public";
  if ((audience === "public" && !settings.chatbot_on_site) || (audience === "school" && !settings.chatbot_in_portals)) {
    return json({ error: "L'assistant n'est pas disponible ici." }, 403);
  }
  const locale = body?.locale === "en" ? "en" : "fr";

  let token = typeof body?.token === "string" ? body.token : null;
  let conv = await owned(body?.conversation, token);
  if (!conv) {
    token = newToken();
    const page = typeof body?.page === "string" ? body.page.split(/[?#]/)[0]!.slice(0, 200) : null;
    const { data, error } = await admin
      .from("support_conversations")
      .insert({ channel: "chatbot", token_hash: hashToken(token), organization_id: context?.organization?.id ?? null, user_id: context?.user.id ?? null, audience, page, locale })
      .select("id, status, ticket_id, audience")
      .single();
    if (error || !data) return json({ error: "Conversation impossible à ouvrir." }, 500);
    conv = data;
  }
  // Limite anti-abus : 20 messages par conversation et par tranche de 10 minutes.
  const { count } = await admin.from("support_conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("sender", "visitor").gte("created_at", new Date(Date.now() - 600_000).toISOString());
  if ((count ?? 0) >= 20) return json({ error: "Trop de messages en peu de temps : patientez quelques minutes." }, 429);
  if (conv.status === "closed") return json({ error: "Conversation clôturée : rechargez la page pour en ouvrir une nouvelle." }, 409);

  const after = typeof body?.after === "number" ? body.after : 0;
  await admin.rpc("support_chat_record", { p_conversation: conv.id, p_token_hash: hashToken(token!), p_sender: "visitor", p_body: message, p_articles: [], p_answered: null as unknown as boolean });
  let handoff = false;
  if (conv.status === "bot") {
    const answer = await answerQuestion(message, audience, settings, locale);
    handoff = !answer.answered;
    await admin.rpc("support_chat_record", { p_conversation: conv.id, p_token_hash: hashToken(token!), p_sender: "bot", p_body: answer.text, p_articles: answer.articleIds, p_answered: answer.answered });
  }
  return json({ conversation: conv.id, token, status: conv.status, handoff, signedIn: Boolean(context), messages: await messagesAfter(conv.id, after) });
}
