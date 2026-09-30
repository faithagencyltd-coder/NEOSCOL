import { BadgeCheck, BadgePercent, CalendarClock, CreditCard, Database, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";

import { PricingGrid } from "@/features/billing/components/pricing-grid";
import { PublicShell } from "@/features/billing/components/public-shell";
import { listPlans } from "@/features/billing/queries";
import { TRIAL_DAYS } from "@/features/billing/constants";
import { defaultFaq } from "@/features/site/faq";
import { getSiteSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = {
  title: "Tarifs",
  description: `Formules NeoScool : maternelle et primaire, collège et lycée, centre de formation, université, Module 4 multi-modules. Essai gratuit de ${TRIAL_DAYS} jours, -30 % en annuel.`,
};


/** Page publique des tarifs : 5 formules officielles, mensuel ou annuel -30 %. */
export default async function PricingPage() {
  const plans = await listPlans();
  const { data: offers } = await (await createClient()).rpc("active_offers");
  // Durée d'essai réglée par le Super Admin (la plus fréquente des formules proposées).
  const trialDays = plans.length ? Math.max(...plans.filter((p) => p.is_active).map((p) => p.trial_days)) : TRIAL_DAYS;
  const site = await getSiteSettings();
  const faq = site.faq.length ? site.faq : defaultFaq(trialDays);
  return (
    <PublicShell>
      <section className="relative -mt-px bg-gradient-to-br from-[#0b2559] via-[#0e3a82] to-[#0e4a9a] pb-10 pt-6 text-center text-white">
        <div className="mx-auto grid max-w-3xl gap-3 px-4">
          <p className="anim-fade-up text-xs font-semibold uppercase tracking-widest text-cyan-300">Tarifs NeoScool</p>
          <h1 className="anim-fade-up text-3xl font-bold leading-tight [--delay:80ms] sm:text-4xl">Une formule adaptée à chaque établissement</h1>
          <p className="anim-fade-up text-base text-sky-100/85 [--delay:160ms]">
            De l&apos;école maternelle à l&apos;université. <strong className="text-white">Essai gratuit {trialDays > 0 ? `de ${trialDays} jours` : ""}</strong> sur toutes les formules, sans paiement.
          </p>
        </div>
      </section>
      <main className="mx-auto grid max-w-7xl gap-12 px-4 py-8 sm:px-8">
        {offers?.length ? (
          <section aria-label="Offres en cours" className="grid gap-3" data-testid="active-offers">
            {offers.map((o) => (
              <div key={o.name} className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-300 bg-orange-50 p-4 text-orange-900">
                <BadgePercent className="size-6 shrink-0" aria-hidden />
                <div className="grid">
                  <span className="font-semibold">
                    {o.name} : {o.discount_type === "percent" ? `-${o.discount_value} %` : `-${formatMoney(o.discount_value, "XOF")}`}
                    {o.ends_at ? ` jusqu'au ${formatDate(o.ends_at)}` : ""}
                  </span>
                  {o.description ? <span className="text-sm">{o.description}</span> : null}
                  <span className="text-xs">Réduction appliquée automatiquement au paiement.</span>
                </div>
              </div>
            ))}
          </section>
        ) : null}
        <PricingGrid plans={plans} mode="public" />

        <section aria-label="Inclus dans toutes les formules" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: CalendarClock, title: `${TRIAL_DAYS} jours d'essai`, text: "Toutes les fonctionnalités de la formule, sans carte ni mobile money." },
            { icon: Smartphone, title: "Mobile money", text: "Paiement en ligne sécurisé, confirmé par le serveur auprès du prestataire." },
            { icon: CreditCard, title: "Mensuel ou annuel", text: "Économisez 30 % en payant à l'année. Prix garanti pendant la période payée." },
            { icon: Database, title: "Données conservées", text: "Aucune suppression en cas de retard de paiement : lecture seule, puis réactivation immédiate." },
            { icon: ShieldCheck, title: "Isolation stricte", text: "Chaque établissement est séparé au niveau de la base de données." },
            { icon: BadgeCheck, title: "Factures PDF", text: "Chaque paiement produit une facture NeoScool numérotée, téléchargeable." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-0.5 text-sm">
                <span className="font-semibold">{item.title}</span>
                <span className="text-muted-foreground">{item.text}</span>
              </span>
            </div>
          ))}
        </section>

        <section aria-labelledby="faq" className="mx-auto grid w-full max-w-3xl gap-3">
          <h2 id="faq" className="text-center text-xl font-bold">Questions fréquentes</h2>
          {faq.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-border bg-surface px-4 py-3">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{item.q}</summary>
              <p className="anim-fade-up mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
