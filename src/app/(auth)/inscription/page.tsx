import type { Metadata } from "next";

import { SignupForm } from "@/features/billing/components/signup-form";
import { listPlans } from "@/features/billing/queries";

export const metadata: Metadata = { title: "Créer mon établissement — essai gratuit" };

/** Inscription d'un établissement : 14 jours d'essai gratuit sur la formule choisie. */
export default async function SignupPage({ searchParams }: PageProps<"/inscription">) {
  const params = await searchParams;
  const plans = (await listPlans()).filter((p) => p.is_active);
  const formule = typeof params.formule === "string" ? params.formule : undefined;
  const interval = params.periodicite === "YEARLY" ? "YEARLY" : "MONTHLY";
  return (
    <div className="grid gap-6">
      <div className="anim-fade-up grid gap-1.5">
        <p className="w-fit rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Essai gratuit — 14 jours</p>
        <h1 className="text-[1.75rem] font-bold leading-tight text-[#0b1f4d] sm:text-3xl dark:text-white">
          Créez votre <span className="bg-gradient-to-r from-[#1d63ed] to-[#0ea5e9] bg-clip-text text-transparent">établissement</span>
        </h1>
        <p className="text-sm text-muted-foreground">Toutes les fonctionnalités de votre formule, sans paiement pendant 14 jours.</p>
      </div>
      <SignupForm plans={plans} initialPlan={formule} initialInterval={interval} />
    </div>
  );
}
