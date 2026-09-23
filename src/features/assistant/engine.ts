import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { ASSISTANT_TOOLS, runTool, type ToolContext } from "@/features/assistant/tools";

export type AssistantTurn = { role: "user" | "assistant"; content: string };
export type AssistantAnswer = { answer: string; tools: string[]; provider: "claude" | "local" };

const SYSTEM = `Tu es l'assistant de NéoScol, logiciel de gestion scolaire. Tu réponds en français, de façon concise et factuelle.
Tu n'as accès aux données QUE par les outils fournis ; ils s'exécutent avec les droits de l'utilisateur connecté.
Si un outil répond « Accès refusé » ou ne renvoie rien, dis-le simplement : ne devine jamais de données.
Tu ne modifies rien : tu consultes, résumes, repères des anomalies et proposes des actions à faire dans l'application.`;

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Aiguillage local (sans modèle de langage) vers les mêmes outils. */
async function localAnswer(ctx: ToolContext, question: string): Promise<AssistantAnswer> {
  const q = normalize(question);
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  const date = question.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (/anomal|probleme|alerte|surveill/.test(q)) calls.push({ name: "anomalies", input: {} });
  if (/impay|retard de paiement|reliquat|doit|dette|echeance/.test(q)) calls.push({ name: "impayes", input: { limite: 10 } });
  if (/absen|retard|presence|appel/.test(q) && !/retard de paiement/.test(q)) {
    calls.push(/statist|taux|classe/.test(q) ? { name: "statistiques", input: { section: "absences" } } : { name: "absences", input: date ? { date } : {} });
  }
  if (/effectif|combien d.eleve|nombre d.eleve|eleves inscrits/.test(q)) calls.push({ name: "statistiques", input: { section: "effectifs" } });
  if (/inscription|reinscription/.test(q)) calls.push({ name: "statistiques", input: { section: "inscriptions" } });
  if (/resultat|moyenne|note|reussite|performance/.test(q)) calls.push({ name: "statistiques", input: { section: "resultats" } });
  if (/finance|encaiss|recette|depense|chiffre|argent/.test(q)) calls.push({ name: "statistiques", input: { section: "finances" } });
  if (/formation|session/.test(q)) calls.push({ name: "statistiques", input: { section: "formations" } });
  if (!calls.length) {
    const term = question.replace(/^(cherche|trouve|recherche|qui est|ou est|montre(-moi)?)\s*/i, "").trim();
    if (term.length >= 2) calls.push({ name: "rechercher", input: { texte: term.slice(0, 100) } });
  }
  if (!calls.length) {
    return {
      provider: "local",
      tools: [],
      answer: "Je peux rechercher une personne ou un dossier, résumer les effectifs, inscriptions, finances, absences ou résultats, lister les impayés et repérer des anomalies. Reformulez votre question avec l'un de ces sujets.",
    };
  }
  const results = await Promise.all(calls.map((c) => runTool(ctx, c.name, c.input)));
  return { provider: "local", tools: calls.map((c) => c.name), answer: results.join("\n\n") };
}

/** Réponse via Claude (outils identiques, exécutés côté serveur avec les droits de l'utilisateur). */
async function claudeAnswer(ctx: ToolContext, history: AssistantTurn[]): Promise<AssistantAnswer> {
  const client = new Anthropic();
  const tools: Anthropic.Beta.BetaTool[] = ASSISTANT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool["input_schema"],
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const used: string[] = [];
  for (let step = 0; step < 6; step += 1) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${SYSTEM}\nDate du jour : ${ctx.today}.`,
      tools,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { provider: "claude", tools: used, answer: "Je ne peux pas répondre à cette demande." };
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !toolUses.length) {
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      return { provider: "claude", tools: used, answer: text || "Aucune réponse." };
    }
    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map(async (block) => {
        used.push(block.name);
        return { type: "tool_result" as const, tool_use_id: block.id, content: await runTool(ctx, block.name, block.input) };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { provider: "claude", tools: used, answer: "La question demande trop d'étapes : précisez-la." };
}

/** Fournisseur : Claude si une clé est configurée (ANTHROPIC_API_KEY), sinon aiguillage local. */
export async function answer(ctx: ToolContext, history: AssistantTurn[]): Promise<AssistantAnswer> {
  const last = history.at(-1)?.content ?? "";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await claudeAnswer(ctx, history);
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const fallback = await localAnswer(ctx, last);
        return { ...fallback, answer: `${fallback.answer}\n\n(Service d'IA indisponible : réponse calculée localement.)` };
      }
      throw error;
    }
  }
  return localAnswer(ctx, last);
}
