import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/features/billing/components/public-shell";
import { LegalText } from "@/features/site/components/legal-text";
import { getSiteSettings } from "@/lib/site-settings";
import { formatDate } from "@/lib/utils/format";

// Rendue à chaque visite : une modification du Super Admin est visible immédiatement.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Politique de confidentialité", description: "Politique de confidentialité de NeoScool." };

/** Texte publié par le Super Admin ; aucun texte juridique n'est inventé en son absence. */
export default async function PrivacyPage() {
  const site = await getSiteSettings();
  const text = site.privacy;
  const updated = site.privacy_updated_at;
  return (
    <PublicShell>
      <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 sm:px-8">
        <header className="grid gap-1">
          <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
          {text && updated ? <p className="text-sm text-muted-foreground">Mise à jour le {formatDate(updated)}</p> : null}
        </header>
        <article className="rounded-2xl border border-border bg-surface p-5 sm:p-7" data-testid="legal-text">
          {text ? (
            <LegalText text={text} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ce document sera publié prochainement. Pour toute question, consultez la page{" "}
              <Link href="/aide" className="font-semibold text-primary hover:underline">
                Aide et contact
              </Link>
              .
            </p>
          )}
        </article>
      </main>
    </PublicShell>
  );
}
