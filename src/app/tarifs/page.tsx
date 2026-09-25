import { BadgeCheck, CalendarClock, CreditCard, Database, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";

import { PricingGrid } from "@/features/billing/components/pricing-grid";
import { PublicShell } from "@/features/billing/components/public-shell";
import { listPlans } from "@/features/billing/queries";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Formules NéoScol : maternelle et primaire, collège et lycée, centre de formation, université, Enterprise. Essai gratuit de 14 jours, -30 % en annuel.",
};

const FAQ = [
  { q: "Que se passe-t-il après les 14 jours d'essai ?", a: "Vous choisissez votre formule et payez en ligne. Sans paiement, l'établissement passe progressivement en lecture seule : aucune donnée n'est jamais supprimée, et tout est rétabli dès le paiement confirmé." },
  { q: "Comment payer ?", a: "Par mobile money (dont MTN, Moov et Celtiis Cash au Bénin) ou carte, via notre prestataire de paiement sécurisé. Chaque paiement donne lieu à une facture PDF." },
  { q: "Puis-je changer de formule ou annuler ?", a: "Oui, depuis « Mon abonnement ». En cas d'annulation, l'accès reste complet jusqu'à la fin de la période déjà payée." },
  { q: "Mes données sont-elles séparées des autres établissements ?", a: "Oui : chaque établissement est isolé au niveau de la base de données. Les finances de votre établissement (scolarité, reçus) sont distinctes de votre abonnement NéoScol." },
];

/** Page publique des tarifs : 5 formules officielles, mensuel ou annuel -30 %. */
export default async function PricingPage() {
  const plans = await listPlans();
  return (
    <PublicShell>
      <section className="relative -mt-px bg-gradient-to-br from-[#0b2559] via-[#0e3a82] to-[#0e4a9a] pb-10 pt-6 text-center text-white">
        <div className="mx-auto grid max-w-3xl gap-3 px-4">
          <p className="anim-fade-up text-xs font-semibold uppercase tracking-widest text-cyan-300">Tarifs NéoScol</p>
          <h1 className="anim-fade-up text-3xl font-bold leading-tight [--delay:80ms] sm:text-4xl">Une formule adaptée à chaque établissement</h1>
          <p className="anim-fade-up text-base text-sky-100/85 [--delay:160ms]">
            De l&apos;école maternelle à l&apos;université. <strong className="text-white">Essai gratuit de 14 jours</strong> sur toutes les formules, sans paiement.
          </p>
        </div>
      </section>
      <main className="mx-auto grid max-w-7xl gap-12 px-4 py-8 sm:px-8">
        <PricingGrid plans={plans} mode="public" />

        <section aria-label="Inclus dans toutes les formules" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: CalendarClock, title: "14 jours d'essai", text: "Toutes les fonctionnalités de la formule, sans carte ni mobile money." },
            { icon: Smartphone, title: "Mobile money", text: "Paiement en ligne sécurisé, confirmé par le serveur auprès du prestataire." },
            { icon: CreditCard, title: "Mensuel ou annuel", text: "Économisez 30 % en payant à l'année. Prix garanti pendant la période payée." },
            { icon: Database, title: "Données conservées", text: "Aucune suppression en cas de retard de paiement : lecture seule, puis réactivation immédiate." },
            { icon: ShieldCheck, title: "Isolation stricte", text: "Chaque établissement est séparé au niveau de la base de données." },
            { icon: BadgeCheck, title: "Factures PDF", text: "Chaque paiement produit une facture NéoScol numérotée, téléchargeable." },
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
          {FAQ.map((item) => (
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
