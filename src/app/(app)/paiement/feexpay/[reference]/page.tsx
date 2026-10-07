import { CheckCircle2, Smartphone, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeexPayForm } from "@/features/billing/components/feexpay-form";
import { loadFeexPayPayment } from "@/features/billing/feexpay";
import { requireOrganization } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiement FeexPay" };
// La demande à FeexPay peut attendre la validation sur le téléphone du payeur.
export const maxDuration = 180;

/**
 * Paiement FeexPay d'un abonnement (établissement ou enseignant) : le payeur
 * choisit son réseau et son numéro, valide sur son téléphone ; la confirmation
 * vient uniquement de la vérification serveur auprès de FeexPay.
 */
export default async function FeexPayPage({ params }: PageProps<"/paiement/feexpay/[reference]">) {
  await requireOrganization();
  const { reference } = await params;
  const payment = await loadFeexPayPayment(reference);
  if (!payment) notFound();
  const done = payment.status === "SUCCESS";
  const closed = payment.status === "FAILED" || payment.status === "CANCELLED";
  const back = payment.kind === "teacher" ? { href: "/mes-etablissements", label: "Retour à Mes établissements" } : { href: "/abonnement", label: "Retour à mon abonnement" };

  return (
    <Card className="mx-auto grid max-w-xl gap-5 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Smartphone className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-bold">Payer avec FeexPay</h1>
          <p className="text-sm text-muted-foreground">
            {payment.kind === "teacher" ? "Abonnement enseignant" : "Abonnement de l'établissement"} · référence {payment.reference}
          </p>
        </div>
      </div>
      <div className="grid gap-1 rounded-2xl bg-surface-muted p-4 text-center">
        <span className="text-sm text-muted-foreground">Montant à payer</span>
        <span className="font-display text-3xl font-bold tabular-nums" data-testid="feexpay-amount">
          {formatMoney(payment.amount, payment.currency)}
        </span>
      </div>
      {done ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" aria-hidden /> Paiement confirmé.
        </p>
      ) : closed ? (
        <p className="flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm text-danger">
          <XCircle className="size-5 shrink-0" aria-hidden /> Ce paiement est clos. Recommencez depuis votre abonnement.
        </p>
      ) : !payment.canPay ? (
        <p className="rounded-xl bg-warning-soft p-4 text-sm text-warning">Seul un responsable de l&apos;abonnement peut payer.</p>
      ) : (
        <FeexPayForm reference={payment.reference} returnPath={payment.returnPath} />
      )}
      <Button asChild variant="secondary">
        <Link href={done ? payment.returnPath : back.href}>{done ? "Voir le résultat" : back.label}</Link>
      </Button>
    </Card>
  );
}
