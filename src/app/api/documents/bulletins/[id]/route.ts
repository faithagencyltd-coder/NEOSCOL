import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildReportCardSnapshots } from "@/features/documents/snapshots";
import { featureEnabled } from "@/lib/features";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Bulletin PDF d'un élève.
 * · Administration (documents.generate + report_cards.manage/publish) : PDF officiel
 *   numéroté si publié, « PROVISOIRE » sinon.
 * · Parent / élève : copie de SON bulletin publié (RLS : restrictions d'impayé).
 * · Enseignant : refus serveur (aperçu à l'écran uniquement).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/bulletins/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Bulletin introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;

  const official = hasAll(req, "documents.generate") && (hasAll(req, "report_cards.manage") || hasAll(req, "report_cards.publish"));
  if (!official && !req.portal) return denyDocument(req, "bulletin", { type: "report_cards", id });

  const [snapshot] = await buildReportCardSnapshots(req.supabase, req.organization, { id }, featureEnabled(req.context.organization, "ranking"));
  if (!snapshot || (!official && snapshot.card.status !== "published")) return errorResponse(404, "Bulletin introuvable ou non publié.");

  const published = snapshot.card.status === "published";
  const prepared = await preparePages(req, snapshot, {
    mode: official ? (published ? "issue" : "draft") : "copy",
    title: `Bulletin ${snapshot.period} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
    studentId: snapshot.student.id,
    subject: { type: "report_card", id },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  if (official && prepared.document) {
    await req.supabase.from("report_cards").update({ issued_document_id: prepared.document.id }).eq("id", id).is("issued_document_id", null);
  }
  const pdf = await renderPages([prepared.pages], "Bulletin de notes");
  await logDocumentEvent(req.supabase, req.organization.id, "document.report_card", `Bulletin ${snapshot.student.matricule} — ${snapshot.period}${published ? "" : " (provisoire)"}`, { type: "report_cards", id });
  return pdfResponse(pdf, `bulletin-${snapshot.student.matricule}-${snapshot.period}`, request.nextUrl.searchParams.has("telecharger"));
}
