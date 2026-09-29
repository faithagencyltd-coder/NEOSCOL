import type { Metadata } from "next";

import { UniversitySettingsForm } from "@/features/university/components/settings-form";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";

export const metadata: Metadata = { title: "Paramètres universitaires" };

export default async function UniversitySettingsPage() {
  const context = await requireUniversity(["settings.manage"]);
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Paramètres universitaires"
        description="Fonctionnalités activées, règles de calcul (validation, compensation, rattrapage, passage), grades des enseignants et règles du scan. Rien n'est imposé : chaque établissement configure ses propres règles."
      />
      <UniversitySettingsForm config={context.university} />
    </div>
  );
}
