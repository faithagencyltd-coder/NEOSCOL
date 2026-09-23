import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildCommitmentSnapshot, buildEnrollmentFormSnapshot } from "@/features/documents/snapshots";
import { isUuid } from "@/lib/utils/search-params";

/** Fiche d'inscription (?type=fiche) ou engagement du parent (?type=engagement). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/inscriptions/[enrollmentId]">) {
  const { enrollmentId } = await ctx.params;
  if (!isUuid(enrollmentId)) return errorResponse(404, "Inscription introuvable.");
  const commitment = request.nextUrl.searchParams.get("type") === "engagement";
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.generate", "enrollments.read")) {
    return denyDocument(req, commitment ? "engagement" : "fiche d'inscription", { type: "enrollments", id: enrollmentId });
  }
  const snapshot = commitment
    ? await buildCommitmentSnapshot(req.supabase, req.organization, enrollmentId)
    : await buildEnrollmentFormSnapshot(req.supabase, req.organization, enrollmentId);
  if (!snapshot) return errorResponse(404, "Inscription introuvable.");
  const label = commitment ? "Engagement" : "Fiche d'inscription";
  const prepared = await preparePages(req, snapshot, {
    mode: "issue",
    title: `${label} ${snapshot.enrollment.reference}`,
    studentId: snapshot.student.id,
    subject: { type: "enrollment", id: enrollmentId },
    reuse: true,
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], `${label} ${snapshot.enrollment.reference}`);
  await logDocumentEvent(req.supabase, req.organization.id, commitment ? "document.commitment_form" : "document.enrollment_form", `${label} ${snapshot.enrollment.reference}`, { type: "enrollments", id: enrollmentId });
  return pdfResponse(pdf, `${commitment ? "engagement" : "fiche-inscription"}-${snapshot.enrollment.reference}`, request.nextUrl.searchParams.has("telecharger"));
}
