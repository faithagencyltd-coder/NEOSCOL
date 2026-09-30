import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { CardDesignForm } from "@/features/cards/components/card-design-form";
import { cardLabels, sampleCard } from "@/features/cards/design";
import { loadCardDesign } from "@/features/cards/server";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Cartes et badges" };

/** Design des cartes élève / apprenant / étudiant de l'établissement. */
export default async function CardDesignPage() {
  const context = await requirePermission("settings.manage");
  const supabase = await createClient();
  const loaded = await loadCardDesign(supabase, context.organization.id);
  if (!loaded) notFound();
  const v = vocabularyFor(context.organization.type);
  const labels = cardLabels(v);
  return (
    <div className="grid w-full min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Cartes et badges"
        description={`Design de la ${labels.title.toLowerCase()} : modèle, couleurs et textes. Il s'applique à l'écran, au PDF imprimé et à l'image téléchargée.`}
      />
      <CardDesignForm design={loaded.design} sample={sampleCard(v, loaded.organization)} />
    </div>
  );
}
