import type { Metadata } from "next";
import Link from "next/link";

import { SiteShell } from "@/features/marketing/components/site-shell";
import { OpportunityForm } from "@/features/ecosystem/components/opportunity-form";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publier une annonce — NeoScool Opportunities", robots: { index: false } };

/** Annonce d'un particulier (répétiteur, cours, services). Les établissements publient depuis « Visibilité ». */
export default async function PublishOpportunityPage() {
  const context = await getSessionContext();
  const supabase = await createClient();
  const [{ data: categories }, { data: countries }] = await Promise.all([
    supabase.from("opportunity_categories").select("key, label, poster").eq("active", true).order("sort_order"),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  return (
    <SiteShell locale="fr" alternate="/opportunites/publier">
      <section className="mx-auto grid max-w-3xl gap-6 px-4 py-10 sm:px-8">
        <div className="grid gap-1">
          <h1 className="text-3xl font-bold">Publier une annonce</h1>
          <p className="text-muted-foreground">Répétiteur, cours à domicile, services éducatifs. Un établissement publie ses offres d&apos;emploi depuis son espace « Visibilité ».</p>
        </div>
        {context ? (
          <div className="rounded-2xl border border-border bg-white p-5">
            <OpportunityForm
              categories={(categories ?? []).filter((c) => c.poster !== "organization")}
              countries={countries ?? []}
              doneHref="/espace/annonces/{id}"
            />
          </div>
        ) : (
          <div className="grid gap-3 rounded-2xl border border-border bg-white p-6 text-center" data-testid="publish-login">
            <p className="font-semibold">Un compte gratuit est nécessaire pour publier et recevoir les réponses.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/espace/inscription?suite=/opportunites/publier" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
                Créer un compte
              </Link>
              <Link href="/connexion?suite=/opportunites/publier" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                Se connecter
              </Link>
            </div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
