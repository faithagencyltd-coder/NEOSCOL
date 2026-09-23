import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, loadImages, logDocumentEvent, pdfResponse, renderPages, snapshotPages, snapshotPhoto, verificationFor } from "@/features/documents/server";
import type { DocumentSnapshot } from "@/features/documents/types";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Réédition à l'identique d'un document déjà émis, depuis son instantané.
 * Personnel : documents.read. Familles : leurs documents valides (RLS, restrictions d'impayé).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/emis/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Document introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.read") && !req.portal) return denyDocument(req, "document émis", { type: "issued_documents", id });

  const { data: document } = await req.supabase
    .from("issued_documents")
    .select("id, number, verification_code, issued_at, status, title, data")
    .eq("organization_id", req.organization.id)
    .eq("id", id)
    .maybeSingle();
  const snapshot = document?.data as DocumentSnapshot | undefined;
  if (!document || !snapshot || typeof snapshot !== "object" || !("kind" in snapshot)) return errorResponse(404, "Document introuvable.");
  const verification = await verificationFor(document, req.origin, req.organization.primary_color);
  const images = await loadImages(req.supabase, req.organization, snapshotPhoto(snapshot));
  const pdf = await renderPages([snapshotPages(snapshot, images, verification, document.issued_at)], document.title);
  await logDocumentEvent(req.supabase, req.organization.id, "document.reissue", `Réédition ${document.number}`, { type: "issued_documents", id });
  return pdfResponse(pdf, document.number, request.nextUrl.searchParams.has("telecharger"));
}
