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
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">Accédez à l&apos;espace de votre établissement.</p>
      </div>
      {expired ? (
        <Alert tone="warning" title="Lien expiré">
          Ce lien n&apos;est plus valide. Demandez un nouveau lien de réinitialisation.
        </Alert>
      ) : null}
      <SignInTabs next={next} />
      <p className="text-center text-xs text-muted-foreground">
        Les comptes sont créés par votre établissement. Si vous n&apos;en avez pas, contactez son secrétariat.
      </p>
    </div>
  );
}
