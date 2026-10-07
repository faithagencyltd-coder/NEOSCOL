import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandName, LogoMark } from "@/components/shared/logo";
import { DICTS, route, type Locale } from "@/features/marketing/content";
import { getSiteContent } from "@/features/marketing/data";
import { SiteContacts } from "@/features/site/components/site-contacts";
import { getSiteSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";

import { MobileMenu } from "./mobile-menu";
import { SocialIcon } from "./social-icon";
import { getAnalyticsConfig } from "@/features/analytics/server";
import { SupportChatMount } from "@/features/support/components/support-chat-mount";

import { VisitBeacon } from "./visit-beacon";
import { WhatsAppButton } from "./whatsapp-button";

/** Enveloppe du site officiel : en-tête, changement de langue, pied de page, WhatsApp. */
export async function SiteShell({ locale, alternate, children }: { locale: Locale; alternate: string; children: ReactNode }) {
  const t = DICTS[locale];
  const [content, site, signedIn, analytics] = await Promise.all([
    getSiteContent(),
    getSiteSettings(),
    createClient()
      .then((supabase) => supabase.auth.getUser())
      .then(({ data }) => Boolean(data.user))
      .catch(() => false),
    getAnalyticsConfig(),
  ]);
  // Visiteur déjà connecté : accès direct au logiciel.
  const loginHref = signedIn ? "/tableau-de-bord" : "/connexion";
  const loginLabel = signedIn ? (locale === "fr" ? "Accéder au logiciel" : "Open the software") : t.nav.login;
  // Menu du haut : « Pays » reste accessible depuis le pied de page et l'accueil.
  const nav = [
    { href: `${route("home", locale)}#secteurs`, label: t.nav.solutions },
    { href: `${route("home", locale)}#fonctionnalites`, label: t.nav.features },
    { href: "/decouvrir", label: t.nav.discover, hint: t.nav.discoverHint, highlight: true },
    { href: "/opportunites", label: t.nav.opportunities, hint: t.nav.opportunitiesHint, highlight: true },
    { href: route("pricing", locale), label: t.nav.pricing },
    { href: route("contact", locale), label: t.nav.contact },
  ];
  const sectors = [
    { href: route("school", locale), label: t.sectorsNav.school },
    { href: route("university", locale), label: t.sectorsNav.university },
    { href: route("training", locale), label: t.sectorsNav.training },
  ];
  const whatsappMessage = locale === "en" ? t.whatsapp.defaultMessage : (content.settings.whatsapp_message ?? t.whatsapp.defaultMessage);
  const whatsappLabel = locale === "en" ? t.whatsapp.label : (content.settings.whatsapp_label ?? t.whatsapp.label);
  const other = locale === "fr" ? "en" : "fr";

  return (
    <div lang={locale} className="min-h-dvh bg-[#f6f8fc] text-foreground">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2">
        {locale === "fr" ? "Aller au contenu" : "Skip to content"}
      </a>
      <header className="sticky top-0 z-40 border-b border-[#0b2559]/10 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.25rem] max-w-[90rem] items-center gap-2 px-4 sm:px-6 2xl:gap-3 2xl:px-8">
          <Link href={route("home", locale)} className="flex shrink-0 items-center gap-2.5" aria-label="NeoScool">
            <LogoMark className="size-9" />
            <BrandName className="text-xl" />
          </Link>
          <nav aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"} className="ml-1 hidden items-center gap-0 whitespace-nowrap text-sm font-medium text-[#0b2559]/80 xl:flex">
            {nav.map((item) =>
              item.highlight ? (
                <Link key={item.href} href={item.href} title={item.hint} className="group relative rounded-lg px-2 py-2 font-semibold 2xl:px-2.5 text-[#0b2559] transition-colors hover:bg-[#1d63ed]/[0.07]">
                  <span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-gradient-to-br from-[#1d63ed] to-[#0ea5e9] align-middle" aria-hidden />
                  {item.label}
                </Link>
              ) : (
                <Link key={item.href} href={item.href} className="rounded-lg px-2 py-2 transition-colors hover:bg-[#0b2559]/5 hover:text-[#0b2559] 2xl:px-2.5">
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 2xl:gap-2">
            <div role="group" aria-label={t.nav.language} className="flex rounded-full border border-[#0b2559]/15 bg-white p-0.5 text-xs font-semibold" data-testid="lang-switch">
              {(["fr", "en"] as const).map((l) => (
                <Link
                  key={l}
                  href={l === locale ? "#" : alternate}
                  hrefLang={l}
                  aria-current={l === locale ? "true" : undefined}
                  className={l === locale ? "rounded-full bg-[#0b2559] px-2.5 py-1 text-white" : "rounded-full px-2.5 py-1 text-[#0b2559]/70 hover:text-[#0b2559]"}
                >
                  {l.toUpperCase()}
                </Link>
              ))}
            </div>
            <Link href={loginHref} className="hidden whitespace-nowrap rounded-xl px-2 py-2 text-sm 2xl:px-3 font-semibold text-[#0b2559] hover:bg-[#0b2559]/5 sm:inline-flex">
              {loginLabel}
            </Link>
            <Link
              href={`${route("contact", locale)}?demande=demo`}
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0b2559] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#0b2559]/20 transition-transform hover:-translate-y-0.5 md:inline-flex"
            >
              {t.nav.demo} <ArrowRight className="size-4 xl:max-2xl:hidden" aria-hidden />
            </Link>
            <MobileMenu
              labels={{ menu: t.nav.menu, close: t.nav.close, login: loginLabel, demo: t.nav.demo, solutions: t.nav.solutions }}
              loginHref={loginHref}
              nav={nav}
              sectors={sectors}
              demoHref={`${route("contact", locale)}?demande=demo`}
            />
          </div>
        </div>
        {/* Petits écrans : Discover et Opportunities restent visibles sous la barre du haut. */}
        <nav aria-label="NeoScool Discover / Opportunities" className="grid grid-cols-2 gap-2 border-t border-[#0b2559]/[0.06] px-4 py-2 sm:px-6 xl:hidden" data-testid="eco-strip">
          {nav
            .filter((item) => item.highlight)
            .map((item) => (
              <Link key={item.href} href={item.href} className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#1d63ed]/[0.07] px-2 py-1.5 text-center text-xs font-semibold text-[#0b2559] sm:text-sm">
                <span className="size-1.5 shrink-0 rounded-full bg-gradient-to-br from-[#1d63ed] to-[#0ea5e9]" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
        </nav>
      </header>

      <main id="contenu">{children}</main>
      <VisitBeacon locale={locale} config={analytics} />
      <SupportChatMount placement="site" locale={locale} />

      <footer className="border-t border-[#0b2559]/10 bg-[#07142b] text-sky-100/80">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="grid content-start gap-4">
            <span className="flex items-center gap-2.5">
              <LogoMark inverted className="size-10" />
              <BrandName inverted className="text-2xl" />
            </span>
            <p className="max-w-xs text-sm">{t.finalCta.signature}</p>
            <SiteContacts site={site} className="grid gap-2 text-sm text-white [&_svg]:text-sky-300" />
            {content.social_links.length ? (
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-200/60">{t.footer.follow}</span>
                <ul className="flex flex-wrap gap-2" data-testid="social-links">
                  {content.social_links.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20">
                        <SocialIcon network={s.network} className="size-5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <nav aria-label={t.footer.product} className="grid content-start gap-2 text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-sky-200/60">{t.footer.product}</span>
            {sectors.map((s) => (
              <Link key={s.href} href={s.href} className="hover:text-white">
                {s.label}
              </Link>
            ))}
            <Link href={route("pricing", locale)} className="hover:text-white">
              {t.nav.pricing}
            </Link>
            <Link href={route("countries", locale)} className="hover:text-white">
              {t.nav.countries}
            </Link>
            <Link href="/decouvrir" className="hover:text-white">
              NeoScool Discover
            </Link>
            <Link href="/opportunites" className="hover:text-white">
              NeoScool Opportunities
            </Link>
          </nav>
          <nav aria-label={t.footer.company} className="grid content-start gap-2 text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-sky-200/60">{t.footer.company}</span>
            <Link href={route("contact", locale)} className="hover:text-white">
              {t.nav.contact}
            </Link>
            <Link href="/demo" className="hover:text-white">
              {t.contact.tryDemo}
            </Link>
            <Link href="/inscription" className="hover:text-white">
              {t.footer.signup}
            </Link>
            <Link href="/connexion" className="hover:text-white">
              {t.nav.login}
            </Link>
          </nav>
          <nav aria-label={t.footer.legal} className="grid content-start gap-2 text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-sky-200/60">{t.footer.legal}</span>
            <Link href="/aide" className="hover:text-white">
              {t.footer.help}
            </Link>
            <Link href="/conditions" className="hover:text-white">
              {t.footer.terms}
            </Link>
            <Link href="/confidentialite" className="hover:text-white">
              {t.footer.privacy}
            </Link>
            <Link href={alternate} hrefLang={other} className="hover:text-white">
              {other === "en" ? "English" : "Français"}
            </Link>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-sky-200/60 sm:px-8">
            NeoScool — {t.footer.rights} · www.Neoscool.com
          </p>
        </div>
      </footer>
      <WhatsAppButton number={content.settings.whatsapp} label={whatsappLabel} message={whatsappMessage} position={content.settings.whatsapp_position} />
    </div>
  );
}
