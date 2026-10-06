import { BadgeCheck, CalendarDays, ExternalLink, Globe, Mail, MapPin, Megaphone, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SiteShell } from "@/features/marketing/components/site-shell";
import { LeadForm } from "@/features/ecosystem/components/lead-form";
import { ReportButton } from "@/features/ecosystem/components/report-button";
import { CAMPAIGN_OBJECTIVES, REPORT_REASONS, toOptions } from "@/features/ecosystem/constants";
import { logoUrl, mediaUrl, sourceOf, type DiscoverProfile } from "@/features/ecosystem/discover";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { turnstileSettings } from "@/lib/messaging/server";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";

const loadProfile = cache(async (slug: string) => {
  const { data } = await (await createClient()).rpc("discover_profile", { p_slug: slug });
  return (data ?? null) as unknown as DiscoverProfile | null;
});

const SOCIAL_LABELS: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", whatsapp: "WhatsApp", linkedin: "LinkedIn", youtube: "YouTube" };

export async function generateMetadata({ params, searchParams }: PageProps<"/decouvrir/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const en = param(await searchParams, "lang") === "en";
  const p = await loadProfile(slug);
  if (!p) return { title: "Établissement introuvable — NeoScool Discover", robots: { index: false } };
  const tagline = (en && p.translations.en?.tagline) || p.tagline;
  return {
    title: `${p.name} — ${[p.city, ORG_TYPE_LABELS[p.type] ?? p.type].filter(Boolean).join(" · ")} | NeoScool Discover`,
    description: (tagline || p.description || "").slice(0, 160) || `${p.name} sur NeoScool Discover.`,
    alternates: { canonical: `/decouvrir/${p.slug}`, languages: { fr: `/decouvrir/${p.slug}`, en: `/decouvrir/${p.slug}?lang=en` } },
    openGraph: { title: p.name, description: tagline ?? undefined, images: p.cover_file_id ? [mediaUrl(p.cover_file_id)] : undefined },
  };
}

/** Fiche publique d'un établissement : informations fournies par lui, demande d'informations, campagnes en cours. */
export default async function PublicProfilePage({ params, searchParams }: PageProps<"/decouvrir/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await loadProfile(slug);
  if (!p) notFound();
  const en = param(sp, "lang") === "en";
  const t = (key: "tagline" | "description" | "admission") => (en && p.translations.en?.[key]) || p[key];
  const supabase = await createClient();
  const [captcha, base, { data: user }] = await Promise.all([turnstileSettings(), publicBaseUrl(), supabase.auth.getUser()]);
  const path = `/decouvrir/${p.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": p.type === "university" ? "CollegeOrUniversity" : "EducationalOrganization",
    name: p.name,
    url: `${base}${path}`,
    description: t("tagline") ?? undefined,
    address: p.address || p.city ? { "@type": "PostalAddress", streetAddress: p.address ?? undefined, addressLocality: p.city ?? undefined, addressCountry: p.country } : undefined,
    telephone: p.phone ?? undefined,
    email: p.email ?? undefined,
    sameAs: [p.website, ...Object.values(p.socials ?? {}).filter((v) => v.startsWith("http"))].filter(Boolean),
    logo: p.has_logo ? `${base}${logoUrl(p.code)}` : undefined,
    image: p.cover_file_id ? `${base}${mediaUrl(p.cover_file_id)}` : undefined,
  };

  return (
    <SiteShell locale={en ? "en" : "fr"} alternate={en ? path : `${path}?lang=en`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="relative">
        <div className="h-48 bg-gradient-to-br from-[#0b2559] via-[#0e3a82] to-[#0e4a9a] sm:h-64">
          {p.cover_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- image publiée par l'établissement
            <img src={mediaUrl(p.cover_file_id)} alt="" className="size-full object-cover opacity-90" />
          ) : null}
        </div>
        <div className="mx-auto -mt-12 flex max-w-6xl flex-wrap items-end gap-4 px-4 sm:px-8">
          {p.has_logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de l'établissement
            <img src={logoUrl(p.code)} alt={`Logo ${p.name}`} className="size-24 rounded-2xl border-4 border-white bg-white object-contain shadow" />
          ) : null}
          <div className="grid gap-1 pb-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold sm:text-3xl" data-testid="profile-name">
              {p.name}
              {p.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" data-testid="verified-badge">
                  <BadgeCheck className="size-4" aria-hidden /> {en ? "Verified profile" : "Profil vérifié"}
                </span>
              ) : null}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{ORG_TYPE_LABELS[p.type] ?? p.type}</span>
              {p.city ? (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {p.city}
                </span>
              ) : null}
            </p>
          </div>
          <div className="ml-auto flex gap-2 pb-1 text-sm">
            <Link href={path} className={en ? "text-muted-foreground" : "font-semibold"}>
              FR
            </Link>
            <span aria-hidden>·</span>
            <Link href={`${path}?lang=en`} className={en ? "font-semibold" : "text-muted-foreground"}>
              EN
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-8">
          {t("tagline") ? <p className="text-lg font-medium">{t("tagline")}</p> : null}
          {t("description") ? <p className="whitespace-pre-line text-muted-foreground">{t("description")}</p> : null}

          {p.programs.length ? (
            <section className="grid gap-3">
              <h2 className="text-xl font-semibold">{en ? "Programmes" : "Formations et filières"}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {p.programs.map((prog) => (
                  <li key={prog.name} className="rounded-xl border border-border bg-white p-3">
                    <p className="font-medium">{prog.name}</p>
                    {prog.description ? <p className="text-sm text-muted-foreground">{prog.description}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {t("admission") || p.enrollment_period || p.start_date ? (
            <section className="grid gap-2">
              <h2 className="text-xl font-semibold">{en ? "Admission" : "Admission et inscriptions"}</h2>
              {t("admission") ? <p className="whitespace-pre-line text-muted-foreground">{t("admission")}</p> : null}
              <div className="flex flex-wrap gap-4 text-sm">
                {p.enrollment_period ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-4" aria-hidden /> {en ? "Enrolment" : "Inscriptions"} : {p.enrollment_period}
                  </span>
                ) : null}
                {p.start_date ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-4" aria-hidden /> {en ? "Start" : "Rentrée"} : {p.start_date}
                  </span>
                ) : null}
              </div>
              {p.enrollment_url ? (
                <a href={p.enrollment_url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  {en ? "Online application" : "Pré-inscription en ligne"} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </section>
          ) : null}

          {p.extra ? <p className="whitespace-pre-line text-sm text-muted-foreground">{p.extra}</p> : null}

          {p.gallery.length ? (
            <section className="grid gap-3">
              <h2 className="text-xl font-semibold">{en ? "Photos" : "En images"}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {p.gallery.map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element -- galerie publiée par l'établissement
                  <img key={id} src={mediaUrl(id)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                ))}
              </div>
            </section>
          ) : null}

          {p.campaigns.length ? (
            <section className="grid gap-3" data-testid="profile-campaigns">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Megaphone className="size-5" aria-hidden /> {en ? "Current announcements" : "Annonces en cours"}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`${path}/campagnes/${c.id}`} className="grid h-full overflow-hidden rounded-xl border border-border bg-white hover:shadow">
                      {c.media[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- visuel de campagne
                        <img src={mediaUrl(c.media[0])} alt="" className="h-32 w-full object-cover" />
                      ) : null}
                      <div className="grid gap-1 p-3">
                        <span className="text-xs font-semibold uppercase text-primary">{CAMPAIGN_OBJECTIVES[c.objective] ?? c.objective}</span>
                        <span className="font-medium">{c.title}</span>
                        {c.ends_on ? <span className="text-xs text-muted-foreground">Jusqu&apos;au {new Date(c.ends_on).toLocaleDateString("fr-FR")}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="grid content-start gap-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-white p-4 text-sm">
            <h2 className="font-semibold">{en ? "Contact" : "Coordonnées"}</h2>
            {p.address ? (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {p.address}
              </p>
            ) : null}
            {p.phone ? (
              <a href={`tel:${p.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="size-4" aria-hidden /> {p.phone}
              </a>
            ) : null}
            {p.email ? (
              <a href={`mailto:${p.email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="size-4" aria-hidden /> {p.email}
              </a>
            ) : null}
            {p.website ? (
              <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                <Globe className="size-4" aria-hidden /> {p.website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            {Object.entries(p.socials ?? {}).length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(p.socials).map(([k, v]) => (
                  <a key={k} href={v.startsWith("http") ? v : `https://wa.me/${v.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">
                    {SOCIAL_LABELS[k] ?? k}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {p.leads_open ? (
            <div className="grid gap-3 rounded-2xl border border-border bg-white p-4" id="demande">
              <h2 className="font-semibold">{en ? "Request information" : "Demander des informations"}</h2>
              <LeadForm slug={p.slug} programs={p.programs.map((x) => x.name)} source={sourceOf(param(sp, "source"), "profile")} captchaKey={captcha?.siteKey ?? null} />
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {en ? "Information provided by the institution. Last update" : "Informations fournies par l'établissement. Mise à jour"} : {new Date(p.updated_at).toLocaleDateString("fr-FR")}.{" "}
            {p.verified ? (en ? "Documents checked by NeoScool." : "Documents contrôlés par NeoScool.") : en ? "Profile not verified by NeoScool." : "Profil non vérifié par NeoScool."}
          </p>
          <ReportButton targetType="profile" targetId={p.id} reasons={toOptions(REPORT_REASONS)} signedIn={Boolean(user.user)} path={path} />
        </aside>
      </div>
    </SiteShell>
  );
}

