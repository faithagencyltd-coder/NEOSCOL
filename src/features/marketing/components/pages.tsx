import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { CommunicationIllustration, ILLUSTRATIONS, TrainingIllustration, UniversityIllustration, type IllustrationName } from "@/components/illustrations/scenes";

import { DICTS, route, SECTOR_CAPTURES, type Locale } from "@/features/marketing/content";
import { getSiteContent } from "@/features/marketing/data";
import { SiteContacts } from "@/features/site/components/site-contacts";
import { turnstileSettings } from "@/lib/messaging/server";
import { getSiteSettings } from "@/lib/site-settings";

import { ContactForm } from "./contact-form";
import { countryCard, FinalCta, PricingCards, SectionTitle } from "./home";
import { CountryShowcase, Screen } from "./interactive";
import { Reveal } from "./reveal";
import { SitePhoto } from "./site-photo";

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

/** Trois temps forts illustrés par secteur (ce que le module organise au quotidien). */
const SECTOR_SCENES: Record<Sector, { ill: IllustrationName; fr: [string, string]; en: [string, string] }[]> = {
  school: [
    { ill: "grades", fr: ["Notes et bulletins", "Saisie par l'enseignant, calcul automatique, bulletin PDF vérifiable."], en: ["Grades and report cards", "Teacher entry, automatic averages, verifiable PDF report card."] },
    { ill: "parents", fr: ["Parents informés", "Présences, notes et paiements de l'enfant sur téléphone."], en: ["Informed parents", "Attendance, grades and payments on the phone."] },
    { ill: "teacher", fr: ["Enseignants équipés", "Cours du jour, appel après scan du badge, notes en quelques clics."], en: ["Equipped teachers", "Today's classes, roll call after badge scan, grades in a few clicks."] },
  ],
  university: [
    { ill: "grades", fr: ["Résultats et crédits", "UE, compensation, rattrapage et décisions du jury."], en: ["Results and credits", "Units, compensation, resits and jury decisions."] },
    { ill: "documents", fr: ["Documents officiels", "Relevés, attestations et diplômes avec QR de vérification."], en: ["Official documents", "Transcripts, certificates and diplomas with verification QR."] },
    { ill: "attendance", fr: ["Présence par badge", "Scan à l'entrée des salles, retards et sorties anticipées."], en: ["Badge attendance", "Scan at room entrance, lateness and early departures."] },
  ],
  training: [
    { ill: "attendance", fr: ["Assiduité suivie", "Badge QR à l'atelier : formateurs et apprenants."], en: ["Attendance tracked", "QR badge at the workshop: trainers and learners."] },
    { ill: "payments", fr: ["Échéanciers et reçus", "Paiement en tranches, reçu immédiat, relances automatiques."], en: ["Instalments and receipts", "Staged payments, instant receipts, automatic reminders."] },
    { ill: "communication", fr: ["Apprenants et familles informés", "SMS, WhatsApp et portail parent."], en: ["Learners and families informed", "SMS, WhatsApp and parent portal."] },
  ],
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
            {sector === "school" ? (
              // Écoles : la photo réelle des élèves, l'écran du module en surimpression.
              <div className="anim-fade-up relative pb-10 [--delay:120ms]">
                <SitePhoto name="eleves-campus" locale={locale} fill priority sizes="(min-width: 1024px) 50vw, 100vw" position="35% 30%" className="photo-zoom aspect-[4/3] rounded-[2rem] shadow-[0_40px_80px_-30px_rgba(11,37,89,0.55)] ring-1 ring-[#0b2559]/10" />
                <div className="site-float absolute -bottom-2 -left-4 w-[56%] sm:-left-8">
                  <Screen name={desktop[0]!} alt={ALT[desktop[0]!]?.[locale] ?? s.title} />
                </div>
                {mobile ? (
                  <div className="absolute -right-2 bottom-0 w-[24%] min-w-[6rem]">
                    <Screen name={mobile} alt={ALT[mobile]?.[locale] ?? s.title} />
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <Screen name={desktop[0]!} alt={ALT[desktop[0]!]?.[locale] ?? s.title} priority />
                {/* Illustration du secteur : ce que le module organise, en un coup d'œil. */}
                <div className="anim-fade-up absolute -left-6 -top-10 hidden w-[38%] rounded-3xl bg-white/90 p-2 shadow-xl ring-1 ring-[#0b2559]/10 backdrop-blur sm:block [--delay:200ms]">
                  {sector === "university" ? <UniversityIllustration /> : <TrainingIllustration />}
                </div>
                {mobile ? (
                  <div className="absolute -bottom-8 -right-2 w-[30%] min-w-[7rem]">
                    <Screen name={mobile} alt={ALT[mobile]?.[locale] ?? s.title} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
      <section className="border-y border-[#0b2559]/5 bg-[#f6f8fc] py-16" data-testid="sector-scenes">
        <ul className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-8 md:grid-cols-3">
          {SECTOR_SCENES[sector].map((scene, i) => {
            const Illustration = ILLUSTRATIONS[scene.ill];
            const [title, text] = scene[locale];
            return (
              <Reveal as="li" key={scene.ill} delay={i * 90} className="group grid content-start gap-3 rounded-3xl bg-white p-5 shadow-[0_20px_40px_-32px_rgba(11,37,89,0.5)] ring-1 ring-[#0b2559]/5 transition-transform duration-300 hover:-translate-y-1">
                <Illustration className="mx-auto max-h-44 transition-transform duration-500 group-hover:scale-[1.04]" />
                <h2 className="font-display text-lg font-semibold text-[#0b2559]">{title}</h2>
                <p className="text-sm text-[#0b2559]/65">{text}</p>
              </Reveal>
            );
          })}
        </ul>
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
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_11rem]">
            <div className="grid gap-4">
              <h1 className="anim-fade-up font-display text-5xl font-semibold tracking-tight text-[#0b2559]">{demo ? t.contact.demoTitle : t.contact.title}</h1>
              <p className="anim-fade-up text-lg text-[#0b2559]/65 [--delay:80ms]">{demo ? t.contact.demoSubtitle : t.contact.subtitle}</p>
            </div>
            <CommunicationIllustration className="anim-fade-up hidden max-w-44 sm:block [--delay:160ms]" />
          </div>
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
