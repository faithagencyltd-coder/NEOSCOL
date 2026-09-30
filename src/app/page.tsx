import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { getSiteContent } from "@/features/marketing/data";
import { HomePage } from "@/features/marketing/components/home";
import { SiteShell } from "@/features/marketing/components/site-shell";

// Contenu réglé par le Super Admin : rendu à chaque visite (données en cache, rafraîchies à chaque modification).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return {
    title: { absolute: DICTS.fr.meta.title },
    description: content.settings.seo_description ?? DICTS.fr.meta.description,
    alternates: { canonical: "/", languages: { fr: "/", en: "/en" } },
    openGraph: { title: DICTS.fr.meta.title, description: content.settings.seo_description ?? DICTS.fr.meta.description, images: ["/site/captures/s-dashboard.webp"], locale: "fr_FR", type: "website" },
  };
}

/** Accueil du site officiel NeoScool (français). */
export default function Home() {
  return (
    <SiteShell locale="fr" alternate="/en">
      <HomePage locale="fr" />
    </SiteShell>
  );
}
