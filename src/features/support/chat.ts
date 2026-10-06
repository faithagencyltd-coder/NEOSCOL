import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { anthropicClient } from "@/lib/ai/anthropic";
import { whatsappSendText } from "@/lib/messaging/providers";
import { loadIntegration } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Chatbot NeoScool : répond UNIQUEMENT à partir des articles publiés de la base
 * de connaissances (Console › Support Center). Aucun accès aux données des
 * établissements, des élèves, des finances ou des comptes : il ne reçoit que la
 * question et les articles trouvés. Sans réponse fiable → proposition de parler
 * à l'équipe Support.
 */

export type SupportSettings = {
  chatbot_enabled: boolean;
  chatbot_on_site: boolean;
  chatbot_in_portals: boolean;
  ai_enabled: boolean;
  ai_model: string;
  instructions: string | null;
  welcome_message: string;
  handoff_message: string;
  whatsapp_inbound_enabled: boolean;
  whatsapp_bot_replies: boolean;
};

export type BotAnswer = { text: string; articleIds: string[]; answered: boolean };

export const hashToken = (token: string) => createHash("sha256").update(`support|${token}`).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function loadSupportSettings(): Promise<SupportSettings | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("support_settings").select("*").eq("id", 1).maybeSingle();
  return (data as SupportSettings | null) ?? null;
}

type Article = { id: string; title: string; body: string; rank: number };
const MIN_RANK = 0.05;

/** Réponse à une question : articles pertinents, puis (si activé) reformulation par Claude, limitée à ces articles. */
export async function answerQuestion(question: string, audience: "public" | "school", settings: SupportSettings, locale: "fr" | "en" = "fr"): Promise<BotAnswer> {
  const admin = createAdminClient();
  if (!admin) return { text: settings.handoff_message, articleIds: [], answered: false };
  const { data } = await admin.rpc("knowledge_search", { p_query: question.slice(0, 300), p_audience: audience, p_limit: 3 });
  const articles = ((data ?? []) as Article[]).filter((a) => a.rank >= MIN_RANK);
  if (!articles.length) return { text: settings.handoff_message, articleIds: [], answered: false };

  if (settings.ai_enabled) {
    const client = await anthropicClient();
    if (client) {
      try {
        const context = articles.map((a, i) => `<article id="${i + 1}" titre="${a.title.replace(/"/g, "'")}">\n${a.body}\n</article>`).join("\n");
        const response = await client.messages.create({
          model: settings.ai_model,
          max_tokens: 700,
          system: [
            "Tu es l'assistant du support de NeoScool, logiciel de gestion d'établissements scolaires, de centres de formation et d'universités.",
            "Réponds uniquement à partir des articles fournis entre balises <article>. N'invente rien : ni prix, ni délai, ni fonctionnalité, ni procédure.",
            "Tu n'as accès à aucune donnée d'établissement, d'élève, de paiement ou de compte : ne prétends jamais les consulter.",
            "Si les articles ne permettent pas de répondre avec certitude, réponds exactement : HANDOFF",
            `Réponds en ${locale === "en" ? "anglais" : "français"}, simplement, en 6 phrases au plus, sans balises.`,
            settings.instructions ? `Consignes de l'équipe NeoScool : ${settings.instructions}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          messages: [{ role: "user", content: `${context}\n\nQuestion de l'utilisateur : ${question.slice(0, 1000)}` }],
        });
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
        if (!text || /^HANDOFF\b/.test(text) || response.stop_reason === "refusal") return { text: settings.handoff_message, articleIds: articles.map((a) => a.id), answered: false };
        return { text, articleIds: articles.map((a) => a.id), answered: true };
      } catch {
        // Service Claude indisponible : réponse directe à partir de l'article (ci-dessous).
      }
    }
  }
  const best = articles[0]!;
  return { text: `${best.title}\n\n${best.body}`.slice(0, 1800), articleIds: [best.id], answered: true };
}

/** Message WhatsApp texte (fenêtre de 24 h après le dernier message du contact). */
export async function sendWhatsAppText(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const wa = await loadIntegration("whatsapp_meta");
  if (!wa) return { ok: false, error: "WhatsApp n'est pas configuré (Console › Intégrations)." };
  const r = await whatsappSendText({ accessToken: wa.secret, phoneNumberId: wa.config.phone_number_id ?? "", apiVersion: wa.config.api_version, to, body });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
