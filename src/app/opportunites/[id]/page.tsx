import { ArrowLeft, BadgeCheck, CalendarDays, Heart, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { SiteShell } from "@/features/marketing/components/site-shell";
import { InlineForm } from "@/features/ecosystem/components/inline-form";
import { ReportButton } from "@/features/ecosystem/components/report-button";
import { APPLICATION_STATUSES, REPORT_REASONS, toOptions } from "@/features/ecosystem/constants";
import type { OpportunityDetail } from "@/features/ecosystem/discover";
import { applyOpportunity, toggleFavorite } from "@/features/ecosystem/public-actions";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  if (!isUuid(id)) return null;
  const { data } = await (await createClient()).rpc("opportunity_detail", { p_id: id });
  return (data ?? null) as unknown as OpportunityDetail | null;
});

export async function generateMetadata({ params }: PageProps<"/opportunites/[id]">): Promise<Metadata> {
  const o = await load((await params).id);
  if (!o) return { title: "Annonce introuvable — NeoScool Opportunities", robots: { index: false } };
  return { title: `${o.title} — ${o.city ?? o.country} | NeoScool Opportunities`, description: o.description.slice(0, 160), alternates: { canonical: `/opportunites/${o.id}` } };
}

const fr = (d: string) => new Date(d).toLocaleDateString("fr-FR");

/** Annonce publique : réponse avec CV facultatif (compte requis), favori, signalement. */
export default async function OpportunityPage({ params }: PageProps<"/opportunites/[id]">) {
  const { id } = await params;
  const o = await load(id);
  if (!o) notFound();
  const supabase = await createClient();
  const [{ data: user }, base] = await Promise.all([supabase.auth.getUser(), publicBaseUrl()]);
  const signedIn = Boolean(user.user);
  const path = `/opportunites/${o.id}`;
  const isJob = o.kind === "job";
  const jsonLd = isJob
    ? {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: o.title,
        description: o.description,
        datePosted: o.published_at,
        validThrough: o.expires_at,
        employmentType: o.contract ?? undefined,
        hiringOrganization: { "@type": "Organization", name: o.author.name, sameAs: o.author.profile_slug ? `${base}/decouvrir/${o.author.profile_slug}` : undefined },
        jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: o.city ?? undefined, addressCountry: o.country } },
      }
    : null;

  return (
    <SiteShell locale="fr" alternate={path}>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_360px]">
        <article className="grid content-start gap-4">
          <Link href="/opportunites" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Toutes les annonces
          </Link>
          <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{o.category_label}</span>
          <h1 className="text-3xl font-bold" data-testid="opportunity-title">
            {o.title}
          </h1>
          <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              {o.author.kind === "organization" && o.author.profile_slug ? (
                <Link href={`/decouvrir/${o.author.profile_slug}`} className="hover:underline">
                  {o.author.name}
                </Link>
              ) : (
                o.author.name
              )}
              {o.author.verified ? <BadgeCheck className="size-4 text-primary" aria-label="Établissement vérifié" /> : null}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-4" aria-hidden /> {[o.location, o.city, o.country].filter(Boolean).join(", ")}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-4" aria-hidden /> Publiée le {fr(o.published_at)} · jusqu&apos;au {fr(o.expires_at)}
            </span>
          </p>
          <dl className="grid gap-2 rounded-xl border border-border bg-white p-4 text-sm sm:grid-cols-2">
            {(
              [
                ["Matière / domaine", o.subject],
                ["Niveau", o.level],
                ["Rémunération / tarif", o.compensation],
                ["Contrat", o.contract],
                ["Horaires", o.schedule],
                ["Début", o.starts_on ? fr(o.starts_on) : null],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
          </dl>
          <p className="whitespace-pre-line">{o.description}</p>
          <ReportButton targetType="opportunity" targetId={o.id} reasons={toOptions(REPORT_REASONS)} signedIn={signedIn} path={path} />
        </article>

        <aside className="grid content-start gap-4">
          <div className="grid gap-3 rounded-2xl border border-border bg-white p-4" data-testid="apply-box">
            {o.mine ? (
              <>
                <p className="font-semibold">C&apos;est votre annonce.</p>
                <Link href={`/espace/annonces/${o.id}`} className="text-sm font-semibold text-primary hover:underline">
                  Voir les réponses reçues →
                </Link>
              </>
            ) : o.my_application ? (
              <>
                <p className="font-semibold">Vous avez déjà répondu.</p>
                <StatusBadge value={o.my_application.status} map={APPLICATION_STATUSES} />
                <Link href="/espace" className="text-sm font-semibold text-primary hover:underline">
                  Suivre dans Mon espace →
                </Link>
              </>
            ) : signedIn ? (
              <>
                <h2 className="font-semibold">{isJob ? "Postuler" : "Répondre à l'annonce"}</h2>
                <InlineForm action={applyOpportunity} hidden={{ opportunity_id: o.id }} submit="Envoyer" testId="apply-form">
                  <label className="grid gap-1 text-sm">
                    Message
                    <Textarea name="message" rows={5} maxLength={3000} required />
                  </label>
                  <label className="grid gap-1 text-sm">
                    CV ou document (PDF, JPEG, PNG — 5 Mo, facultatif)
                    <input type="file" name="cv" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
                  </label>
                  <p className="text-xs text-muted-foreground">Votre réponse et votre document sont visibles uniquement par l&apos;auteur de l&apos;annonce.</p>
                </InlineForm>
              </>
            ) : (
              <>
                <h2 className="font-semibold">{isJob ? "Postuler" : "Répondre à l'annonce"}</h2>
                <p className="text-sm text-muted-foreground">Un compte gratuit est nécessaire pour répondre et suivre vos candidatures.</p>
                <Link href={`/espace/inscription?suite=${encodeURIComponent(path)}`} className="rounded-xl bg-primary px-3 py-2 text-center text-sm font-semibold text-white">
                  Créer un compte
                </Link>
                <Link href={`/connexion?suite=${encodeURIComponent(path)}`} className="text-center text-sm text-primary hover:underline">
                  J&apos;ai déjà un compte
                </Link>
              </>
            )}
          </div>
          {signedIn && !o.mine ? (
            <InlineForm action={toggleFavorite} hidden={{ opportunity_id: o.id }} className="flex">
              <button type="submit" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="favorite-button">
                <Heart className={o.favorite ? "size-4 fill-rose-500 text-rose-500" : "size-4"} aria-hidden /> {o.favorite ? "Dans vos favoris" : "Ajouter aux favoris"}
              </button>
            </InlineForm>
          ) : null}
          <p className="text-xs text-muted-foreground">Conseil : ne versez jamais d&apos;argent pour obtenir un emploi ou un entretien. Signalez toute demande suspecte.</p>
        </aside>
      </div>
    </SiteShell>
  );
}
