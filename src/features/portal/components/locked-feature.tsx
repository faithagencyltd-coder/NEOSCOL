import { Lock } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/format";

/**
 * Fonctionnalité suspendue pour impayé : aucune donnée n'est supprimée, elle
 * redevient visible dès l'enregistrement du paiement par l'administration.
 */
export function LockedFeature({ feature, overdue, currency, parent }: { feature: string; overdue: number; currency: string; parent: boolean }) {
  return (
    <Card className="grid justify-items-center gap-3 px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
        <Lock className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{feature} : accès temporairement suspendu</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        L&apos;établissement a suspendu cet accès en raison d&apos;un impayé de <strong className="text-foreground">{formatMoney(overdue, currency)}</strong>.
        Aucune donnée n&apos;est supprimée : l&apos;accès est rétabli immédiatement après l&apos;enregistrement du paiement par l&apos;administration.
        Les présences restent toujours consultables.
      </p>
      {parent ? (
        <Link href="/portail/finances" className="text-sm font-semibold text-primary hover:underline">
          Voir la situation financière
        </Link>
      ) : null}
    </Card>
  );
}
