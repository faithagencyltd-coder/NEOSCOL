import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { getSiteContent } from "@/features/marketing/data";
import { HomePage } from "@/features/marketing/components/home";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return {
    title: { absolute: DICTS.en.meta.title },
    description: content.settings.seo_description_en ?? DICTS.en.meta.description,
    alternates: { canonical: "/en", languages: { fr: "/", en: "/en" } },
    openGraph: { title: DICTS.en.meta.title, description: content.settings.seo_description_en ?? DICTS.en.meta.description, images: ["/site/captures/s-dashboard.webp"], locale: "en_GB", type: "website" },
  };
}

/** NeoScool official website home page (English). */
export default function HomeEn() {
  return (
    <SiteShell locale="en" alternate="/">
      <HomePage locale="en" />
    </SiteShell>
  );
}
