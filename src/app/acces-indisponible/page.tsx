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
export default async function AccessUnavailablePage({ searchParams }: PageProps<"/acces-indisponible">) {
  await requireSession();
  const portalOff = (await searchParams).portail === "desactive";
  // Super administrateur sans établissement : console de la plateforme.
  const { data: platformAdmin } = await (await createClient()).rpc("is_platform_admin");
  if (platformAdmin) redirect("/plateforme");
  // Compte particulier (NeoScool Opportunities) : son espace personnel.
  const { data: publicAccount } = await (await createClient()).from("public_accounts").select("user_id").maybeSingle();
  if (publicAccount && !portalOff) redirect("/espace");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-10">
      <Logo />
      <Card className="grid gap-4 p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldOff className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">{portalOff ? "Portail désactivé" : "Aucun établissement accessible"}</h1>
          <p className="text-sm text-muted-foreground">
            {portalOff
              ? "Ce portail est désactivé pour votre établissement. Vos données sont conservées ; contactez l'administration de l'établissement."
              : "Votre compte n'est rattaché à aucun établissement actif, ou votre accès a été suspendu. Contactez l'administration de votre établissement."}
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
