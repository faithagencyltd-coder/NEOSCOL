import { ArrowLeft, CalendarDays, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SiteShell } from "@/features/marketing/components/site-shell";
import { LeadForm } from "@/features/ecosystem/components/lead-form";
import { ReportButton } from "@/features/ecosystem/components/report-button";
import { CAMPAIGN_OBJECTIVES, REPORT_REASONS, toOptions } from "@/features/ecosystem/constants";
import { mediaUrl, sourceOf, type DiscoverProfile } from "@/features/ecosystem/discover";
import { turnstileSettings } from "@/lib/messaging/server";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";

const load = cache(async (slug: string, id: string) => {
  const { data } = await (await createClient()).rpc("discover_profile", { p_slug: slug });
  const profile = (data ?? null) as unknown as DiscoverProfile | null;
  const campaign = profile?.campaigns.find((c) => c.id === id);
  return profile && campaign ? { profile, campaign } : null;
});

export async function generateMetadata({ params }: PageProps<"/decouvrir/[slug]/campagnes/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if (!found) return { title: "Annonce introuvable — NeoScool Discover", robots: { index: false } };
  return {
    title: `${found.campaign.title} — ${found.profile.name} | NeoScool Discover`,
    description: (found.campaign.description ?? "").slice(0, 160),
    alternates: { canonical: `/decouvrir/${slug}/campagnes/${id}` },
    openGraph: { title: found.campaign.title, images: found.campaign.media[0] ? [mediaUrl(found.campaign.media[0])] : undefined },
  };
}

/** Page d'une campagne publiée (lien partagé, QR code) : la demande d'informations garde l'origine « campagne ». */
export default async function CampaignPage({ params, searchParams }: PageProps<"/decouvrir/[slug]/campagnes/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const found = await load(slug, id);
  if (!found) notFound();
  const { profile: p, campaign: c } = found;
  const [captcha, { data: user }] = await Promise.all([turnstileSettings(), (await createClient()).auth.getUser()]);
  const path = `/decouvrir/${p.slug}/campagnes/${c.id}`;

  return (
    <SiteShell locale="fr" alternate={path}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_380px]">
        <article className="grid content-start gap-4">
          <Link href={`/decouvrir/${p.slug}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> {p.name}
          </Link>
          <span className="text-xs font-semibold uppercase text-primary">{CAMPAIGN_OBJECTIVES[c.objective] ?? c.objective}</span>
          <h1 className="text-3xl font-bold" data-testid="campaign-title">
            {c.title}
          </h1>
          {c.starts_on || c.ends_on ? (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {c.starts_on ? `Du ${new Date(c.starts_on).toLocaleDateString("fr-FR")} ` : ""}
              {c.ends_on ? `jusqu'au ${new Date(c.ends_on).toLocaleDateString("fr-FR")}` : ""}
            </p>
          ) : null}
          {c.media.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {c.media.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element -- visuel publié par l'établissement
                <img key={m} src={mediaUrl(m)} alt="" className="w-full rounded-xl object-cover" />
              ))}
            </div>
          ) : null}
          {c.target ? <p className="text-sm font-medium">Public : {c.target}</p> : null}
          {c.description ? <p className="whitespace-pre-line text-muted-foreground">{c.description}</p> : null}
          {c.destination_url ? (
            <a href={c.destination_url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 font-semibold text-primary hover:underline">
              En savoir plus <ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
          <ReportButton targetType="campaign" targetId={c.id} reasons={toOptions(REPORT_REASONS)} signedIn={Boolean(user.user)} path={path} />
        </article>
        {p.leads_open ? (
          <aside className="grid content-start gap-3 rounded-2xl border border-border bg-white p-4">
            <h2 className="font-semibold">Je suis intéressé(e)</h2>
            <LeadForm slug={p.slug} programs={p.programs.map((x) => x.name)} source={sourceOf(param(sp, "source"), "campaign")} campaignId={c.id} captchaKey={captcha?.siteKey ?? null} />
          </aside>
        ) : null}
      </div>
    </SiteShell>
  );
}
