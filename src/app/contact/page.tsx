import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { ContactPage } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: DICTS.fr.contact.title, description: DICTS.fr.contact.subtitle };

/** Contact et demande de démonstration (français). */
export default async function ContactFr({ searchParams }: PageProps<"/contact">) {
  const demo = (await searchParams).demande === "demo";
  return (
    <SiteShell locale="fr" alternate={demo ? "/en/contact?demande=demo" : "/en/contact"}>
      <ContactPage locale="fr" demo={demo} />
    </SiteShell>
  );
}
