import type { NextRequest } from "next/server";

import { resolveYear } from "@/features/exports/data";
import { listFilters, uuidParam } from "@/features/exports/params";
import { exportClassLists, logDocumentEvent } from "@/features/exports/server";
import { errorResponse } from "@/features/documents/server";
import { can, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Listes d'élèves / étudiants / apprenants (PDF ou Excel) de l'établissement
 * actif : une liste séparée par classe (session, promotion, groupe), filtres
 * niveau / filière / parcours / groupe / sexe, photos sur demande. students.read requis.
 */
export async function GET(request: NextRequest) {
  const context = await getSessionContext();
  if (!context?.organization) return errorResponse(401, "Session expirée : reconnectez-vous.");
  const organization = context.organization;
  const supabase = await createClient();
  if (!can(context, "students.read")) {
    await logDocumentEvent(supabase, organization.id, "export.denied", "Export de liste refusé (droit students.read manquant)", { type: "classes", id: null }, "denied");
    return errorResponse(403, "Vous n'avez pas l'autorisation d'exporter les listes.");
  }
  const params = request.nextUrl.searchParams;
  const year = await resolveYear(organization.id, uuidParam(params, "annee"));
  if (!year) return errorResponse(404, "Aucune année académique.");
  const format = params.get("format") === "xlsx" ? "xlsx" : "pdf";
  const result = await exportClassLists(supabase, organization.id, organization.type, {
    format,
    filters: listFilters(params, year.id),
    withPhotos: params.get("photos") === "1",
    splitBySex: params.get("separer") === "1",
    yearName: year.name,
  });
  if (!result.ok) return errorResponse(result.status, result.message);
  await logDocumentEvent(
    supabase,
    organization.id,
    "export.class_list",
    `Export ${format.toUpperCase()} : ${result.sections} liste(s), ${result.students} inscrit(s)${params.get("photos") === "1" ? ", avec photos" : ""}`,
    { type: "classes", id: null },
  );
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `${format === "pdf" && params.get("telecharger") !== "1" ? "inline" : "attachment"}; filename="${result.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Export-Sections": String(result.sections),
      "X-Export-Students": String(result.students),
    },
  });
}
