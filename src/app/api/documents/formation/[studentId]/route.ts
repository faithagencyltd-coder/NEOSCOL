import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { isTrainingOrg } from "@/features/training/config";
import { buildCompetencySheet, buildTrainingTranscript } from "@/features/training/documents";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Formation professionnelle : relevé de notes de formation (?document=releve)
 * ou fiche de compétences (?document=competences), remplis automatiquement,
 * numérotés et vérifiables par QR code.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/formation/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Apprenant introuvable.");
  const which = request.nextUrl.searchParams.get("document") === "competences" ? "competences" : "releve";
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!isTrainingOrg(req.organization.type)) return errorResponse(404, "Document réservé aux centres de formation.");
  const label = which === "releve" ? "relevé de notes de formation" : "fiche de compétences";
  if (!hasAll(req, "documents.generate")) return denyDocument(req, label, { type: "students", id: studentId });

  const snapshot = which === "releve" ? await buildTrainingTranscript(req.supabase, req.organization, studentId) : await buildCompetencySheet(req.supabase, req.organization, studentId);
  if (!snapshot) return errorResponse(404, "Aucune inscription en formation pour cet apprenant.");
  const title = `${which === "releve" ? "Relevé de notes de formation" : "Fiche de compétences"} — ${snapshot.student.last_name} ${snapshot.student.first_name}`;
  const prepared = await preparePages(req, snapshot, { mode: "issue", title, studentId, subject: { type: "student", id: studentId } });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], title);
  await logDocumentEvent(req.supabase, req.organization.id, `document.${snapshot.kind}`, `${title} — ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `${which === "releve" ? "releve-formation" : "fiche-competences"}-${snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
