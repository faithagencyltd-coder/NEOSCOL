import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center justify-items-center gap-6 px-4 text-center">
      <Logo />
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-primary">Erreur 404</p>
        <h1 className="text-2xl font-semibold">Page introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Cette page n&apos;existe pas ou vous n&apos;avez pas les droits pour y accéder.
        </p>
      </div>
      <Button asChild>
        <Link href="/tableau-de-bord">Retour au tableau de bord</Link>
      </Button>
    </main>
  );
}
