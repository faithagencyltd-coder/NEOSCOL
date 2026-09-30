import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { aiAvailable } from "@/lib/ai/anthropic";
import { requirePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Assistant" };

/** Assistant intelligent : recherches, synthèses, anomalies — dans la limite des droits de l'utilisateur. */
export default async function AssistantPage() {
  await requirePermission("assistant.use");
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <PageHeader title="Assistant NeoScool" description="Recherchez, résumez les statistiques, repérez les anomalies. Chaque question est journalisée." />
      <AssistantChat llm={await aiAvailable()} />
    </div>
  );
}
