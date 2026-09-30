import { LifeBuoy } from "lucide-react";
import type { Metadata } from "next";

import { PublicShell } from "@/features/billing/components/public-shell";
import { TRIAL_DAYS } from "@/features/billing/constants";
import { defaultFaq } from "@/features/site/faq";
import { SiteContacts } from "@/features/site/components/site-contacts";
import { getSiteSettings } from "@/lib/site-settings";

// Rendue à chaque visite : une modification du Super Admin est visible immédiatement.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Aide et contact", description: "Questions fréquentes et coordonnées de l'équipe NeoScool." };

/** Aide publique : questions fréquentes et coordonnées réglées par le Super Admin. */
export default async function HelpPage() {
  const site = await getSiteSettings();
  const faq = site.faq.length ? site.faq : defaultFaq(TRIAL_DAYS);
  const hasContacts = Boolean(site.whatsapp || site.contact_email || site.contact_phone || site.address);
  return (
    <PublicShell>
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-10 sm:px-8">
        <header className="grid gap-2 text-center">
          <LifeBuoy className="mx-auto size-10 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold">Aide et contact</h1>
          <p className="text-muted-foreground">Une question ? Les réponses aux plus fréquentes sont ci-dessous.</p>
        </header>
        <section aria-labelledby="contact" className="grid gap-3 rounded-2xl border border-border bg-surface p-5">
          <h2 id="contact" className="text-lg font-bold">Nous contacter</h2>
          {hasContacts ? (
            <SiteContacts site={site} className="grid gap-2 text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">Les coordonnées de l&apos;équipe NeoScool seront publiées prochainement.</p>
          )}
        </section>
        <section aria-labelledby="faq" className="grid gap-3">
          <h2 id="faq" className="text-xl font-bold">Questions fréquentes</h2>
          <div className="grid gap-3" data-testid="faq-list">
            {faq.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-border bg-surface px-4 py-3">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{item.q}</summary>
                <p className="anim-fade-up mt-2 whitespace-pre-line text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
