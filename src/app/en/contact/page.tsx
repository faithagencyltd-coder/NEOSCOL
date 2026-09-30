import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { ContactPage } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: DICTS.en.contact.title, description: DICTS.en.contact.subtitle };

/** Contact and demo request (English). */
export default async function ContactEn({ searchParams }: PageProps<"/en/contact">) {
  const demo = (await searchParams).demande === "demo";
  return (
    <SiteShell locale="en" alternate={demo ? "/contact?demande=demo" : "/contact"}>
      <ContactPage locale="en" demo={demo} />
    </SiteShell>
  );
}
