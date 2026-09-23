import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildInvoiceSnapshot } from "@/features/documents/snapshots";
import { isUuid } from "@/lib/utils/search-params";

/** Facture : officielle (finances) ou copie pour la famille (RLS : factures émises de ses enfants). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/factures/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Facture introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const official = hasAll(req, "documents.generate", "finance.read");
  if (!official && !req.portal) return denyDocument(req, "facture", { type: "invoices", id });

  const snapshot = await buildInvoiceSnapshot(req.supabase, req.organization, id);
  if (!snapshot) return errorResponse(404, "Facture introuvable.");
  const prepared = await preparePages(req, snapshot, {
    mode: official && snapshot.invoice.status === "issued" ? "issue" : official ? "draft" : "copy",
    title: `Facture ${snapshot.invoice.number}`,
    studentId: snapshot.student.id,
    subject: { type: "invoice", id },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], `Facture ${snapshot.invoice.number}`);
  await logDocumentEvent(req.supabase, req.organization.id, "document.invoice", `Facture ${snapshot.invoice.number}`, { type: "invoices", id });
  return pdfResponse(pdf, `facture-${snapshot.invoice.number}`, request.nextUrl.searchParams.has("telecharger"));
}
