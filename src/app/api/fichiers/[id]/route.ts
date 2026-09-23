import type { NextRequest } from "next/server";

import { errorResponse, loadFile } from "@/features/documents/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { safeFileName } from "@/lib/pdf/format";
import { isUuid } from "@/lib/utils/search-params";

/** Fichier stocké en base (photo, justificatif…) : la RLS décide de l'accès. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/fichiers/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Fichier introuvable.");
  if (!(await getSessionContext())) return errorResponse(401, "Session expirée.");
  const file = await loadFile(await createClient(), id);
  if (!file) return errorResponse(404, "Fichier introuvable.");
  const download = request.nextUrl.searchParams.has("telecharger");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(file.name)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
