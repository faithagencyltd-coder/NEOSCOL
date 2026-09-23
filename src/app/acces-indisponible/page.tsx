import { ShieldOff } from "lucide-react";
import type { Metadata } from "next";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accès indisponible" };

/** Compte valide mais sans établissement actif (adhésion suspendue, compte désactivé…). */
export default async function AccessUnavailablePage() {
  await requireSession();
  // Super administrateur sans établissement : console de la plateforme.
  const { data: platformAdmin } = await (await createClient()).rpc("is_platform_admin");
  if (platformAdmin) redirect("/plateforme");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-10">
      <Logo />
      <Card className="grid gap-4 p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldOff className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Aucun établissement accessible</h1>
          <p className="text-sm text-muted-foreground">
            Votre compte n&apos;est rattaché à aucun établissement actif, ou votre accès a été suspendu. Contactez
            l&apos;administration de votre établissement.
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </Card>
    </main>
  );
}
