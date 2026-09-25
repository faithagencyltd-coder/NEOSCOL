import { CheckCircle2, FlaskConical, Smartphone, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { simulatePayment } from "@/features/billing/actions";
import { requirePermission } from "@/lib/auth/guards";
import { simulationAllowed } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiement simulé (test)" };

/**
 * Page de paiement du fournisseur SIMULÉ (mode test local, aucun argent réel).
 * Elle remplace la page du prestataire pour tester tout le parcours sans clé.
 */
export default async function SimulatedCheckoutPage({ params }: PageProps<"/abonnement/paiement-simule/[reference]">) {
  const context = await requirePermission("billing.manage");
  const { reference } = await params;
  if (!simulationAllowed()) notFound();
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("internal_reference, amount, currency, status, provider, invoice:subscription_invoices!payment_transactions_organization_id_invoice_id_fkey(invoice_number, plan_name, billing_interval)")
    .eq("organization_id", context.organization.id)
    .eq("internal_reference", decodeURIComponent(reference))
    .maybeSingle();
  if (!tx || tx.provider !== "simulation") notFound();
  return (
    <Card className="anim-pop mx-auto grid max-w-md gap-5 overflow-hidden p-0">
      <div className="flex items-center gap-2 bg-warning-soft px-5 py-2.5 text-sm font-semibold text-warning">
        <FlaskConical className="size-4" aria-hidden /> Mode test — paiement simulé, aucun argent réel
      </div>
      <div className="grid gap-4 px-5 pb-5">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Smartphone className="size-7" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">Paiement à « NéoScol »</p>
          <p className="font-display text-3xl font-bold tabular-nums">{formatMoney(tx.amount, tx.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {tx.invoice?.plan_name} · {tx.invoice?.billing_interval === "YEARLY" ? "annuel" : "mensuel"} · facture {tx.invoice?.invoice_number} · {tx.internal_reference}
          </p>
        </div>
        {tx.status === "PROCESSING" || tx.status === "PENDING" ? (
          <form action={simulatePayment} className="grid gap-2">
            <input type="hidden" name="reference" value={tx.internal_reference} />
            <Button type="submit" name="outcome" value="completed" size="lg">
              <CheckCircle2 aria-hidden /> Simuler un paiement réussi
            </Button>
            <Button type="submit" name="outcome" value="failed" variant="secondary">
              <XCircle aria-hidden /> Simuler un échec
            </Button>
            <Button type="submit" name="outcome" value="cancelled" variant="ghost">
              Annuler le paiement
            </Button>
          </form>
        ) : (
          <p className="rounded-xl bg-surface-muted p-3 text-center text-sm">Ce paiement est déjà traité ({tx.status}).</p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          L&apos;issue choisie est enregistrée côté « fournisseur », puis NéoScol la vérifie par le même circuit qu&apos;une notification réelle.
        </p>
      </div>
    </Card>
  );
}
