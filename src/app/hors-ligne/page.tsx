import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = { title: "Hors ligne" };
export const dynamic = "force-static";

/** Affichée par le service worker lorsque le réseau est indisponible (aucune donnée personnelle en cache). */
export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center justify-items-center gap-6 px-4 text-center">
      <Logo />
      <span className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
        <WifiOff className="size-7" aria-hidden />
      </span>
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Vous êtes hors ligne</h1>
        <p className="text-sm text-muted-foreground">
          NéoScol a besoin d&apos;une connexion pour afficher vos données. Pour protéger la confidentialité, aucune information personnelle n&apos;est
          conservée sur cet appareil.
        </p>
      </div>
      {/* Rechargement complet volontaire : la navigation client échouerait hors ligne. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
        Réessayer
      </a>
    </main>
  );
}
