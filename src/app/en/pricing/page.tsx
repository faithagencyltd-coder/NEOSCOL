import type { Metadata } from "next";

import { DICTS } from "@/features/marketing/content";
import { PricingPageEn } from "@/features/marketing/components/pages";
import { SiteShell } from "@/features/marketing/components/site-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: DICTS.en.pricing.title, description: DICTS.en.pricing.subtitle };

/** Pricing (English) — plans and prices read from the database. */
export default function PricingEn() {
  return (
    <SiteShell locale="en" alternate="/tarifs">
      <PricingPageEn />
    </SiteShell>
  );
}
