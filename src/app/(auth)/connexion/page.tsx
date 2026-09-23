import { Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { SignInTabs } from "@/features/auth/components/sign-in-tabs";
import { DemoRolePicker } from "@/features/demo/components/demo-role-picker";
import { isDemoMode } from "@/lib/demo";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = typeof params.suite === "string" ? params.suite : undefined;
  const expired = params.erreur === "lien-expire";
  const demo = isDemoMode();

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
      {params.erreur === "demo" ? <Alert tone="danger">Connexion de démonstration impossible : rechargez les données de démonstration.</Alert> : null}
      <SignInTabs next={next} />
      {demo ? (
        <section aria-labelledby="demo-title" className="grid gap-3 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4 dark:border-cyan-900 dark:from-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 id="demo-title" className="flex items-center gap-2 text-sm font-semibold">
              <PlayCircle className="size-4 text-primary" aria-hidden /> Accès rapide — démonstration
            </h2>
            <Link href="/demo" className="text-xs font-semibold text-primary hover:underline">
              Scénarios guidés
            </Link>
          </div>
          <DemoRolePicker variant="compact" next={next} />
        </section>
      ) : null}
      <p className="flex items-start gap-2.5 rounded-xl bg-background p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Les comptes sont créés par votre établissement. Première connexion ? Contactez son secrétariat.
      </p>
    </div>
  );
}
