import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildReportCardSnapshots } from "@/features/documents/snapshots";
import { featureEnabled } from "@/lib/features";
import { isUuid } from "@/lib/utils/search-params";

/** « Générer les bulletins de la classe » : un PDF, un bulletin publié par page. Administration uniquement. */
export async function GET(request: NextRequest) {
  const classId = request.nextUrl.searchParams.get("classe") ?? "";
  const periodId = request.nextUrl.searchParams.get("periode") ?? "";
  if (!isUuid(classId) || !isUuid(periodId)) return errorResponse(400, "Classe ou période invalide.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!(hasAll(req, "documents.generate") && (hasAll(req, "report_cards.manage") || hasAll(req, "report_cards.publish")))) {
    return denyDocument(req, "bulletins de classe", { type: "classes", id: classId });
  }
  const snapshots = (
    await buildReportCardSnapshots(req.supabase, req.organization, { classId, periodId }, featureEnabled(req.context.organization, "ranking"))
  ).filter((s) => s.card.status === "published");
  if (snapshots.length === 0) return errorResponse(404, "Aucun bulletin publié pour cette classe et cette période.");

  const pages = [];
  for (const snapshot of snapshots) {
    const prepared = await preparePages(req, snapshot, {
      mode: "issue",
      title: `Bulletin ${snapshot.period} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
      studentId: snapshot.student.id,
      subject: { type: "report_card", id: snapshot.card.id },
      reuse: true,
    });
    if ("error" in prepared) return errorResponse(500, prepared.error);
    if (prepared.document) {
      await req.supabase.from("report_cards").update({ issued_document_id: prepared.document.id }).eq("id", snapshot.card.id).is("issued_document_id", null);
    }
    pages.push(prepared.pages);
  }
  const first = snapshots[0]!;
  const pdf = await renderPages(pages, `Bulletins ${first.class_name} — ${first.period}`);
  await logDocumentEvent(req.supabase, req.organization.id, "document.report_cards_class", `${snapshots.length} bulletin(s) ${first.class_name} — ${first.period}`, { type: "classes", id: classId });
  return pdfResponse(pdf, `bulletins-${first.class_name}-${first.period}`, request.nextUrl.searchParams.has("telecharger"));
}
