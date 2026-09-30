import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DICTS } from "@/features/marketing/content";
import { SectorPage, type Sector } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";

const SLUGS: Record<string, { sector: Sector; en: string }> = {
  scolaire: { sector: "school", en: "school" },
  universite: { sector: "university", en: "university" },
  formation: { sector: "training", en: "training" },
};

export async function generateMetadata({ params }: PageProps<"/secteurs/[slug]">): Promise<Metadata> {
  const entry = SLUGS[(await params).slug];
  if (!entry) return {};
  const s = DICTS.fr.sectors[entry.sector];
  return { title: s.title, description: `${s.tagline} : ${s.items.join(", ")}.` };
}

/** Page d'un secteur (français). */
export default async function SectorFr({ params }: PageProps<"/secteurs/[slug]">) {
  const entry = SLUGS[(await params).slug];
  if (!entry) notFound();
  return (
    <SiteShell locale="fr" alternate={`/en/sectors/${entry.en}`}>
      <SectorPage sector={entry.sector} locale="fr" />
    </SiteShell>
  );
}
