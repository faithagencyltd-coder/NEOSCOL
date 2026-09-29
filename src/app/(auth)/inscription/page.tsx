import type { Metadata } from "next";

import { SignupForm } from "@/features/billing/components/signup-form";
import { turnstileSettings } from "@/lib/messaging/server";
import { createClient } from "@/lib/supabase/server";
import { listPlans } from "@/features/billing/queries";
import { MODULE4_COMPONENTS, TRIAL_DAYS } from "@/features/billing/constants";

export const metadata: Metadata = { title: "Créer mon établissement — essai gratuit" };

/** Inscription d'un établissement : essai gratuit (TRIAL_DAYS jours) sur la formule choisie. */
export default async function SignupPage({ searchParams }: PageProps<"/inscription">) {
  const params = await searchParams;
  const plans = (await listPlans()).filter((p) => p.is_active);
  const formule = typeof params.formule === "string" ? params.formule : undefined;
  const interval = params.periodicite === "YEARLY" ? "YEARLY" : "MONTHLY";
  const requested = typeof params.composantes === "string" ? params.composantes.split(",") : [];
  const components = MODULE4_COMPONENTS.map((c) => c.key).filter((k) => requested.includes(k));
  // Pays actifs, gérés par le Super Admin (aucune liste codée en dur).
  const supabase = await createClient();
  const { data: countryRows } = await supabase.from("countries").select("code, name").eq("is_active", true).order("sort_order").order("name");
  const countries = (countryRows ?? []).map((c) => [c.code, c.name] as [string, string]);
  return (
    <div className="grid gap-6">
      <div className="anim-fade-up grid gap-1.5">
        <p className="w-fit rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Essai gratuit — {TRIAL_DAYS} jours</p>
        <h1 className="text-[1.75rem] font-bold leading-tight text-[#0b1f4d] sm:text-3xl dark:text-white">
          Créez votre <span className="bg-gradient-to-r from-[#1d63ed] to-[#0ea5e9] bg-clip-text text-transparent">établissement</span>
        </h1>
        <p className="text-sm text-muted-foreground">Toutes les fonctionnalités de votre formule, sans paiement pendant {TRIAL_DAYS} jours.</p>
      </div>
      <SignupForm plans={plans} initialPlan={formule} initialInterval={interval} initialComponents={components} captcha={await turnstileSettings()} countries={countries.length ? countries : undefined} />
    </div>
  );
}
