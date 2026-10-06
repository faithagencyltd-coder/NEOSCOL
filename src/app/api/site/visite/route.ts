import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { browserOf, deviceOf, osOf } from "@/features/analytics/agent";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mesure d'audience du site public, sans cookie : l'empreinte du visiteur est
 * calculée ici (adresse + navigateur + jour + sel serveur), hachée et jamais
 * conservée en clair ; elle change chaque jour. Avec le consentement du
 * visiteur, un identifiant aléatoire durable (haché ici) permet de reconnaître
 * les visiteurs qui reviennent. DNT / GPC respectés, robots déclarés ignorés.
 * Réponse vide dans tous les cas.
 *
 * Deux formes acceptées : l'ancienne ({ path, referrer, locale } : une page vue)
 * et la forme Analytics ({ sid, vid, consent, events: [...] }).
 */
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|monitor|uptime|headless/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["pageview", "click", "leave", "conversion"]);

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : null);
const cleanPath = (v: unknown) => {
  const p = typeof v === "string" ? v.split(/[?#]/)[0]!.slice(0, 200) : "";
  return p.startsWith("/") ? p : null;
};
/** Pages jamais mesurées : console, espace personnel, API. */
const excluded = (p: string) => p.startsWith("/api") || p.startsWith("/plateforme") || p.startsWith("/espace");

type Body = {
  path?: unknown;
  referrer?: unknown;
  locale?: unknown;
  sid?: unknown;
  vid?: unknown;
  consent?: unknown;
  utm_source?: unknown;
  utm_campaign?: unknown;
  events?: unknown;
};

export async function POST(request: NextRequest) {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOTS.test(ua) || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return done;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return done;

  const legacy = !Array.isArray(body.events);
  const events = (legacy ? [{ type: "pageview", path: body.path }] : (body.events as unknown[]).slice(0, 50))
    .map((e) => e as { type?: unknown; path?: unknown; label?: unknown; target?: unknown; duration_ms?: unknown; n?: unknown })
    .map((e) => ({
      type: typeof e.type === "string" && TYPES.has(e.type) ? e.type : null,
      path: cleanPath(e.path),
      label: str(e.label, 80),
      target: str(e.target, 200),
      duration_ms: typeof e.duration_ms === "number" && e.duration_ms >= 0 ? Math.min(Math.round(e.duration_ms), 3_600_000) : null,
      n: typeof e.n === "number" ? Math.trunc(e.n) : null,
    }))
    .filter((e): e is typeof e & { type: string; path: string } => Boolean(e.type && e.path && !excluded(e.path)));
  const heartbeat = !legacy && events.length === 0;
  if (!events.length && !heartbeat) return done;

  let referrer: string | null = null;
  try {
    const host = typeof body.referrer === "string" && body.referrer ? new URL(body.referrer).hostname.replace(/^www\./, "") : null;
    referrer = host && host !== request.nextUrl.hostname.replace(/^www\./, "") ? host.slice(0, 120) : null;
  } catch {
    referrer = null;
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "inconnu";
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.VISIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "neoscool";
  const daily = createHash("sha256").update(`${day}|${ip}|${ua}|${salt}`).digest("hex");
  const countryHeader = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(countryHeader) && countryHeader !== "XX" ? countryHeader : null;
  const decode = (v: string | null) => {
    try {
      return v ? decodeURIComponent(v).slice(0, 80) : null;
    } catch {
      return null;
    }
  };
  const city = decode(request.headers.get("x-vercel-ip-city") ?? request.headers.get("cf-ipcity"));
  const region = decode(request.headers.get("x-vercel-ip-country-region") ?? request.headers.get("cf-region-code"));
  const locale = body.locale === "en" ? "en" : "fr";
  const device = deviceOf(ua);

  const admin = createAdminClient();
  if (!admin) return done;

  // Compteur de visites existant (page « Visiteurs ») : une ligne par page vue.
  for (const e of events.filter((x) => x.type === "pageview").slice(0, 10)) {
    await admin.rpc("record_site_visit", { p_path: e.path, p_referrer: referrer as string, p_device: device, p_locale: locale, p_country: country as string, p_visitor: daily });
  }
  if (legacy || typeof body.sid !== "string" || !UUID.test(body.sid)) return done;

  // Analytics : session et événements détaillés.
  const consented = body.consent === true && typeof body.vid === "string" && UUID.test(body.vid);
  const visitor = consented ? createHash("sha256").update(`v|${body.vid}|${salt}`).digest("hex") : daily;
  await admin.rpc("record_analytics", {
    p_session: {
      id: body.sid.toLowerCase(),
      visitor,
      consented,
      path: events[0]?.path ?? null,
      device,
      os: osOf(ua),
      browser: browserOf(ua),
      country,
      region,
      city,
      referrer,
      utm_source: str(body.utm_source, 80),
      utm_campaign: str(body.utm_campaign, 80),
      locale,
    },
    p_events: events,
  });
  return done;
}
