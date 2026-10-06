import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/** Pièce jointe à une demande de vérification : lue uniquement par l'administration de la plateforme (contrôlé par la base). */
export async function GET(_request: Request, ctx: RouteContext<"/plateforme/ecosysteme/piece/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Introuvable.", { status: 404 });
  const { data } = await (await createClient()).rpc("platform_verification_document", { p_id: id });
  const row = (data as { file_name: string; mime_type: string; content: string }[] | null)?.[0];
  if (!row) return new Response("Introuvable.", { status: 404 });
  const hex = row.content.startsWith("\\x") ? row.content.slice(2) : row.content;
  return new Response(Buffer.from(hex, "hex"), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
