import { CheckCircle2, Clock3, Download, RefreshCw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyReturnedFeePayment } from "@/features/fee-payments/actions";
import { requirePortalSection } from "@/features/portal/context";
import { PAYMENT_STATUS_LABELS } from "@/lib/payments/school-adapters";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Résultat du paiement" };

/**
 * Retour de la famille après le paiement. Le retour du navigateur n'est jamais
 * une preuve : la page relance la vérification serveur auprès du fournisseur,
 * puis affiche l'état enregistré en base.
 */
export default async function FeeReturnPage({ searchParams }: PageProps<"/portail/finances/retour">) {
  await requirePortalSection("finances");
  const { ref } = await searchParams;
  const reference = typeof ref === "string" ? ref : "";
  const tx = await verifyReturnedFeePayment(reference);

  if (!tx) {
    return (
      <Card className="mx-auto grid max-w-md gap-3 p-6 text-center">
        <p className="font-semibold">Paiement introuvable.</p>
        <Link href="/portail/finances" className={buttonVariants({ variant: "secondary" })}>
          Retour aux finances
        </Link>
      </Card>
    );
  }
  const success = tx.status === "SUCCESS" || tx.status === "PARTIALLY_REFUNDED" || tx.status === "REFUNDED";
  const pending = tx.status === "PENDING" || tx.status === "PROCESSING";
  return (
    <Card className="anim-pop mx-auto grid w-full max-w-md gap-5 p-6 text-center" data-testid="fee-return" data-status={tx.status}>
      <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${success ? "bg-success-soft text-success" : pending ? "bg-info-soft text-info" : "bg-danger-soft text-danger"}`}>
        {success ? <CheckCircle2 className="size-9" aria-hidden /> : pending ? <Clock3 className="size-9" aria-hidden /> : <XCircle className="size-9" aria-hidden />}
      </span>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">
          {success ? (tx.needs_review ? "Paiement reçu — en cours de vérification par l'établissement." : "Paiement reçu avec succès.") : pending ? "Paiement en attente de confirmation" : `Paiement ${PAYMENT_STATUS_LABELS[tx.status]?.toLowerCase() ?? tx.status}`}
        </h1>
        <p className="font-display text-3xl font-bold tabular-nums">{formatMoney(tx.amount, tx.currency)}</p>
        <p className="text-sm text-muted-foreground">
          {tx.purpose} · {tx.provider_label}
        </p>
        <p className="text-xs text-muted-foreground">Référence {tx.internal_reference}</p>
        {tx.mode === "test" ? (
          <Badge tone="warning" className="mx-auto mt-1">
            MODE TEST — aucun argent réel
          </Badge>
        ) : null}
      </div>
      {pending ? <p className="text-sm text-muted-foreground">Le fournisseur n&apos;a pas encore confirmé le paiement. Il sera enregistré automatiquement dès sa confirmation ; vous recevrez une notification.</p> : null}
      {!success && !pending && tx.failure_reason ? <p className="text-sm text-muted-foreground">{tx.failure_reason}</p> : null}
      <div className="grid gap-2">
        {tx.payment_id ? (
          <a href={`/api/documents/recus/${tx.payment_id}`} target="_blank" rel="noreferrer" className={buttonVariants({ size: "lg" })} data-testid="fee-receipt-link">
            <Download aria-hidden /> Télécharger le reçu {tx.receipt ?? ""}
          </a>
        ) : null}
        {pending ? (
          <Link href={`/portail/finances/retour?ref=${tx.internal_reference}`} className={buttonVariants({ variant: "secondary" })}>
            <RefreshCw aria-hidden /> Vérifier à nouveau
          </Link>
        ) : null}
        <Link href="/portail/finances" className={buttonVariants({ variant: success ? "secondary" : "primary" })}>
          Retour aux finances
        </Link>
      </div>
    </Card>
  );
}
