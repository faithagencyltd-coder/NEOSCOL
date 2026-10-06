import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mesure d'audience du site public, sans cookie : l'empreinte du visiteur est
 * calculée ici (adresse + navigateur + jour + sel serveur), hachée et jamais
 * conservée en clair ; elle change chaque jour. DNT / GPC respectés, robots
 * déclarés ignorés. Réponse vide dans tous les cas.
 */
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|monitor|uptime/i;

function device(ua: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export async function POST(request: NextRequest) {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOTS.test(ua) || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return done;
  const body = (await request.json().catch(() => null)) as { path?: unknown; referrer?: unknown; locale?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path.split(/[?#]/)[0]!.slice(0, 200) : "";
  if (!path.startsWith("/") || path.startsWith("/api") || path.startsWith("/plateforme")) return done;
  let referrer: string | null = null;
  try {
    const host = typeof body?.referrer === "string" && body.referrer ? new URL(body.referrer).hostname.replace(/^www\./, "") : null;
    referrer = host && host !== request.nextUrl.hostname.replace(/^www\./, "") ? host.slice(0, 120) : null;
  } catch {
    referrer = null;
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "inconnu";
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.VISIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "neoscool";
  const visitor = createHash("sha256").update(`${day}|${ip}|${ua}|${salt}`).digest("hex");
  const countryHeader = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "").toUpperCase();
  const admin = createAdminClient();
  if (!admin) return done;
  await admin.rpc("record_site_visit", {
    p_path: path,
    p_referrer: referrer as string,
    p_device: device(ua),
    p_locale: body?.locale === "en" ? "en" : "fr",
    p_country: (/^[A-Z]{2}$/.test(countryHeader) && countryHeader !== "XX" ? countryHeader : null) as string,
    p_visitor: visitor,
  });
  return done;
}
