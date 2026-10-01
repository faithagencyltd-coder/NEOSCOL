import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CloudOff,
  FileCheck2,
  FileSpreadsheet,
  GraduationCap,
  History,
  IdCard,
  Lock,
  School,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { ILLUSTRATIONS, type IllustrationName } from "@/components/illustrations/scenes";
import { PLAN_ACCENTS } from "@/features/billing/constants";
import { listPlans } from "@/features/billing/queries";
import { DICTS, route, type Locale } from "@/features/marketing/content";
import { getSiteContent, sectionOn, type SiteContent, type SiteCountry } from "@/features/marketing/data";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";

import { ActorTabs, BadgeScene, ConnectedHub, CountryShowcase, DataJourney, OfflineScene, SchoolFlow, Screen, VideoGallery, type CountryCard } from "./interactive";
import { Reveal } from "./reveal";
import { SitePhoto } from "./site-photo";

/** Illustration NEOSCOOL de chaque fonctionnalité (une scène par fonction, aucune répétée). */
const FEATURE_ILLUSTRATIONS: Record<string, IllustrationName> = {
  badge: "attendance",
  ai: "assistant",
  notifications: "communication",
  automation: "automation",
  offline: "offline",
  documents: "documents",
  stats: "stats",
  audit: "audit",
  security: "security",
};

const FEATURE_ICONS: Record<string, typeof IdCard> = {
  badge: IdCard,
  ai: Bot,
  notifications: Bell,
  automation: Workflow,
  offline: CloudOff,
  documents: FileCheck2,
  stats: BarChart3,
  audit: History,
  security: ShieldCheck,
};

export function SectionTitle({ eyebrow, title, subtitle, dark = false, center = true, h1 = false }: { eyebrow: string; title: string; subtitle?: string; dark?: boolean; center?: boolean; h1?: boolean }) {
  const Heading = h1 ? "h1" : "h2";
  return (
    <Reveal className={cn("grid max-w-3xl gap-3", center && "mx-auto text-center")}>
      <span className={cn("text-xs font-semibold uppercase tracking-[0.2em]", dark ? "text-sky-300" : "text-[#1d63ed]")}>{eyebrow}</span>
      <Heading className={cn("font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl", dark ? "text-white" : "text-[#0b2559]")}>{title}</Heading>
      {subtitle ? <p className={cn("text-lg", dark ? "text-sky-100/75" : "text-[#0b2559]/65")}>{subtitle}</p> : null}
    </Reveal>
  );
}

/** Carte d'un pays : seules les informations réellement configurées sont affichées. */
export function countryCard(c: SiteCountry, locale: Locale): CountryCard {
  const t = DICTS[locale].countries;
  const rows = [
    { label: t.currency, value: c.currency },
    { label: t.languages, value: c.languages.map((l) => t.languageNames[l] ?? l).join(", ") },
    { label: t.timezone, value: c.timezone },
    c.grading_scale ? { label: t.grading, value: `/${c.grading_scale}` } : null,
    c.school_periods ? { label: t.periods, value: t.periodLabels[c.school_periods] ?? c.school_periods } : null,
    (locale === "en" ? (c.academic_structure_en ?? c.academic_structure) : c.academic_structure) ? { label: t.structure, value: (locale === "en" ? (c.academic_structure_en ?? c.academic_structure) : c.academic_structure)! } : null,
  ].filter((r): r is { label: string; value: string } => Boolean(r?.value));
  return {
    code: c.code,
    name: locale === "en" ? (c.name_en ?? c.name) : c.name,
    availability: t.availability[c.availability],
    rows,
    context: locale === "en" ? (c.education_context_en ?? c.education_context) : c.education_context,
    systems: c.institutional_systems,
    marketing: locale === "en" ? (c.marketing_text_en ?? c.marketing_text) : c.marketing_text,
  };
}

/** Formules et prix lus en base (jamais codés en dur). */
export async function PricingCards({ locale, limit }: { locale: Locale; limit?: number }) {
  const t = DICTS[locale].pricing;
  const plans = (await listPlans()).filter((p) => p.is_active).slice(0, limit);
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pricing-cards">
      {plans.map((p, i) => (
        <Reveal as="li" key={p.id} delay={i * 60} className="flex flex-col gap-4 rounded-3xl border border-[#0b2559]/10 bg-white p-6 shadow-[0_24px_48px_-32px_rgba(11,37,89,0.45)]">
          <span className={cn("h-1.5 w-14 rounded-full bg-gradient-to-r", PLAN_ACCENTS[p.code] ?? "from-[#0b2559] to-[#1d63ed]")} />
          <div>
            <h3 className="font-display text-xl font-semibold text-[#0b2559]">{locale === "en" ? (p.name_en ?? p.name) : p.name}</h3>
            {locale === "fr" && p.audience ? <p className="text-sm text-[#0b2559]/60">{p.audience}</p> : null}
          </div>
          <p className="font-display text-3xl font-semibold text-[#0b2559]">
            {formatMoney(p.monthly_price, p.currency)} <span className="text-sm font-medium text-[#0b2559]/55">{t.perMonth}</span>
          </p>
          <p className="text-sm text-[#0b2559]/65">
            {formatMoney(p.annual_price, p.currency)} {t.perYear}
          </p>
          {(locale === "en" ? p.highlights_en : p.highlights).length ? (
            <ul className="grid gap-1.5 text-sm text-[#0b2559]/75">
              {(locale === "en" ? p.highlights_en : p.highlights).map((h) => (
                <li key={h} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#1d63ed]" /> {h}
                </li>
              ))}
            </ul>
          ) : null}
          {p.trial_days > 0 ? <p className="mt-auto text-sm font-semibold text-emerald-700">{t.trial(p.trial_days)}</p> : null}
        </Reveal>
      ))}
    </ul>
  );
}

/** Accueil du site officiel. */
export async function HomePage({ locale }: { locale: Locale }) {
  const t = DICTS[locale];
  const content: SiteContent = await getSiteContent();
  const slogan = locale === "en" ? content.settings.slogan_en : content.settings.slogan;
  const videos = content.videos.map((v) => ({ ...v, title: locale === "en" ? (v.title_en ?? v.title) : v.title, topic: t.video.topics[v.topic as keyof typeof t.video.topics] ?? v.topic }));

  return (
    <>
      {/* HERO */}
      <section className="site-grid-bg relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -left-32 top-10 size-[36rem] rounded-full bg-sky-300/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-40 top-40 size-[34rem] rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div className="grid gap-6">
            <span className="anim-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-[#1d63ed]/20 bg-white/80 px-3 py-1 text-xs font-semibold text-[#1d63ed]">
              <Sparkles className="size-3.5" aria-hidden /> {slogan ?? t.hero.eyebrow}
            </span>
            <h1 className="anim-fade-up font-display text-5xl font-semibold leading-[1.02] tracking-tight text-[#0b2559] [--delay:80ms] sm:text-6xl lg:text-7xl">
              {t.hero.title1}
              <span className="block bg-gradient-to-r from-[#1d63ed] to-[#0ea5e9] bg-clip-text text-transparent">{t.hero.title2}</span>
            </h1>
            <p className="anim-fade-up max-w-xl text-lg text-[#0b2559]/70 [--delay:160ms] sm:text-xl">{t.hero.subtitle}</p>
            <div className="anim-fade-up flex flex-wrap gap-3 [--delay:240ms]">
              <Link href="#decouvrir" className="inline-flex items-center gap-2 rounded-2xl bg-[#0b2559] px-5 py-3.5 font-semibold text-white shadow-lg shadow-[#0b2559]/25 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
                {t.hero.discover} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="#logiciel" className="inline-flex items-center gap-2 rounded-2xl border border-[#0b2559]/15 bg-white px-5 py-3.5 font-semibold text-[#0b2559] transition-[colors,transform] hover:border-[#1d63ed]/40 active:scale-[0.98]">
                {t.hero.software}
              </Link>
              <Link href={`${route("contact", locale)}?demande=demo`} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 font-semibold text-[#1d63ed] hover:bg-[#1d63ed]/5">
                {t.hero.demo}
              </Link>
            </div>
          </div>
          <div className="relative" id="logiciel">
            {/* Photo réelle : l'humain d'abord, le logiciel en surimpression. */}
            <div className="anim-fade-up relative [--delay:120ms]">
              <div aria-hidden className="absolute -inset-3 rotate-2 rounded-[2.5rem] bg-gradient-to-br from-[#1d63ed]/20 via-sky-300/20 to-transparent" />
              <SitePhoto
                name="eleves-campus"
                locale={locale}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                position="35% 30%"
                className="photo-zoom relative aspect-[4/3] rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(11,37,89,0.55)] ring-1 ring-[#0b2559]/10 lg:aspect-[5/4]"
              />
              <div className="site-float absolute -bottom-10 -left-4 w-[62%] sm:-left-10 sm:w-[58%]">
                <Screen name="s-dashboard" alt={locale === "fr" ? "Tableau de bord de la direction dans NeoScool" : "Management dashboard in NeoScool"} />
              </div>
              <div className="absolute -right-3 top-6 hidden items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 shadow-xl ring-1 ring-[#0b2559]/10 backdrop-blur sm:flex [animation:site-float_6s_ease-in-out_infinite_-2s]">
                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <ShieldCheck className="size-4" aria-hidden />
                </span>
                <span className="grid text-xs leading-tight">
                  <strong className="text-[#0b2559]">{locale === "fr" ? "Arrivée enregistrée" : "Arrival recorded"}</strong>
                  <span className="text-[#0b2559]/60">{locale === "fr" ? "Parents prévenus" : "Parents notified"}</span>
                </span>
              </div>
            </div>
            <p className="mt-14 text-right text-xs text-[#0b2559]/50">{t.hero.captionDemo}</p>
          </div>
        </div>
      </section>

      {/* ACTEURS CONNECTÉS */}
      {sectionOn(content, "connected") ? (
        <section id="decouvrir" className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-8 lg:grid-cols-2">
            <SectionTitle eyebrow={t.connected.eyebrow} title={t.connected.title} center={false} />
            <Reveal delay={120}>
              <ConnectedHub core={t.connected.core} actors={t.connected.actors} />
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* VIDÉO */}
      {sectionOn(content, "video") ? (
        <section className="py-20" id="video">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.video.eyebrow} title={t.video.title} subtitle={t.video.subtitle} />
            {videos.length ? (
              <VideoGallery videos={videos} labels={{ play: t.video.play, close: t.nav.close }} />
            ) : (
              <Reveal className="relative overflow-hidden rounded-3xl bg-[#07142b] p-8 text-center text-white sm:p-14" data-testid="video-soon">
                <div aria-hidden className="absolute inset-0 opacity-25">
                  <Screen name="s-bulletins-apercu" alt="" className="scale-110 blur-[2px]" />
                </div>
                <div className="relative grid justify-items-center gap-3">
                  <p className="font-display text-2xl font-semibold">{t.video.soon}</p>
                  <p className="max-w-lg text-sky-100/80">{t.video.soonHint}</p>
                  <Link href={`${route("contact", locale)}?demande=demo`} className="mt-2 rounded-2xl bg-white px-5 py-3 font-semibold text-[#0b2559]">
                    {t.hero.demo}
                  </Link>
                </div>
              </Reveal>
            )}
          </div>
        </section>
      ) : null}

      {/* SECTEURS */}
      <section id="secteurs" className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8">
          <SectionTitle eyebrow={t.sectors.eyebrow} title={t.sectors.title} subtitle={t.sectors.subtitle} />
          <div className="grid gap-5 lg:grid-cols-3">
            {(
              [
                { key: "school", icon: School, accent: "from-blue-600 to-sky-500", capture: "s-emploi-du-temps" },
                { key: "university", icon: GraduationCap, accent: "from-indigo-600 to-blue-500", capture: "u-structure" },
                { key: "training", icon: Wrench, accent: "from-emerald-500 to-teal-400", capture: "f-aujourdhui" },
              ] as const
            ).map((s, i) => (
              <Reveal key={s.key} delay={i * 100} as="article" className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#0b2559]/10 bg-[#f6f8fc] transition-shadow hover:shadow-[0_30px_60px_-30px_rgba(11,37,89,0.45)]">
                <div className="relative h-44 overflow-hidden">
                  <div className="absolute inset-x-6 top-6 transition-transform duration-700 group-hover:-translate-y-2 group-hover:scale-[1.02]">
                    <Screen name={s.capture} alt="" />
                  </div>
                  <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#f6f8fc]" />
                </div>
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <span className={cn("flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", s.accent)}>
                    <s.icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold text-[#0b2559]">{t.sectors[s.key].title}</h3>
                    <p className="text-sm text-[#0b2559]/60">{t.sectors[s.key].tagline}</p>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {t.sectors[s.key].items.map((item) => (
                      <li key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#0b2559]/75 ring-1 ring-[#0b2559]/10">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={route(s.key, locale)} className="mt-auto inline-flex items-center gap-1.5 font-semibold text-[#1d63ed]">
                    {t.sectors.more} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* MODULE SCOLAIRE */}
      {sectionOn(content, "flow") ? (
        <section className="py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.flow.eyebrow} title={t.flow.title} subtitle={t.flow.subtitle} />
            <Reveal>
              <SchoolFlow steps={t.flow.steps} details={t.flow.details} />
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* ACTEURS */}
      {sectionOn(content, "actors") ? (
        <section className="bg-gradient-to-b from-white to-[#eef3fb] py-20">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8">
            <SectionTitle eyebrow={t.actors.eyebrow} title={t.actors.title} />
            <ActorTabs actors={t.actors.list} />
          </div>
        </section>
      ) : null}

      {/* SAISIE UNIQUE */}
      {sectionOn(content, "journey") ? (
        <section className="py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.journey.eyebrow} title={t.journey.title} />
            <Reveal>
              <DataJourney source={t.journey.source} stops={t.journey.stops} />
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* FONCTIONNALITÉS */}
      <section id="fonctionnalites" className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-8">
          <SectionTitle eyebrow={t.features.eyebrow} title={t.features.title} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.list.map((f, i) => {
              const Icon = FEATURE_ICONS[f.key] ?? Sparkles;
              const Illustration = FEATURE_ILLUSTRATIONS[f.key] ? ILLUSTRATIONS[FEATURE_ILLUSTRATIONS[f.key]!] : null;
              return (
                <Reveal as="li" key={f.key} delay={(i % 3) * 80} className="group flex flex-col overflow-hidden rounded-3xl border border-[#0b2559]/10 bg-[#f6f8fc] transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_48px_-30px_rgba(11,37,89,0.5)]">
                  <div className="relative bg-gradient-to-b from-white to-[#f6f8fc] px-6 pt-4 transition-colors group-hover:from-[#eef3fb] group-hover:to-white">
                    {Illustration ? <Illustration className="mx-auto max-h-44 transition-transform duration-500 group-hover:scale-[1.04]" /> : null}
                  </div>
                  <div className="grid gap-1 p-6 pt-2">
                    <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-[#0b2559]">
                      <Icon className="size-5 text-[#1d63ed]" aria-hidden /> {f.title}
                    </h3>
                    <p className="text-sm text-[#0b2559]/65">{f.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* SMART BADGE */}
      {sectionOn(content, "badge") ? (
        <section className="bg-[#07142b] py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.badge.eyebrow} title={t.badge.title} subtitle={t.badge.note} dark />
            <BadgeScene steps={t.badge.steps} />
          </div>
        </section>
      ) : null}

      {/* HORS LIGNE */}
      {sectionOn(content, "offline") ? (
        <section className="py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.offline.eyebrow} title={t.offline.title} subtitle={t.offline.note} />
            <OfflineScene steps={t.offline.steps} />
          </div>
        </section>
      ) : null}

      {/* SÉCURITÉ */}
      {sectionOn(content, "security") ? (
        <section className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-8">
              <SectionTitle eyebrow={t.security.eyebrow} title={t.security.title} center={false} />
              <ul className="grid gap-4 sm:grid-cols-2">
                {t.security.list.map((s, i) => (
                  <Reveal as="li" key={s.title} delay={i * 70} className="rounded-2xl border border-[#0b2559]/10 p-5">
                    <Lock className="size-5 text-[#1d63ed]" aria-hidden />
                    <h3 className="mt-3 font-semibold text-[#0b2559]">{s.title}</h3>
                    <p className="mt-1 text-sm text-[#0b2559]/65">{s.text}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal delay={120}>
              <Screen name="s-audit" alt={locale === "fr" ? "Journal d'audit de NeoScool" : "NeoScool audit log"} />
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* IMPORT / EXPORT */}
      {sectionOn(content, "data") ? (
        <section className="py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.data.eyebrow} title={t.data.title} subtitle={t.data.exportNote} />
            <div className="grid gap-6 md:grid-cols-2">
              <Reveal className="rounded-3xl border border-[#0b2559]/10 bg-white p-6">
                <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-[#0b2559]">
                  <FileSpreadsheet className="size-5 text-emerald-600" aria-hidden /> {t.data.importTitle}
                </h3>
                <ol className="mt-5 grid gap-2">
                  {t.data.importSteps.map((s, i) => (
                    <li key={s} className="flex items-center gap-3">
                      <span className={cn("flex size-8 items-center justify-center rounded-full text-sm font-bold", i === t.data.importSteps.length - 1 ? "bg-[#0b2559] text-white" : "bg-emerald-50 text-emerald-700")}>{i + 1}</span>
                      <span className="font-medium text-[#0b2559]">{s}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
              <Reveal delay={100} className="rounded-3xl border border-[#0b2559]/10 bg-white p-6">
                <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-[#0b2559]">
                  <ArrowRight className="size-5 text-[#1d63ed]" aria-hidden /> {t.data.exportTitle}
                </h3>
                <div className="mt-5 flex items-center gap-3">
                  <span className="rounded-xl bg-[#0b2559] px-3 py-2 text-sm font-semibold text-white">NeoScool</span>
                  <span aria-hidden className="h-0.5 flex-1 bg-gradient-to-r from-[#0b2559] to-[#1d63ed]" />
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {t.data.exportFormats.map((f) => (
                    <li key={f} className="rounded-xl border border-[#1d63ed]/20 bg-[#e8f0fe] px-4 py-2 font-mono text-sm font-bold text-[#0b2559]">
                      {f}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>
      ) : null}

      {/* MULTI-ÉTABLISSEMENTS */}
      {sectionOn(content, "multi") ? (
        <section className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-2">
            <div className="grid gap-6">
              <SectionTitle eyebrow={t.multi.eyebrow} title={t.multi.title} center={false} />
              <ul className="grid gap-3">
                {t.multi.points.map((p, i) => (
                  <Reveal as="li" key={p} delay={i * 60} className="flex items-start gap-3 text-[#0b2559]/80">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> {p}
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal delay={120} className="grid justify-items-center gap-6" data-testid="multi-org">
              <span className="flex items-center gap-2 rounded-2xl bg-[#0b2559] px-5 py-3 font-semibold text-white shadow-xl">
                <Building2 className="size-5 text-sky-300" aria-hidden /> {t.multi.org}
              </span>
              <svg viewBox="0 0 300 40" className="w-3/4" aria-hidden>
                {[50, 150, 250].map((x) => (
                  <path key={x} d={`M150,0 C150,20 ${x},20 ${x},40`} fill="none" stroke="#1d63ed" strokeOpacity="0.5" strokeWidth="2" className="site-dash" />
                ))}
              </svg>
              <div className="grid w-full grid-cols-3 gap-3">
                {t.multi.spaces.map((s) => (
                  <div key={s} className="grid justify-items-center gap-2 rounded-2xl border border-[#0b2559]/10 bg-[#f6f8fc] p-4 text-center">
                    <School className="size-6 text-[#1d63ed]" aria-hidden />
                    <span className="text-sm font-semibold text-[#0b2559]">{s}</span>
                    <span className="flex gap-1" aria-hidden>
                      <Users className="size-3.5 text-[#0b2559]/40" />
                      <UserCog className="size-3.5 text-[#0b2559]/40" />
                      <Lock className="size-3.5 text-emerald-600" />
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* PAYS */}
      {sectionOn(content, "countries") && content.countries.length ? (
        <section className="relative overflow-hidden bg-[#07142b] py-20 text-white" id="pays">
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[40rem] rounded-full bg-blue-600/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.countries.eyebrow} title={t.countries.title} subtitle={t.countries.subtitle} dark />
            <CountryShowcase countries={content.countries.map((c) => countryCard(c, locale))} labels={{ context: t.countries.context, systems: t.countries.systems, systemsNote: t.countries.systemsNote }} />
            <Reveal className="rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5 text-sm text-sky-100/85" data-testid="national-note">
              {t.countries.national}
            </Reveal>
            <Link href={route("countries", locale)} className="inline-flex w-fit items-center gap-1.5 font-semibold text-sky-300">
              {t.countries.all} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      ) : null}

      {/* TARIFS */}
      {sectionOn(content, "pricing") ? (
        <section className="py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.pricing.eyebrow} title={t.pricing.title} subtitle={t.pricing.subtitle} />
            <PricingCards locale={locale} limit={3} />
            <div className="flex flex-wrap justify-center gap-3">
              <Link href={route("pricing", locale)} className="rounded-2xl bg-[#0b2559] px-5 py-3 font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-[0.98]">
                {t.pricing.see}
              </Link>
              <Link href={route("contact", locale)} className="rounded-2xl border border-[#0b2559]/15 bg-white px-5 py-3 font-semibold text-[#0b2559]">
                {t.pricing.quote}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* TÉMOIGNAGES (uniquement s'il en existe de réels) */}
      {sectionOn(content, "testimonials") && content.testimonials.length ? (
        <section className="bg-white py-20" data-testid="testimonials">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
            <SectionTitle eyebrow={t.testimonials.eyebrow} title={t.testimonials.title} />
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {content.testimonials.map((q, i) => (
                <Reveal as="li" key={`${q.author_name}-${i}`} delay={i * 80} className="grid gap-4 rounded-3xl border border-[#0b2559]/10 bg-[#f6f8fc] p-6">
                  <p className="text-[#0b2559]/85">« {q.quote} »</p>
                  <p className="text-sm">
                    <strong className="text-[#0b2559]">{q.author_name}</strong>
                    {q.author_role || q.organization ? <span className="text-[#0b2559]/60"> — {[q.author_role, q.organization].filter(Boolean).join(", ")}</span> : null}
                  </p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <FinalCta locale={locale} />
    </>
  );
}

export function FinalCta({ locale }: { locale: Locale }) {
  const t = DICTS[locale].finalCta;
  return (
    <section className="relative isolate overflow-hidden bg-[#07142b] text-white" data-testid="final-cta">
      {/* Photo réelle en fond (droite), fondue dans le bleu nuit pour garder le texte lisible. */}
      <SitePhoto name="lyceenne-campus" locale={locale} fill decorative sizes="(min-width: 1024px) 60vw, 100vw" position="62% 30%" className="absolute inset-0 -z-10 lg:left-[38%]" imgClassName="opacity-40 lg:opacity-100" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#07142b] via-[#07142b]/85 to-[#07142b]/60 lg:left-[38%] lg:bg-gradient-to-r lg:from-[#07142b] lg:via-[#07142b]/25 lg:to-transparent" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 hidden h-24 bg-gradient-to-t from-[#07142b] to-transparent lg:block" />
      <div aria-hidden className="pointer-events-none absolute -left-24 top-0 -z-10 size-[30rem] rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid max-w-xl justify-items-center gap-6 text-center lg:justify-items-start lg:text-left">
          <Reveal as="div" className="grid gap-4">
            <h2 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{t.title}</h2>
            <p className="text-lg text-sky-100/85">{t.subtitle}</p>
          </Reveal>
          <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link href={`${route("home", locale)}#decouvrir`} className="rounded-2xl bg-white px-5 py-3.5 font-semibold text-[#0b2559] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 active:scale-[0.98]">
              {t.discover}
            </Link>
            <Link href={`${route("contact", locale)}?demande=demo`} className="rounded-2xl border border-white/30 bg-white/5 px-5 py-3.5 font-semibold backdrop-blur transition-colors hover:bg-white/10 active:scale-[0.98]">
              {t.demo}
            </Link>
            <Link href="/connexion" className="rounded-2xl px-5 py-3.5 font-semibold text-sky-200 transition-colors hover:text-white">
              {t.login}
            </Link>
          </div>
          <div className="mt-6 grid gap-1">
            <span className="font-display text-2xl font-semibold">NeoScool</span>
            <span className="text-sky-100/80">{t.signature}</span>
            <span className="text-sm tracking-wide text-sky-300">www.Neoscool.com</span>
          </div>
        </div>
      </div>
    </section>
  );
}
