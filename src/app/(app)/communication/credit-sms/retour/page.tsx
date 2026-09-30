import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyReturnedSmsPayment } from "@/features/sms/actions";
import { requireOrganization } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Achat de crédit SMS" };

/** Retour du fournisseur : l'état affiché vient de la vérification serveur, jamais de l'URL. */
export default async function SmsPaymentReturnPage({ searchParams }: PageProps<"/communication/credit-sms/retour">) {
  await requireOrganization();
  const reference = param(await searchParams, "ref") ?? "";
  const result = await verifyReturnedSmsPayment(reference);
  const status = result?.status ?? null;
  const ok = status === "SUCCESS";
  const failed = status === "FAILED" || status === "CANCELLED";
  const Icon = ok ? CheckCircle2 : failed ? XCircle : Clock;
  return (
    <Card className="anim-pop mx-auto grid max-w-md justify-items-center gap-4 p-6 text-center" data-testid="sms-payment-result">
      <span className={ok ? "text-success" : failed ? "text-danger" : "text-warning"}>
        <Icon className="size-14" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">{ok ? "Crédit SMS ajouté" : failed ? "Paiement non abouti" : "Paiement en cours de vérification"}</h1>
      <p className="text-sm text-muted-foreground">
        {ok && result
          ? `${result.sms_count} SMS ajoutés à votre crédit (${formatMoney(result.amount, result.currency)}).`
          : failed
            ? "Aucun montant n'a été retenu. Vous pouvez réessayer."
            : "Le fournisseur n'a pas encore confirmé le paiement. Le crédit sera ajouté automatiquement dès sa confirmation."}
      </p>
      {reference ? <p className="font-mono text-xs text-muted-foreground">{reference}</p> : null}
      <Button asChild>
        <Link href="/communication/credit-sms">Crédit SMS</Link>
      </Button>
    </Card>
  );
}
