import { NextResponse, type NextRequest } from "next/server";

import { REF_COOKIE, ipHash } from "@/features/affiliates/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Lien de recommandation d'un affilié : /r/NEO-NOM-1234 (option « ?vers=/inscription »).
 * Le clic est enregistré en base seulement si le programme, les liens et l'affilié sont actifs ;
 * dans tous les cas le visiteur arrive sur le site, sans erreur.
 */
const DESTINATIONS = new Set(["/", "/tarifs", "/inscription", "/contact", "/en", "/pricing"]);

export async function GET(request: NextRequest, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const wanted = request.nextUrl.searchParams.get("vers") ?? "/tarifs";
  const target = new URL(DESTINATIONS.has(wanted) ? wanted : "/tarifs", request.nextUrl.origin);
  const response = NextResponse.redirect(target, 302);
  const admin = createAdminClient();
  if (!admin || !/^[A-Za-z0-9-]{4,30}$/.test(code)) return response;
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || request.headers.get("x-real-ip") || "inconnue";
  const campaign = request.nextUrl.searchParams.get("c");
  const { data } = await admin.rpc("affiliate_record_click", {
    p_code: code,
    p_ip_hash: ipHash(ip),
    p_landing: target.pathname,
    p_campaign: (campaign && isUuid(campaign) ? campaign : null) as string,
  });
  const click = data as { click: string; days: number; conflict_rule: string } | null;
  if (!click?.click) return response;
  // « Premier clic » : un lien déjà retenu sur cet appareil n'est pas remplacé.
  const existing = request.cookies.get(REF_COOKIE)?.value;
  if (click.conflict_rule === "first_click" && existing && isUuid(existing)) return response;
  response.cookies.set(REF_COOKIE, click.click, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:" || (request.headers.get("x-forwarded-proto") ?? "").startsWith("https"),
    path: "/",
    maxAge: click.days * 86_400,
  });
  return response;
}
