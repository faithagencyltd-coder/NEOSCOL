import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { DICTS, route, SECTOR_CAPTURES, type Locale } from "@/features/marketing/content";
import { getSiteContent } from "@/features/marketing/data";
import { SiteContacts } from "@/features/site/components/site-contacts";
import { turnstileSettings } from "@/lib/messaging/server";
import { getSiteSettings } from "@/lib/site-settings";

import { ContactForm } from "./contact-form";
import { countryCard, FinalCta, PricingCards, SectionTitle } from "./home";
import { CountryShowcase, Screen } from "./interactive";
import { Reveal } from "./reveal";

export type Sector = "school" | "university" | "training";

const ALT: Record<string, { fr: string; en: string }> = {
  "s-dashboard": { fr: "Tableau de bord de la direction", en: "Management dashboard" },
  "s-emploi-du-temps": { fr: "Emploi du temps", en: "Timetable" },
  "s-notes": { fr: "Saisie des notes", en: "Grade entry" },
  "s-bulletins-apercu": { fr: "Aperçu d'un bulletin", en: "Report card preview" },
  "s-finances": { fr: "Finances de l'établissement", en: "Institution finance" },
  "s-portail": { fr: "Portail des parents", en: "Parent portal" },
  "u-dashboard": { fr: "Tableau de bord universitaire", en: "University dashboard" },
  "u-structure": { fr: "Structure : facultés, filières, parcours", en: "Structure: faculties, programmes, tracks" },
  "u-resultats": { fr: "Résultats et crédits", en: "Results and credits" },
  "u-deliberation": { fr: "Délibération", en: "Deliberation" },
  "u-portail": { fr: "Portail étudiant", en: "Student portal" },
  "f-aujourdhui": { fr: "Journée du centre de formation", en: "Training centre day view" },
  "f-formations": { fr: "Formations", en: "Programmes" },
  "f-sessions": { fr: "Sessions et promotions", en: "Sessions and cohorts" },
  "f-competences": { fr: "Suivi des compétences", en: "Competency tracking" },
  "f-statistiques": { fr: "Statistiques", en: "Statistics" },
};

/** Page détaillée d'un secteur, illustrée par des écrans réels du module. */
export function SectorPage({ sector, locale }: { sector: Sector; locale: Locale }) {
  const t = DICTS[locale];
  const s = t.sectors[sector];
  const captures = SECTOR_CAPTURES[sector];
  const desktop = captures.filter((c) => !/portail/.test(c));
  const mobile = captures.find((c) => /portail/.test(c));
  return (
    <>
      <section className="site-grid-bg">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid gap-5">
            <Link href={`${route("home", locale)}#secteurs`} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-[#1d63ed]">
              <ArrowLeft className="size-4" aria-hidden /> {t.sectorPage.back}
            </Link>
            <h1 className="anim-fade-up font-display text-5xl font-semibold tracking-tight text-[#0b2559]">{s.title}</h1>
            <p className="anim-fade-up text-xl text-[#0b2559]/65 [--delay:80ms]">{s.tagline}</p>
            <ul className="anim-fade-up grid gap-2 sm:grid-cols-2 [--delay:160ms]">
              {s.items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-[#0b2559]/80">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> {item}
                </li>
              ))}
            </ul>
            <Link href={`${route("contact", locale)}?demande=demo`} className="mt-2 inline-flex w-fit items-center gap-2 rounded-2xl bg-[#0b2559] px-5 py-3.5 font-semibold text-white">
              {t.sectorPage.cta} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="relative">
            <Screen name={desktop[0]!} alt={ALT[desktop[0]!]?.[locale] ?? s.title} priority />
            {mobile ? (
              <div className="absolute -bottom-8 -right-2 w-[30%] min-w-[7rem]">
                <Screen name={mobile} alt={ALT[mobile]?.[locale] ?? s.title} />
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
          <SectionTitle eyebrow={s.title} title={t.sectorPage.screens} subtitle={t.hero.captionDemo} />
          <div className="grid gap-6 md:grid-cols-2">
            {desktop.slice(1).map((c, i) => (
              <Reveal key={c} delay={(i % 2) * 100} className="grid gap-3">
                <Screen name={c} alt={ALT[c]?.[locale] ?? s.title} />
                <p className="text-center text-sm font-semibold text-[#0b2559]/70">{ALT[c]?.[locale]}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <FinalCta locale={locale} />
    </>
  );
}

/** Tous les pays affichés, avec la note sur les systèmes nationaux. */
export async function CountriesPage({ locale }: { locale: Locale }) {
  const t = DICTS[locale];
  const content = await getSiteContent();
  return (
    <>
      <section className="relative overflow-hidden bg-[#07142b] py-16 text-white">
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
          <SectionTitle eyebrow={t.countries.eyebrow} title={t.countriesPage.title} subtitle={t.countriesPage.subtitle} dark h1 />
          <CountryShowcase countries={content.countries.map((c) => countryCard(c, locale))} labels={{ context: t.countries.context, systems: t.countries.systems, systemsNote: t.countries.systemsNote }} />
          <p className="rounded-2xl border border-sky-300/20 bg-sky-300/5 p-5 text-sm text-sky-100/85" data-testid="national-note">
            {t.countries.national}
          </p>
        </div>
      </section>
      <FinalCta locale={locale} />
    </>
  );
}

/** Contact et demande de démonstration. */
export async function ContactPage({ locale, demo }: { locale: Locale; demo: boolean }) {
  const t = DICTS[locale];
  const [site, content, captcha] = await Promise.all([getSiteSettings(), getSiteContent(), turnstileSettings()]);
  const hasContacts = Boolean(site.whatsapp || site.contact_email || site.contact_phone || site.address);
  return (
    <section className="site-grid-bg">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid content-start gap-6">
          <h1 className="font-display text-5xl font-semibold tracking-tight text-[#0b2559]">{demo ? t.contact.demoTitle : t.contact.title}</h1>
          <p className="text-lg text-[#0b2559]/65">{demo ? t.contact.demoSubtitle : t.contact.subtitle}</p>
          <div className="grid gap-3 rounded-3xl border border-[#0b2559]/10 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-[#0b2559]">{t.contact.direct}</h2>
            {hasContacts ? <SiteContacts site={site} className="grid gap-2 text-sm" /> : <p className="text-sm text-[#0b2559]/60">{t.contact.noContacts}</p>}
            {content.social_links.length ? (
              <ul className="flex flex-wrap gap-2 pt-2 text-sm">
                {content.social_links.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#0b2559]/15 px-3 py-1 font-medium text-[#0b2559] hover:border-[#1d63ed]">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm">
            <Link href="/demo" className="inline-flex items-center gap-1.5 font-semibold text-[#1d63ed]">
              {t.contact.tryDemo} <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/inscription" className="inline-flex items-center gap-1.5 font-semibold text-[#1d63ed]">
              {t.contact.signup} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-[#0b2559]/10 bg-white p-6 shadow-[0_30px_60px_-40px_rgba(11,37,89,0.6)] sm:p-8">
          <ContactForm locale={locale} defaultKind={demo ? "demo" : "contact"} labels={t.contact} countries={content.countries.map((c) => (locale === "en" ? (c.name_en ?? c.name) : c.name))} captchaKey={captcha?.siteKey ?? null} />
        </div>
      </div>
    </section>
  );
}

/** Tarifs en anglais (formules et prix lus en base). */
export function PricingPageEn() {
  const t = DICTS.en.pricing;
  return (
    <>
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-8">
          <SectionTitle eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} h1 />
          <PricingCards locale="en" />
          <p className="text-center text-sm text-[#0b2559]/60">
            Plans are billed in the listed currency. Subscription and payment take place in French at{" "}
            <Link href="/tarifs" className="font-semibold text-[#1d63ed]">
              /tarifs
            </Link>
            .
          </p>
        </div>
      </section>
      <FinalCta locale="en" />
    </>
  );
}
