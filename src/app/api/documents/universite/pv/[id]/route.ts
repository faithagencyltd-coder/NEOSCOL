import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { isHigherOrg } from "@/features/university/config";
import { buildDeliberationMinutes } from "@/features/university/documents";
import { isUuid } from "@/lib/utils/search-params";

/** Université : procès-verbal de délibération (PROVISOIRE tant que la délibération est ouverte). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/universite/pv/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Délibération introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!isHigherOrg(req.context.organization.type)) return errorResponse(404, "Document réservé à l'enseignement supérieur.");
  if (!hasAll(req, "documents.generate", "deliberations.read")) return denyDocument(req, "procès-verbal de délibération", { type: "deliberations", id });

  const snapshot = await buildDeliberationMinutes(req.supabase, req.organization, id);
  if (!snapshot) return errorResponse(404, "Délibération introuvable.");
  const title = `Procès-verbal — ${snapshot.title} (${snapshot.promotion})`;
  // PV provisoire (délibération ouverte) : non numéroté. PV définitif : numéroté, vérifiable, réutilisé tant qu'il est identique.
  const prepared = await preparePages(req, snapshot, {
    mode: snapshot.status === "closed" ? "issue" : "draft",
    title,
    studentId: null,
    subject: { type: "deliberation", id },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], "Procès-verbal de délibération");
  await logDocumentEvent(req.supabase, req.organization.id, "document.deliberation_minutes", title, { type: "deliberations", id });
  return pdfResponse(pdf, "proces-verbal-deliberation", request.nextUrl.searchParams.has("telecharger"));
}
