import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { TrainingSettingsForm } from "@/features/training/components/settings-form";
import { requireTraining } from "@/features/training/guard";

export const metadata: Metadata = { title: "Paramètres de formation" };

export default async function TrainingSettingsPage() {
  const context = await requireTraining("settings.manage");
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Paramètres de formation"
        description="Classes / groupes facultatifs et règles du scan des badges (retard, ouverture avant le cours)."
      />
      <TrainingSettingsForm config={context.training} />
    </div>
  );
}
