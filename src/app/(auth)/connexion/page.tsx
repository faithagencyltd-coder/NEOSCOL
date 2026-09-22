import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { SignInTabs } from "@/features/auth/components/sign-in-tabs";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = typeof params.suite === "string" ? params.suite : undefined;
  const expired = params.erreur === "lien-expire";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold">Connexion à votre espace</h1>
        <p className="text-sm text-muted-foreground">Accédez au portail NéoScol de votre établissement.</p>
      </div>
      {expired ? (
        <Alert tone="warning" title="Lien expiré">
          Ce lien n&apos;est plus valide. Demandez un nouveau lien de réinitialisation.
        </Alert>
      ) : null}
      <SignInTabs next={next} />
      <p className="flex items-start gap-2.5 rounded-xl bg-background p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Les comptes sont créés par votre établissement. Première connexion ? Contactez son secrétariat.
      </p>
    </div>
  );
}
