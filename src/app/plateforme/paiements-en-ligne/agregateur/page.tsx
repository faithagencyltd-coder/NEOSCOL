import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CustomGatewayEditor } from "@/features/platform/components/custom-gateway-editor";
import { aiAvailable } from "@/lib/ai/anthropic";

export const metadata: Metadata = { title: "Ajouter un agrégateur — Plateforme" };

/** Ajout d'un agrégateur de paiement inconnu de NeoScool, sans toucher au code. */
export default async function NewCustomGatewayPage() {
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <Link href="/plateforme/paiements-en-ligne" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Paiements en ligne
      </Link>
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Ajouter un agrégateur de paiement</h2>
        <p className="text-sm text-muted-foreground">
          Pour brancher un fournisseur que NeoScool ne connaît pas encore. Il ne sera proposé aux clients qu&apos;après un test réussi.
        </p>
      </div>
      <CustomGatewayEditor aiReady={await aiAvailable()} />
    </div>
  );
}
