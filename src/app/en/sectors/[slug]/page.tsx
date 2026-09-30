import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DICTS } from "@/features/marketing/content";
import { SectorPage, type Sector } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";

const SLUGS: Record<string, { sector: Sector; fr: string }> = {
  school: { sector: "school", fr: "scolaire" },
  university: { sector: "university", fr: "universite" },
  training: { sector: "training", fr: "formation" },
};

export async function generateMetadata({ params }: PageProps<"/en/sectors/[slug]">): Promise<Metadata> {
  const entry = SLUGS[(await params).slug];
  if (!entry) return {};
  const s = DICTS.en.sectors[entry.sector];
  return { title: s.title, description: `${s.tagline}: ${s.items.join(", ")}.` };
}

/** Sector page (English). */
export default async function SectorEn({ params }: PageProps<"/en/sectors/[slug]">) {
  const entry = SLUGS[(await params).slug];
  if (!entry) notFound();
  return (
    <SiteShell locale="en" alternate={`/secteurs/${entry.fr}`}>
      <SectorPage sector={entry.sector} locale="en" />
    </SiteShell>
  );
}
