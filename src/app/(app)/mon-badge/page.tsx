import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { MyBadgeContent } from "@/features/badges/my-badge-page";
import { requireOrganization } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Mon badge" };

/** Badge numérique de l'enseignant / du personnel : carte 3D et QR code tournant pour le pointage. */
export default async function MyBadgePage() {
  const context = await requireOrganization();
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader title="Mon badge" description="Votre badge numérique : touchez la carte pour afficher le QR code, ou passez en plein écran devant la tablette." />
      <MyBadgeContent organizationId={context.organization.id} />
    </div>
  );
}
