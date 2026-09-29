import type { Metadata } from "next";

import { MyBadgeContent } from "@/features/badges/my-badge-page";
import { requirePortal } from "@/features/portal/context";

export const metadata: Metadata = { title: "Mon badge" };

/** Carte / badge numérique de l'étudiant ou de l'apprenant (QR tournant pour la tablette de pointage). */
export default async function PortalBadgePage() {
  const { organization } = await requirePortal();
  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Mon badge</h1>
        <p className="text-sm text-muted-foreground">Touchez la carte pour afficher le QR code, ou passez en plein écran devant la tablette.</p>
      </div>
      <MyBadgeContent organizationId={organization.id} />
    </div>
  );
}
