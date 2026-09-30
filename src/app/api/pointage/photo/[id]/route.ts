import type { NextRequest } from "next/server";

import { errorResponse, loadFile } from "@/features/documents/server";
import { can, getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils/search-params";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Photo de la personne scannée, pour l'écran de la tablette de pointage.
 * Réservé aux comptes qui scannent (staff_attendance.scan) ; seule une photo
 * d'identité d'un élève ou d'un membre du personnel du MÊME établissement est
 * servie (jamais un justificatif ni un autre fichier).
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/pointage/photo/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Photo introuvable.");
  const context = await getSessionContext();
  if (!context) return errorResponse(401, "Session expirée.");
  if (!context.organization || !can(context, "staff_attendance.scan")) return errorResponse(403, "Accès refusé.");
  const organizationId = context.organization.id;
  const admin = createAdminClient();
  if (!admin) return errorResponse(500, "Service indisponible.");
  const [{ data: student }, { data: staff }] = await Promise.all([
    admin.from("students").select("id").eq("organization_id", organizationId).eq("photo_path", id).limit(1).maybeSingle(),
    admin.from("staff_members").select("id").eq("organization_id", organizationId).eq("photo_path", id).limit(1).maybeSingle(),
  ]);
  if (!student && !staff) return errorResponse(404, "Photo introuvable.");
  const file = await loadFile(admin, id);
  if (!file || !IMAGE_TYPES.includes(file.mime)) return errorResponse(404, "Photo introuvable.");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
