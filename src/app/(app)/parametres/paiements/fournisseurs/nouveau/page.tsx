import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { ProviderForm } from "@/features/fee-payments/components/provider-form";
import { listSchoolAdapters } from "@/features/fee-payments/server";
import { requirePermission } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Ajouter un fournisseur de paiement" };

export default async function NewFeeProviderPage() {
  const context = await requirePermission("finance.online.manage");
  const adapters = await listSchoolAdapters();
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6 [&>*]:min-w-0">
      <Link href="/parametres/paiements" className="text-sm font-semibold text-primary hover:underline">
        ← Paramètres des paiements
      </Link>
      <PageHeader
        title="Ajouter un fournisseur"
        description="Agrégateur Mobile Money, carte bancaire, banque ou toute API de paiement : autant de fournisseurs que nécessaire. Après l'enregistrement : testez la connexion puis activez-le."
      />
      <ProviderForm adapters={adapters} defaultCurrency={context.organization.currency} />
    </div>
  );
}
