import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/** Image publique d'un établissement : servie seulement si elle illustre une fiche ou une campagne publiée. */
export async function GET(_request: Request, ctx: RouteContext<"/decouvrir/media/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Introuvable.", { status: 404 });
  const { data } = await (await createClient()).rpc("public_media", { p_id: id });
  const row = (data as { mime_type: string; content: string }[] | null)?.[0];
  if (!row) return new Response("Introuvable.", { status: 404 });
  const hex = row.content.startsWith("\\x") ? row.content.slice(2) : row.content;
  return new Response(Buffer.from(hex, "hex"), { headers: { "Content-Type": row.mime_type, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
