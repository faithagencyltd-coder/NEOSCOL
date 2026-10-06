import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/** CV joint à une candidature : son propriétaire, ou le gestionnaire de l'annonce (contrôlé par la base). */
export async function GET(_request: Request, ctx: RouteContext<"/espace/cv/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Introuvable.", { status: 404 });
  const { data } = await (await createClient()).rpc("opportunity_file_download", { p_id: id });
  const row = (data as { file_name: string; mime_type: string; content: string }[] | null)?.[0];
  if (!row) return new Response("Introuvable.", { status: 404 });
  const hex = row.content.startsWith("\\x") ? row.content.slice(2) : row.content;
  return new Response(Buffer.from(hex, "hex"), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
