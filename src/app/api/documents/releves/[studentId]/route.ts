import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildTranscriptSnapshot } from "@/features/documents/snapshots";
import { featureEnabled } from "@/lib/features";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Relevé de notes annuel (bulletins publiés). Mêmes règles que le bulletin
 * officiel : administration (documents.generate + report_cards.manage/publish)
 * uniquement ; l'enseignant est refusé côté serveur.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/releves/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const official = hasAll(req, "documents.generate") && (hasAll(req, "report_cards.manage") || hasAll(req, "report_cards.publish"));
  if (!official) return denyDocument(req, "relevé de notes", { type: "students", id: studentId });

  const snapshot = await buildTranscriptSnapshot(req.supabase, req.organization, studentId, featureEnabled(req.context.organization, "ranking"));
  if (!snapshot) return errorResponse(404, "Élève introuvable.");
  if (snapshot.periods.length === 0) return errorResponse(404, "Aucun bulletin publié cette année : le relevé de notes est vide.");
  const prepared = await preparePages(req, snapshot, {
    mode: "issue",
    title: `Relevé de notes ${snapshot.year ?? ""} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
    studentId,
    subject: { type: "student", id: studentId },
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], "Relevé de notes");
  await logDocumentEvent(req.supabase, req.organization.id, "document.transcript", `Relevé de notes — ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `releve-${snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
