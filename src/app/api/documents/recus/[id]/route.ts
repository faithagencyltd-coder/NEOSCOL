import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildReceiptSnapshot } from "@/features/documents/snapshots";
import { isUuid } from "@/lib/utils/search-params";

/** Reçu de paiement : officiel (finances) ou copie pour la famille (RLS). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/recus/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Paiement introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const official = hasAll(req, "documents.generate", "finance.read");
  if (!official && !req.portal) return denyDocument(req, "reçu", { type: "payments", id });

  const snapshot = await buildReceiptSnapshot(req.supabase, req.organization, id);
  if (!snapshot) return errorResponse(404, "Paiement introuvable.");
  const prepared = await preparePages(req, snapshot, {
    mode: official ? "issue" : "copy",
    title: `Reçu ${snapshot.payment.number}`,
    studentId: snapshot.student.id,
    subject: { type: "payment", id },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], `Reçu ${snapshot.payment.number}`);
  await logDocumentEvent(req.supabase, req.organization.id, "document.receipt", `Reçu ${snapshot.payment.number}`, { type: "payments", id });
  return pdfResponse(pdf, `recu-${snapshot.payment.number}`, request.nextUrl.searchParams.has("telecharger"));
}
