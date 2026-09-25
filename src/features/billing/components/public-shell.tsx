import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/shared/logo";

/** Enveloppe des pages publiques de l'offre NéoScol (tarifs, inscription). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#0e4a9a] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 size-[26rem] rounded-full bg-cyan-400/20 blur-3xl [animation:blob_18s_ease-in-out_infinite]" />
          <div className="absolute -right-16 bottom-[-10rem] size-[28rem] rounded-full bg-blue-500/30 blur-3xl [animation:blob_24s_ease-in-out_infinite_reverse]" />
        </div>
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8" aria-label="Navigation principale">
          <Link href="/tarifs" aria-label="NéoScol — tarifs">
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
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        NéoScol — Plus qu&apos;un logiciel, une vision pour l&apos;éducation · Prix en F CFA (XOF), hors frais éventuels du moyen de paiement.
      </footer>
    </div>
  );
}
