import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Configuration requise" };
export const dynamic = "force-dynamic";

/** Affichée uniquement tant que les variables Supabase ne sont pas définies. */
export default function ConfigurationPage() {
  if (isSupabaseConfigured()) {
    redirect("/connexion");
  }
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-center gap-6 px-4 py-10">
      <Logo />
      <Card>
        <CardHeader>
          <CardTitle>Configuration de Supabase requise</CardTitle>
          <CardDescription>
            NéoScol a besoin d&apos;un projet Supabase (base PostgreSQL, authentification, stockage) pour fonctionner.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid gap-1.5 rounded-xl border border-primary/30 bg-primary-soft/60 p-4">
            <p className="font-semibold text-foreground">Essayer NéoScol sur votre ordinateur (données de démonstration)</p>
            <p>
              Démarrez Docker Desktop, arrêtez ce serveur (<kbd>Ctrl</kbd>+<kbd>C</kbd>) puis lancez dans le dossier du projet :
            </p>
            <p>
              <code className="rounded bg-surface px-1.5 py-0.5">npm run demo:windows</code> sous Windows, ou{" "}
              <code className="rounded bg-surface px-1.5 py-0.5">npm run demo</code> sous macOS / Linux.
            </p>
            <p className="text-muted-foreground">La base, les comptes de démonstration et ce fichier de configuration sont préparés automatiquement.</p>
            <p className="text-muted-foreground">
              Docker ne fonctionne pas sur cet ordinateur ? Ouvrez le projet dans GitHub Codespaces (Docker inclus) puis lancez{" "}
              <code className="rounded bg-surface px-1.5 py-0.5">npm run demo</code> : voir docs/DEMARRER-EN-LOCAL.md.
            </p>
          </div>
          <p className="font-medium text-foreground">Ou, avec votre propre projet Supabase :</p>
          <ol className="grid list-decimal gap-2 pl-5">
            <li>Créez un projet sur supabase.com (ou lancez <code>supabase start</code> en local).</li>
            <li>
              Appliquez le schéma : <code>supabase db push</code> (migrations du dossier <code>supabase/migrations</code>).
            </li>
            <li>
              Copiez <code>.env.example</code> en <code>.env.local</code> et renseignez l&apos;URL et la clé publique.
            </li>
            <li>Redémarrez le serveur de développement.</li>
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
