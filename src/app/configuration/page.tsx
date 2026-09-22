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
