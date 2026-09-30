import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyReturnedTeacherPayment } from "@/features/teacher-access/actions";
import { requireOrganization } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Paiement de l'accès" };

/** Retour du fournisseur : l'état affiché vient de la vérification serveur, jamais de l'URL. */
export default async function TeacherPaymentReturnPage({ searchParams }: PageProps<"/mes-etablissements/retour">) {
  await requireOrganization();
  const params = await searchParams;
  const reference = param(params, "ref") ?? "";
  const result = await verifyReturnedTeacherPayment(reference);
  const status = result?.status ?? null;
  const ok = status === "SUCCESS";
  const failed = status === "FAILED" || status === "CANCELLED";
  const Icon = ok ? CheckCircle2 : failed ? XCircle : Clock;
  return (
    <Card className="anim-pop mx-auto grid max-w-md justify-items-center gap-4 p-6 text-center">
      <span className={ok ? "text-success" : failed ? "text-danger" : "text-warning"}>
        <Icon className="size-14" aria-hidden />
      </span>
      <h1 className="text-xl font-bold">{ok ? "Paiement confirmé" : failed ? "Paiement non abouti" : "Paiement en cours de vérification"}</h1>
      <p className="text-sm text-muted-foreground">
        {ok
          ? `Votre accès est activé${result?.coversTo ? ` jusqu'au ${formatDate(result.coversTo)}` : ""}. Vous pouvez ouvrir l'établissement depuis « Mes établissements ».`
          : failed
            ? "Aucun montant n'a été retenu. Vous pouvez réessayer depuis « Mes établissements »."
            : "Le fournisseur n'a pas encore confirmé le paiement. L'accès s'activera automatiquement dès sa confirmation."}
      </p>
      {reference ? <p className="font-mono text-xs text-muted-foreground">{reference}</p> : null}
      <Button asChild>
        <Link href="/mes-etablissements">Mes établissements</Link>
      </Button>
    </Card>
  );
}
