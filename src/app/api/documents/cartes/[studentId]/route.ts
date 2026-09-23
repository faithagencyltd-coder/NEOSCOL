import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildStudentCardSnapshot } from "@/features/documents/snapshots";
import { isUuid } from "@/lib/utils/search-params";

/** Carte scolaire (format carte bancaire) avec photo et QR de vérification. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/cartes/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.generate")) return denyDocument(req, "carte scolaire", { type: "students", id: studentId });
  const snapshot = await buildStudentCardSnapshot(req.supabase, req.organization, studentId);
  if (!snapshot) return errorResponse(404, "Élève introuvable.");
  const prepared = await preparePages(req, snapshot, {
    mode: "issue",
    title: `Carte scolaire ${snapshot.year ?? ""} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
    studentId,
    subject: { type: "student", id: studentId },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], "Carte scolaire");
  await logDocumentEvent(req.supabase, req.organization.id, "document.student_card", `Carte scolaire ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `carte-${snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
