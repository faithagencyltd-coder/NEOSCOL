/**
 * Mesure d'audience du site public, côté navigateur (sans dépendance).
 *
 * Ce qui part au serveur : la page (sans paramètres), le libellé du bouton ou
 * l'adresse du lien cliqué, la durée de la page, l'origine de la visite.
 * Jamais : une saisie de formulaire, un mot de passe, un contenu de page.
 *
 *  • Session : identifiant aléatoire en sessionStorage (disparaît avec l'onglet,
 *    renouvelé après 30 min d'inactivité).
 *  • Visiteur durable (« visiteur qui revient ») : identifiant aléatoire en
 *    localStorage, seulement si le visiteur a accepté (ou si le Super Admin a
 *    désactivé l'exigence de consentement).
 *  • « Ne pas me suivre » (DNT / GPC) : rien n'est envoyé.
 */

export type AnalyticsConfig = { enabled: boolean; consentRequired: boolean; clicks: boolean };
export type ConsentState = "granted" | "denied" | null;
export type AnalyticsEvent = { type: "pageview" | "click" | "leave" | "conversion"; path: string; label?: string; target?: string; duration_ms?: number; n?: number };

const ENDPOINT = "/api/site/visite";
const SESSION_KEY = "ns_sid";
const SESSION_SEEN = "ns_sid_at";
const VISITOR_KEY = "ns_vid";
const PENDING_KEY = "ns_pending";
export const CONSENT_KEY = "ns_consent";
export const CONVERSION_EVENT = "neoscool:conversion";
const IDLE_MS = 30 * 60 * 1000;

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

export function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

export function readConsent(): ConsentState {
  return safe(() => {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  }, null);
}

export function writeConsent(value: "granted" | "denied") {
  safe(() => {
    localStorage.setItem(CONSENT_KEY, value);
    if (value === "denied") localStorage.removeItem(VISITOR_KEY);
    // Le visiteur change d'identifiant : la suite de la visite ouvre une nouvelle session.
    sessionStorage.removeItem(SESSION_KEY);
  }, undefined);
}

export function sessionId(): string {
  return safe(() => {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(SESSION_SEEN) ?? 0);
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || now - last > IDLE_MS) {
      id = uuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    sessionStorage.setItem(SESSION_SEEN, String(now));
    return id;
  }, uuid());
}

/**
 * Durées de page envoyées à la fermeture : le navigateur peut interrompre cet
 * envoi pendant la navigation. Elles sont donc aussi gardées dans l'onglet et
 * renvoyées par la page suivante ; chaque durée porte une clé unique (label),
 * le serveur ignore les doublons.
 */
export function keepPending(sid: string, events: AnalyticsEvent[]) {
  safe(() => {
    const prev = takePendingRaw();
    const kept = prev && prev.sid === sid ? prev.events : [];
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ sid, events: [...kept, ...events].slice(-10) }));
  }, undefined);
}
const takePendingRaw = (): { sid: string; events: AnalyticsEvent[] } | null =>
  safe(() => {
    const v = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    return v && typeof v.sid === "string" && Array.isArray(v.events) ? v : null;
  }, null);
export function takePending(sid: string): AnalyticsEvent[] {
  const v = takePendingRaw();
  safe(() => sessionStorage.removeItem(PENDING_KEY), undefined);
  return v && v.sid === sid ? v.events.filter((e) => e?.type === "leave" && typeof e.path === "string").slice(0, 10) : [];
}
export const eventKey = () => uuid().replace(/-/g, "").slice(0, 16);

/** Identifiant durable : seulement avec consentement (ou consentement non exigé). */
export function visitorId(config: AnalyticsConfig): string | null {
  const allowed = !config.consentRequired || readConsent() === "granted";
  if (!allowed) return null;
  return safe(() => {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }, null);
}

/** Libellé d'un élément cliqué : attribut data-analytics, libellé accessible ou texte visible (jamais une saisie). */
export function describeClick(el: Element, origin: string): { label?: string; target?: string } | null {
  const node = el.closest("[data-analytics], a, button, [role=button]");
  if (!node || node.closest("[data-analytics-ignore]")) return null;
  if (node.matches("input, textarea, select")) return null;
  const text = (node.getAttribute("data-analytics") || node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  let target: string | undefined;
  if (node instanceof HTMLAnchorElement && node.href) {
    const url = safe(() => new URL(node.href), null);
    if (url && (url.protocol === "http:" || url.protocol === "https:")) target = (url.origin === origin ? url.pathname : `${url.host}${url.pathname}`).slice(0, 200);
    else if (url && (url.protocol === "tel:" || url.protocol === "mailto:")) target = url.protocol === "tel:" ? "Téléphone" : "E-mail";
  }
  if (!text && !target) return null;
  return { label: text || undefined, target };
}

/** Envoie un lot d'événements (sendBeacon si possible : fonctionne à la fermeture de la page). */
export function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  safe(() => {
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      void fetch(ENDPOINT, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  }, undefined);
}

/** À appeler quand une conversion réussit (demande de démonstration, contact, inscription…). */
export function trackConversion(name: "demo_request" | "contact_request" | "discover_request" | "signup_submitted" | "public_signup") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONVERSION_EVENT, { detail: name }));
}
