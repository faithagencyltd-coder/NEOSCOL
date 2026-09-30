import { CheckCircle2, FlaskConical, Smartphone, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { simulateTeacherPayment } from "@/features/teacher-access/actions";
import { requireOrganization } from "@/lib/auth/guards";
import { simulationAllowed } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Paiement simulé (test)" };

/** Page du fournisseur SIMULÉ (mode test local, aucun argent réel) pour l'accès enseignant supplémentaire. */
export default async function SimulatedTeacherCheckoutPage({ params }: PageProps<"/mes-etablissements/paiement-simule/[reference]">) {
  await requireOrganization();
  const { reference } = await params;
  if (!simulationAllowed()) notFound();
  const supabase = await createClient();
  // RLS : uniquement un paiement du compte connecté.
  const { data: pay } = await supabase
    .from("teacher_access_payments")
    .select("internal_reference, amount, currency, status, provider, period_months")
    .eq("internal_reference", decodeURIComponent(reference))
    .maybeSingle();
  if (!pay || pay.provider !== "simulation") notFound();
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
          <p className="text-sm text-muted-foreground">Paiement à « NeoScool » — accès enseignant supplémentaire</p>
          <p className="font-display text-3xl font-bold tabular-nums">{formatMoney(pay.amount, pay.currency)}</p>
          <p className="text-xs text-muted-foreground">
            {pay.period_months === 1 ? "1 mois" : `${pay.period_months} mois`} · {pay.internal_reference}
          </p>
        </div>
        {pay.status === "PROCESSING" || pay.status === "PENDING" ? (
          <form action={simulateTeacherPayment} className="grid gap-2">
            <input type="hidden" name="reference" value={pay.internal_reference} />
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
          <p className="rounded-xl bg-surface-muted p-3 text-center text-sm">Ce paiement est déjà traité ({pay.status}).</p>
        )}
      </div>
    </Card>
  );
}
