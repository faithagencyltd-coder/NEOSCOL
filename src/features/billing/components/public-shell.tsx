import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/shared/logo";
import { getAnalyticsConfig } from "@/features/analytics/server";
import { SupportChatMount } from "@/features/support/components/support-chat-mount";
import { VisitBeacon } from "@/features/marketing/components/visit-beacon";
import { SiteContacts } from "@/features/site/components/site-contacts";
import { getSiteSettings } from "@/lib/site-settings";

/** Enveloppe des pages publiques de l'offre NeoScool (tarifs, aide, conditions). */
export async function PublicShell({ children }: { children: ReactNode }) {
  const [site, analytics] = await Promise.all([getSiteSettings(), getAnalyticsConfig()]);
  return (
    <div className="min-h-dvh bg-background">
      <VisitBeacon locale="fr" config={analytics} />
      <SupportChatMount placement="site" />
      <header className="relative overflow-hidden bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 size-[26rem] rounded-full bg-cyan-400/20 blur-3xl [animation:blob_18s_ease-in-out_infinite]" />
          <div className="absolute -right-16 bottom-[-10rem] size-[28rem] rounded-full bg-blue-500/30 blur-3xl [animation:blob_24s_ease-in-out_infinite_reverse]" />
        </div>
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8" aria-label="Navigation principale">
          <Link href="/tarifs" aria-label="NeoScool — tarifs">
            <Logo inverted tagline />
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link href="/connexion" className="rounded-xl px-3 py-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white">
              Connexion
            </Link>
            <Link href="/inscription" className="rounded-xl bg-white px-3.5 py-2 text-[#0b2559] shadow-sm transition-transform hover:-translate-y-0.5">
              Essai gratuit
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="border-t border-border px-4 py-8 text-xs text-muted-foreground">
        <div className="mx-auto grid max-w-5xl gap-4 text-center">
          <SiteContacts site={site} className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-foreground" />
          <nav aria-label="Informations" className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-medium">
            <Link href="/tarifs" className="hover:underline">Tarifs</Link>
            <Link href="/aide" className="hover:underline">Aide et contact</Link>
            <Link href="/conditions" className="hover:underline">Conditions générales</Link>
            <Link href="/confidentialite" className="hover:underline">Confidentialité</Link>
          </nav>
          <p>NeoScool — Plus qu&apos;un logiciel, une vision pour l&apos;éducation · Prix en F CFA (XOF), hors frais éventuels du moyen de paiement.</p>
        </div>
      </footer>
    </div>
  );
}
