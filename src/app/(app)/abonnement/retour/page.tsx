import { ArrowRight, Clock, RotateCcw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnimatedSuccess } from "@/components/motion/animated-feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyReturnedPayment } from "@/features/billing/actions";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Résultat du paiement" };

/**
 * Retour du navigateur après le paiement. Ce retour n'est PAS une preuve :
 * la page relance la vérification serveur auprès du fournisseur, puis affiche
 * l'état enregistré en base.
 */
export default async function PaymentReturnPage({ searchParams }: PageProps<"/abonnement/retour">) {
  const context = await requirePermission("billing.read");
  const params = await searchParams;
  const reference = typeof params.ref === "string" ? params.ref : "";
  await verifyReturnedPayment(reference);
  const supabase = await createClient();
  const [{ data: tx }, { data: sub }] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("internal_reference, amount, currency, status, failure_reason, invoice:subscription_invoices!payment_transactions_organization_id_invoice_id_fkey(invoice_number, plan_name, billing_interval, period_end, id)")
      .eq("organization_id", context.organization.id)
      .eq("internal_reference", reference)
      .maybeSingle(),
    supabase.from("subscriptions").select("status, current_period_end").eq("organization_id", context.organization.id).maybeSingle(),
  ]);

  if (!tx) {
    return (
      <Card className="mx-auto grid max-w-lg justify-items-center gap-3 p-8 text-center">
        <XCircle className="size-12 text-danger" aria-hidden />
        <p className="text-lg font-semibold">Paiement introuvable</p>
        <Button asChild>
          <Link href="/abonnement">Mon abonnement</Link>
        </Button>
      </Card>
    );
  }
  const success = tx.status === "SUCCESS";
  const failed = tx.status === "FAILED" || tx.status === "CANCELLED";
  return (
    <Card className="anim-pop mx-auto grid max-w-lg justify-items-center gap-4 p-8 text-center">
      {success ? (
        <AnimatedSuccess className="size-20" label="Paiement confirmé" />
      ) : failed ? (
        <XCircle className="anim-shake size-16 text-danger" aria-hidden />
      ) : (
        <Clock className="size-16 text-warning [animation:pulse-ring_2s_ease-out_infinite]" aria-hidden />
      )}
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">
          {success ? "Paiement confirmé" : failed ? (tx.status === "CANCELLED" || params.annule ? "Paiement annulé" : "Paiement échoué") : "Paiement en cours de confirmation"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {success
            ? `Votre abonnement est actif${sub?.current_period_end ? ` jusqu'au ${formatDate(sub.current_period_end, "fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}. Toutes les fonctionnalités sont disponibles.`
            : failed
              ? (tx.failure_reason ?? "Aucun montant n'a été validé. Vous pouvez réessayer.")
              : "Le prestataire n'a pas encore confirmé le paiement. Cette page se met à jour dès sa confirmation (notification serveur)."}
        </p>
      </div>
      <dl className="grid w-full gap-1.5 rounded-2xl bg-surface-muted/60 p-4 text-sm">
        {[
          ["Référence", tx.internal_reference],
          ["Facture", tx.invoice?.invoice_number ?? "—"],
          ["Formule", tx.invoice ? `${tx.invoice.plan_name} (${tx.invoice.billing_interval === "YEARLY" ? "annuel" : "mensuel"})` : "—"],
          ["Montant", formatMoney(tx.amount, tx.currency)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        {success && tx.invoice ? (
          <Button asChild variant="secondary">
            <a href={`/api/abonnement/factures/${tx.invoice.id}`} target="_blank" rel="noreferrer">
              Facture PDF
            </a>
          </Button>
        ) : null}
        {!success && !failed ? (
          <Button asChild variant="secondary">
            <Link href={`/abonnement/retour?ref=${encodeURIComponent(tx.internal_reference)}`}>
              <RotateCcw aria-hidden /> Vérifier à nouveau
            </Link>
          </Button>
        ) : null}
        {failed ? (
          <Button asChild variant="secondary">
            <Link href="/abonnement/souscrire">Réessayer</Link>
          </Button>
        ) : null}
        <Button asChild>
          <Link href="/abonnement">
            Mon abonnement <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
