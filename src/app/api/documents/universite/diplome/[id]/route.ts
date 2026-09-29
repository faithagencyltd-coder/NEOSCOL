import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { isHigherOrg } from "@/features/university/config";
import { buildDiploma } from "@/features/university/documents";
import { isUuid } from "@/lib/utils/search-params";

/** Université : diplôme délivré (numéro du registre + QR de vérification ; « RÉVOQUÉ » le cas échéant). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/universite/diplome/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return errorResponse(404, "Diplôme introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!isHigherOrg(req.context.organization.type)) return errorResponse(404, "Document réservé à l'enseignement supérieur.");
  if (!hasAll(req, "documents.generate", "diplomas.manage")) return denyDocument(req, "diplôme", { type: "student_diplomas", id });

  const built = await buildDiploma(req.supabase, req.organization, id);
  if (!built) return errorResponse(404, "Diplôme introuvable.");
  const { snapshot, studentId } = built;
  const title = `${snapshot.title} — ${snapshot.student.last_name} ${snapshot.student.first_name} (${snapshot.number ?? ""})`;
  // Diplôme révoqué : simple copie marquée « RÉVOQUÉ », sans nouvelle émission.
  const prepared = await preparePages(req, snapshot, { mode: snapshot.status === "revoked" ? "copy" : "issue", title, studentId, subject: { type: "diploma", id }, reuse: true });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], "Diplôme");
  await logDocumentEvent(req.supabase, req.organization.id, "document.diploma", title, { type: "students", id: studentId });
  return pdfResponse(pdf, `diplome-${snapshot.number ?? snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
