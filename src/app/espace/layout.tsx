import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "@/features/marketing/components/site-shell";

export const metadata: Metadata = { title: "Mon espace — NeoScool", robots: { index: false } };

/** Espace personnel NeoScool (particuliers) : annonces, candidatures, favoris. Indépendant des établissements. */
export default function PersonalSpaceLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell locale="fr" alternate="/espace">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-8">{children}</div>
    </SiteShell>
  );
}
