import type { Metadata } from "next";

import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { aiAvailable } from "@/lib/ai/anthropic";

export const metadata: Metadata = { title: "Assistant de supervision — Plateforme" };

/** Assistant IA de supervision : questions en français sur l'état de la plateforme (lecture seule). */
export default async function PlatformAssistantPage() {
  const llm = await aiAvailable();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Assistant de supervision</h2>
        <p className="text-sm text-muted-foreground">
          Demandez en français l&apos;état de NeoScool : établissements, connexions, sécurité, technique, abonnements, incidents. Chaque question est inscrite au journal.
        </p>
      </div>
      <AssistantChat llm={llm} scope="platform" />
    </div>
  );
}
