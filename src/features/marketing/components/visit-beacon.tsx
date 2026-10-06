"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  CONVERSION_EVENT,
  describeClick,
  doNotTrack,
  readConsent,
  send,
  sessionId,
  visitorId,
  writeConsent,
  type AnalyticsConfig,
  type AnalyticsEvent,
} from "@/features/analytics/client";

const CONSENT_CHANGE = "neoscool:consent";
const DEFAULT_CONFIG: AnalyticsConfig = { enabled: true, consentRequired: true, clicks: true };

/**
 * Mesure d'audience du site public (voir /api/site/visite et features/analytics/client) :
 * pages vues, clics, durée des pages, conversions ; bandeau de consentement pour
 * l'identifiant durable. Aucun cookie. Jamais bloquant.
 */
export function VisitBeacon({ locale, config = DEFAULT_CONFIG }: { locale: "fr" | "en"; config?: AnalyticsConfig }) {
  const pathname = usePathname();
  const queue = useRef<AnalyticsEvent[]>([]);
  const page = useRef<{ path: string; visibleSince: number | null; visibleMs: number } | null>(null);
  const counter = useRef(0);
  const first = useRef(true);
  // Choix de consentement (localStorage) ; « server » pendant le rendu serveur : bandeau masqué.
  const consent = useSyncExternalStore(
    (notify) => {
      window.addEventListener(CONSENT_CHANGE, notify);
      return () => window.removeEventListener(CONSENT_CHANGE, notify);
    },
    () => (doNotTrack() ? "dnt" : (readConsent() ?? "unset")),
    () => "server",
  );
  const banner = config.enabled && config.consentRequired && consent === "unset";

  // Envoi groupé : toutes les 3 s, et à la fermeture / mise en arrière-plan de la page.
  useEffect(() => {
    if (doNotTrack()) return;
    const flush = (leaving = false) => {
      if (leaving && page.current) {
        const p = page.current;
        const ms = p.visibleMs + (p.visibleSince ? Date.now() - p.visibleSince : 0);
        if (ms > 0) queue.current.push({ type: "leave", path: p.path, duration_ms: Math.min(ms, 3_600_000) });
        p.visibleMs = 0;
        p.visibleSince = null;
      }
      if (!queue.current.length) return;
      const events = queue.current.splice(0, 50);
      const url = new URL(location.href);
      send({
        sid: sessionId(),
        vid: config.enabled ? visitorId(config) : null,
        consent: readConsent() === "granted" || !config.consentRequired,
        locale,
        referrer: document.referrer,
        utm_source: url.searchParams.get("utm_source") ?? url.searchParams.get("source"),
        utm_campaign: url.searchParams.get("utm_campaign"),
        events,
      });
    };
    const timer = window.setInterval(() => flush(), 3000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible" && config.enabled) send({ sid: sessionId(), vid: visitorId(config), consent: readConsent() === "granted" || !config.consentRequired, locale, events: [] });
    }, 60_000);
    const onVisibility = () => {
      const p = page.current;
      if (!p) return;
      if (document.visibilityState === "hidden") flush(true);
      else p.visibleSince = Date.now();
    };
    const onClick = (e: MouseEvent) => {
      if (!config.enabled || !config.clicks || !(e.target instanceof Element)) return;
      const d = describeClick(e.target, location.origin);
      if (d) queue.current.push({ type: "click", path: location.pathname, ...d });
    };
    const onConversion = (e: Event) => {
      queue.current.push({ type: "conversion", path: location.pathname, label: String((e as CustomEvent).detail ?? "conversion").slice(0, 80) });
      flush();
    };
    const onHide = () => flush(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener(CONVERSION_EVENT, onConversion);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener(CONVERSION_EVENT, onConversion);
    };
  }, [config, locale]);

  // Page vue (et fin de la page précédente) à chaque changement d'adresse.
  useEffect(() => {
    if (doNotTrack()) return;
    const prev = page.current;
    if (prev && prev.path !== pathname) {
      const ms = prev.visibleMs + (prev.visibleSince ? Date.now() - prev.visibleSince : 0);
      queue.current.push({ type: "leave", path: prev.path, duration_ms: Math.min(ms, 3_600_000) });
    }
    page.current = { path: pathname, visibleSince: document.visibilityState === "visible" ? Date.now() : null, visibleMs: 0 };
    counter.current += 1;
    queue.current.push({ type: "pageview", path: pathname, n: counter.current });
    // Première page : envoi immédiat (le compteur de visites ne dépend pas du minuteur).
    if (first.current) {
      first.current = false;
      const url = new URL(location.href);
      const events = queue.current.splice(0, 50);
      send({
        sid: sessionId(),
        vid: config.enabled ? visitorId(config) : null,
        consent: readConsent() === "granted" || !config.consentRequired,
        locale,
        referrer: document.referrer,
        utm_source: url.searchParams.get("utm_source") ?? url.searchParams.get("source"),
        utm_campaign: url.searchParams.get("utm_campaign"),
        events,
      });
    }
  }, [pathname, config, locale]);

  if (!banner) return null;
  const en = locale === "en";
  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    window.dispatchEvent(new Event(CONSENT_CHANGE));
  };
  return (
    <div role="dialog" aria-label={en ? "Audience measurement" : "Mesure d'audience"} data-analytics-ignore data-testid="consent-banner" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-2xl sm:inset-x-6">
      <p>
        {en
          ? "NeoScool measures its audience to improve the site (pages viewed, buttons clicked). With your consent, we also recognise you when you come back. No advertising, no resale, nothing you type is recorded."
          : "NeoScool mesure son audience pour améliorer le site (pages vues, boutons cliqués). Avec votre accord, nous vous reconnaissons aussi quand vous revenez. Aucune publicité, aucune revente, rien de ce que vous saisissez n'est enregistré."}{" "}
        <a href="/confidentialite" className="underline">
          {en ? "Privacy" : "Confidentialité"}
        </a>
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => choose("denied")} className="rounded-xl border border-slate-300 px-4 py-2 font-semibold">
          {en ? "Refuse" : "Refuser"}
        </button>
        <button type="button" onClick={() => choose("granted")} className="rounded-xl bg-[#0e4a9a] px-4 py-2 font-semibold text-white">
          {en ? "Accept" : "Accepter"}
        </button>
      </div>
    </div>
  );
}
