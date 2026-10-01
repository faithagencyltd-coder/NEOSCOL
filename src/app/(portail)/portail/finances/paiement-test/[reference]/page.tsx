import { CheckCircle2, FlaskConical, School, TriangleAlert, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { simulateFeeTestPayment } from "@/features/fee-payments/actions";
import { testProviderAllowed } from "@/features/fee-payments/server";
import { requirePortalSection } from "@/features/portal/context";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiement de test" };

/**
 * Page du fournisseur de TEST (adapter « mock ») : clairement séparée des vrais
 * fournisseurs, mode test uniquement, aucun argent réel. Le résultat choisi est
 * ensuite transmis par une vraie notification serveur puis revérifié.
 */
export default async function FeeTestCheckoutPage({ params }: PageProps<"/portail/finances/paiement-test/[reference]">) {
  const { organization, context } = await requirePortalSection("finances");
  const { reference } = await params;
  if (!testProviderAllowed()) notFound();
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("fee_payment_transactions")
    .select("internal_reference, amount, currency, status, adapter, purpose, provider_label, payer_user_id")
    .eq("internal_reference", decodeURIComponent(reference))
    .maybeSingle();
  if (!tx || tx.adapter !== "mock" || tx.payer_user_id !== context.user.id) notFound();
  return (
    <Card className="anim-pop mx-auto grid w-full max-w-md gap-5 overflow-hidden p-0" data-testid="fee-test-checkout">
      <div className="flex items-center gap-2 bg-warning-soft px-5 py-2.5 text-sm font-semibold text-warning">
        <FlaskConical className="size-4" aria-hidden /> Fournisseur de test — aucun argent réel
      </div>
      <div className="grid gap-4 px-5 pb-5">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <School className="size-7" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">Paiement à « {organization.short_name || organization.name} »</p>
          <p className="font-display text-3xl font-bold tabular-nums">{formatMoney(Number(tx.amount), tx.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {tx.purpose} · {tx.internal_reference}
          </p>
        </div>
        {tx.status === "PROCESSING" || tx.status === "PENDING" ? (
          <form action={simulateFeeTestPayment} className="grid gap-2">
            <input type="hidden" name="reference" value={tx.internal_reference} />
            <Button type="submit" name="outcome" value="completed" size="lg">
              <CheckCircle2 aria-hidden /> Simuler un paiement réussi
            </Button>
            <Button type="submit" name="outcome" value="failed" variant="secondary">
              <XCircle aria-hidden /> Simuler un refus
            </Button>
            <Button type="submit" name="outcome" value="cancelled" variant="ghost">
              Annuler le paiement
            </Button>
            <Button type="submit" name="outcome" value="wrong_amount" variant="ghost" className="text-xs text-muted-foreground">
              <TriangleAlert aria-hidden /> Test de sécurité : le fournisseur confirme un autre montant
            </Button>
          </form>
        ) : (
          <p className="rounded-xl bg-surface-muted p-3 text-center text-sm">Ce paiement est déjà traité ({tx.status}).</p>
        )}
      </div>
    </Card>
  );
}
