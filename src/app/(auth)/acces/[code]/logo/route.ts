import { createClient } from "@/lib/supabase/server";
import { normalizeOrgCode } from "@/features/auth/portals";

/** Logo public de l'établissement (page du lien des portails). Uniquement le fichier désigné comme logo. */
export async function GET(_request: Request, ctx: RouteContext<"/acces/[code]/logo">) {
  const code = normalizeOrgCode(decodeURIComponent((await ctx.params).code));
  if (!code) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("organization_portal_logo", { p_code: code });
  const logo = data?.[0];
  if (!logo?.content) return new Response(null, { status: 404 });
  const hex = String(logo.content);
  const bytes = Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": logo.mime_type,
      "Cache-Control": "public, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
