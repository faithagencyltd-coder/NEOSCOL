"use server";

import { z } from "zod";

import { answer, type AssistantAnswer } from "@/features/assistant/engine";
import { authorize } from "@/lib/auth/authorize";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const historySchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
  .min(1)
  .max(20);

/** Question à l'assistant (assistant.use). Journalisée : question et outils appelés. */
export async function askAssistant(history: unknown): Promise<{ ok: true; data: AssistantAnswer } | { ok: false; message: string }> {
  const auth = await authorize("assistant.use");
  if (!auth.ok) return auth;
  const parsed = historySchema.safeParse(history);
  if (!parsed.success || parsed.data.at(-1)?.role !== "user") return { ok: false, message: "Question invalide." };
  const supabase = await createClient();
  const org = auth.context.organization;
  const result = await answer({ supabase, organizationId: org.id, timezone: org.timezone, today: todayIn(org.timezone) }, parsed.data);
  await supabase.rpc("log_event", {
    p_organization_id: org.id,
    p_action: "assistant.question",
    p_summary: parsed.data.at(-1)!.content.slice(0, 200),
    p_metadata: { tools: result.tools, provider: result.provider },
  });
  return { ok: true, data: result };
}
