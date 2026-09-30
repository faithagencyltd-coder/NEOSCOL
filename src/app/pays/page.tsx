import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { CountriesPage } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: DICTS.fr.countriesPage.title, description: DICTS.fr.countries.subtitle };

/** Pays pris en charge par la configuration (français). */
export default function CountriesFr() {
  return (
    <SiteShell locale="fr" alternate="/en/countries">
      <CountriesPage locale="fr" />
    </SiteShell>
  );
}
