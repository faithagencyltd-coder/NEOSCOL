import type { NextRequest } from "next/server";

import { CAMPAIGN_OBJECTIVES } from "@/features/ecosystem/constants";
import { campaignKitSvg, KIT_FORMATS, type KitFormat } from "@/features/ecosystem/media-kit";
import { loadImage } from "@/features/documents/server";
import { can, getSessionContext } from "@/lib/auth/session";
import { featureEnabled } from "@/lib/features";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/** NeoScool Media Kit : visuel SVG d'une campagne (droit « Communication », module ouvert, campagne de l'établissement). */
export async function GET(request: NextRequest, ctx: RouteContext<"/visibilite/campagnes/[id]/kit">) {
  const { id } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!isUuid(id) || !can(context, "communication.send") || !featureEnabled(context.organization, "media_kit")) return new Response("Introuvable.", { status: 404 });
  const format = (request.nextUrl.searchParams.get("format") ?? "square") as KitFormat;
  if (!(format in KIT_FORMATS)) return new Response("Format inconnu.", { status: 400 });
  const supabase = await createClient();
  const [{ data: c }, { data: profile }, { data: branding }, base] = await Promise.all([
    supabase.from("promo_campaigns").select("id, title, description, objective, media, starts_on, ends_on, contact").eq("id", id).eq("organization_id", context.organization.id).maybeSingle(),
    supabase.from("org_public_profiles").select("slug").eq("organization_id", context.organization.id).maybeSingle(),
    supabase.from("organization_branding").select("logo_path, primary_color").eq("organization_id", context.organization.id).maybeSingle(),
    publicBaseUrl(),
  ]);
  if (!c) return new Response("Introuvable.", { status: 404 });
  const [image, logo] = await Promise.all([loadImage(supabase, c.media?.[0]), loadImage(supabase, branding?.logo_path)]);
  const fr = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const dates = c.starts_on && c.ends_on ? `Du ${fr(c.starts_on)} au ${fr(c.ends_on)}` : c.ends_on ? `Jusqu'au ${fr(c.ends_on)}` : c.starts_on ? `À partir du ${fr(c.starts_on)}` : null;
  const url = profile ? `${base}/decouvrir/${profile.slug}/campagnes/${c.id}?source=qr` : `${base}/decouvrir`;
  const svg = await campaignKitSvg({
    format,
    title: c.title,
    objective: CAMPAIGN_OBJECTIVES[c.objective] ?? c.objective,
    description: c.description,
    organization: context.organization.name,
    dates,
    contact: c.contact,
    url,
    color: branding?.primary_color ?? "#0E4A9A",
    image,
    logo,
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `${request.nextUrl.searchParams.has("telecharger") ? "attachment" : "inline"}; filename="campagne-${format}.svg"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
