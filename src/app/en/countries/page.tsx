import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { CountriesPage } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: DICTS.en.countriesPage.title, description: DICTS.en.countries.subtitle };

/** Countries supported by the configuration (English). */
export default function CountriesEn() {
  return (
    <SiteShell locale="en" alternate="/pays">
      <CountriesPage locale="en" />
    </SiteShell>
  );
}
