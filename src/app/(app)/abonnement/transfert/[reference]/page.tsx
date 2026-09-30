import { CheckCircle2, Clock, Landmark, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OfflineDeclarationForm } from "@/features/billing/components/offline-declaration-form";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiement par transfert" };

/**
 * Paiement par transfert : instructions du Super Admin, montant et référence
 * à indiquer, puis déclaration du paiement. L'abonnement n'est activé qu'après
 * validation par l'administration NeoScool.
 */
export default async function OfflinePaymentPage({ params }: PageProps<"/abonnement/transfert/[reference]">) {
  const context = await requirePermission("billing.read");
  const { reference } = await params;
  if (!/^NEO-\d{4}-\d{6,}$/.test(reference)) notFound();
  const supabase = await createClient();
  const [{ data: tx }, { data: gateways }] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("internal_reference, amount, currency, status, failure_reason, provider, provider_response")
      .eq("organization_id", context.organization.id)
      .eq("internal_reference", reference)
      .maybeSingle(),
    supabase.rpc("available_payment_gateways"),
  ]);
  if (!tx || tx.provider !== "offline") notFound();
  const instructions = ((gateways ?? []) as { provider: string; instructions: string | null }[]).find((g) => g.provider === "offline")?.instructions;
  const declaration = ((tx.provider_response ?? {}) as { declaration?: { reference?: string } }).declaration;
  const done = tx.status === "SUCCESS";
  const refused = tx.status === "FAILED" || tx.status === "CANCELLED";

  return (
    <Card className="mx-auto grid max-w-xl gap-5 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Landmark className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-bold">Paiement par transfert</h1>
          <p className="text-sm text-muted-foreground">Référence NeoScool : {tx.internal_reference}</p>
        </div>
      </div>
      <div className="grid gap-1 rounded-2xl bg-surface-muted p-4 text-center">
        <span className="text-sm text-muted-foreground">Montant à payer</span>
        <span className="font-display text-3xl font-bold tabular-nums">{formatMoney(tx.amount, tx.currency)}</span>
      </div>

      {done ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" aria-hidden /> Paiement validé par NeoScool : votre abonnement est actif.
        </p>
      ) : refused ? (
        <p className="flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm text-danger">
          <XCircle className="size-5 shrink-0" aria-hidden /> Paiement non validé. {tx.failure_reason ?? ""}
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <h2 className="font-semibold">1. Payez selon ces instructions</h2>
            <p className="whitespace-pre-line rounded-xl border border-border p-4 text-sm" data-testid="offline-instructions">
              {instructions ?? "Les instructions de paiement ne sont pas disponibles. Contactez NeoScool."}
            </p>
            <p className="text-xs text-muted-foreground">Indiquez la référence {tx.internal_reference} dans le motif du paiement si possible.</p>
          </div>
          <div className="grid gap-2">
            <h2 className="font-semibold">2. Déclarez votre paiement</h2>
            {declaration?.reference ? (
              <p className="flex items-center gap-2 rounded-xl bg-warning-soft p-4 text-sm text-warning">
                <Clock className="size-5" aria-hidden /> Paiement déclaré (réf. {declaration.reference}) : en attente de validation par NeoScool.
              </p>
            ) : null}
            <OfflineDeclarationForm reference={tx.internal_reference} declared={declaration?.reference ?? ""} />
          </div>
        </>
      )}
      <Button asChild variant="secondary">
        <Link href="/abonnement">Retour à mon abonnement</Link>
      </Button>
    </Card>
  );
}
