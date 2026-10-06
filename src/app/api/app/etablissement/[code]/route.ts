import { normalizeOrgCode, portalsFor, type PortalKind } from "@/features/auth/portals";
import { universityConfigOf } from "@/features/university/config";
import { NATIVE_APP_ORIGINS } from "@/lib/native-app";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ORGANIZATION_TYPE_LABELS } from "@/lib/vocabulary";

/**
 * Identité publique d'un établissement pour l'application mobile (même
 * contenu que la page /acces/CODE : nom, type, ville, couleurs, logo, portails
 * ouverts). Aucune donnée personnelle, aucun effectif. Lisible uniquement par
 * les pages locales de l'application (CORS) et par le site lui-même.
 */
function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return origin && NATIVE_APP_ORIGINS.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request, ctx: RouteContext<"/api/app/etablissement/[code]">) {
  const headers = { ...cors(request), "Cache-Control": "no-store" };
  const code = normalizeOrgCode(decodeURIComponent((await ctx.params).code));
  if (!code) return Response.json({ error: "Code d'établissement invalide." }, { status: 400, headers });
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_portal", { p_code: code });
  const org = data?.[0];
  if (!org) return Response.json({ error: "Aucun établissement actif ne correspond à ce code." }, { status: 404, headers });

  // Université : portail parent seulement s'il est activé par l'établissement.
  let parentPortal = true;
  const admin = createAdminClient();
  if (admin) {
    const { data: row } = await admin.from("organizations").select("type, settings").eq("id", org.id).maybeSingle();
    const university = universityConfigOf(row?.type ?? org.type, row?.settings);
    parentPortal = !university || university.features.parent_portal;
  }
  const names = portalsFor(org.type);
  const kinds: PortalKind[] = [...(parentPortal ? (["parent"] as const) : []), "eleve", "enseignant", "personnel"];
  const base = await publicBaseUrl();
  return Response.json(
    {
      code: org.code,
      name: org.name,
      short_name: org.short_name,
      type: org.type,
      type_label: ORGANIZATION_TYPE_LABELS[org.type] ?? org.type,
      city: org.city,
      country: org.country,
      primary_color: org.primary_color,
      secondary_color: org.secondary_color,
      logo_url: org.has_logo ? `${base}/acces/${org.code}/logo` : null,
      is_demo: org.is_demo,
      portals: kinds.map((kind) => ({ kind, label: names[kind].label, sub: names[kind].sub, method: names[kind].method, path: `/acces/${org.code}?portail=${kind}` })),
    },
    { headers },
  );
}
