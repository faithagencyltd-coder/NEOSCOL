import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildCertificateSnapshot } from "@/features/documents/snapshots";
import { isUuid } from "@/lib/utils/search-params";

/** Certificat de scolarité / attestation : chaque délivrance reçoit un numéro et un QR propres. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/certificats/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const type = request.nextUrl.searchParams.get("type") === "attestation" ? "attestation" : "school_certificate";
  const purpose = request.nextUrl.searchParams.get("motif")?.trim().slice(0, 300) || null;
  if (type === "attestation" && !purpose) return errorResponse(400, "L'objet de l'attestation est obligatoire.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.generate")) return denyDocument(req, type === "attestation" ? "attestation" : "certificat de scolarité", { type: "students", id: studentId });

  const snapshot = await buildCertificateSnapshot(req.supabase, req.organization, studentId, type, purpose);
  if (!snapshot) return errorResponse(404, "Élève introuvable.");
  const prepared = await preparePages(req, snapshot, {
    mode: "issue",
    title: `${type === "attestation" ? "Attestation" : "Certificat de scolarité"} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
    studentId,
    subject: { type: "student", id: studentId },
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], snapshot.title);
  await logDocumentEvent(req.supabase, req.organization.id, `document.${type}`, `${snapshot.title} — ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `${type === "attestation" ? "attestation" : "certificat"}-${snapshot.student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
