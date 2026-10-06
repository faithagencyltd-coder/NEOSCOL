import { hashToken, loadSupportSettings } from "@/features/support/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/search-params";

/** « Parler à l'équipe Support » : crée la demande d'assistance (historique joint) dans le système existant. */
export async function POST(request: Request) {
  const settings = await loadSupportSettings();
  if (!settings?.chatbot_enabled) return Response.json({ error: "Service indisponible." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const str = (k: string, max: number) => (typeof body?.[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
  const conversation = str("conversation", 40);
  const token = str("token", 100);
  const email = str("email", 160);
  if (!isUuid(conversation) || token.length < 20) return Response.json({ error: "Conversation introuvable." }, { status: 404 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Service indisponible." }, { status: 503 });
  const { data, error } = await admin.rpc("support_chat_handoff", {
    p_conversation: conversation,
    p_token_hash: hashToken(token),
    p_name: str("name", 120),
    p_email: email,
    p_phone: str("phone", 30),
    p_subject: str("subject", 160),
  });
  if (error) return Response.json({ error: error.message.includes("e-mail ou un téléphone") ? "Indiquez un e-mail ou un téléphone pour être recontacté." : error.message.includes("Trop de demandes") ? "Trop de demandes en peu de temps : réessayez plus tard." : "Transfert impossible." }, { status: 400 });
  return Response.json({ ok: true, ticket: data }, { headers: { "Cache-Control": "no-store" } });
}
