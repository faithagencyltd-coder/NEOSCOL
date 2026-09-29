import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { universityConfigOf } from "@/features/university/config";
import { buildUniversityTranscript } from "@/features/university/documents";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Université : relevé de notes LMD d'un semestre (?semestre=<période>).
 * Réservé à la scolarité / au jury (documents.generate + deliberations.read ou
 * grades.manage) ; numéroté et vérifiable par QR. PROVISOIRE tant que les
 * résultats ne sont pas publiés par la clôture de la délibération.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/universite/releve/[studentId]">) {
  const { studentId } = await ctx.params;
  const periodId = request.nextUrl.searchParams.get("semestre") ?? "";
  if (!isUuid(studentId)) return errorResponse(404, "Étudiant introuvable.");
  if (!isUuid(periodId)) return errorResponse(400, "Choisissez le semestre.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const university = universityConfigOf(req.context.organization.type, req.context.organization.settings);
  if (!university) return errorResponse(404, "Document réservé à l'enseignement supérieur.");
  const allowed = hasAll(req, "documents.generate") && (hasAll(req, "deliberations.read") || hasAll(req, "grades.manage"));
  if (!allowed) return denyDocument(req, "relevé de notes universitaire", { type: "students", id: studentId });

  const snapshot = await buildUniversityTranscript(req.supabase, req.organization, studentId, periodId, {
    ranking: university.features.ranking,
    passMark: university.rules.pass_mark,
  });
  if (!snapshot) return errorResponse(404, "Aucun résultat calculé pour ce semestre.");
  const title = `Relevé de notes ${snapshot.period} ${snapshot.year ?? ""} — ${snapshot.student.last_name} ${snapshot.student.first_name}`;
  const prepared = await preparePages(req, snapshot, { mode: "issue", title, studentId, subject: { type: "student", id: studentId }, reuse: true });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], "Relevé de notes");
  await logDocumentEvent(req.supabase, req.organization.id, "document.university_transcript", `${title} — ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `releve-${snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
