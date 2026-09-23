import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse, renderPages } from "@/features/documents/server";
import { buildCertificateSnapshot } from "@/features/documents/snapshots";
import { TEMPLATE_DEFAULTS } from "@/features/documents/templates";
import { TEXT_DOCUMENT_KINDS, type TextDocumentKind } from "@/features/documents/types";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Documents rédigés (Document Studio) : certificat de scolarité, attestation,
 * certificat de formation, convocation, contrat, document personnalisé
 * (?modele=<id>). Chaque délivrance reçoit un numéro et un QR propres.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/certificats/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const search = request.nextUrl.searchParams;
  const requested = search.get("type") ?? "school_certificate";
  const type: TextDocumentKind = (TEXT_DOCUMENT_KINDS as readonly string[]).includes(requested) ? (requested as TextDocumentKind) : "school_certificate";
  const defaults = TEMPLATE_DEFAULTS[type];
  const purpose = search.get("motif")?.trim().slice(0, 600) || null;
  const templateId = search.get("modele");
  if (defaults.content?.required && !purpose) return errorResponse(400, `${defaults.content.label} : champ obligatoire.`);
  if (type === "custom" && !isUuid(templateId ?? undefined)) return errorResponse(400, "Choisissez le modèle de document.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.generate")) return denyDocument(req, defaults.label.toLowerCase(), { type: "students", id: studentId });

  const snapshot = await buildCertificateSnapshot(req.supabase, req.organization, studentId, type, purpose, type === "custom" ? templateId : null);
  if (!snapshot) return errorResponse(404, type === "custom" ? "Modèle ou élève introuvable." : "Élève introuvable.");
  const label = type === "custom" ? snapshot.title : defaults.label;
  const prepared = await preparePages(req, snapshot, {
    mode: "issue",
    title: `${label} — ${snapshot.student.last_name} ${snapshot.student.first_name}`,
    studentId,
    subject: { type: "student", id: studentId },
  });
  if ("error" in prepared) return errorResponse(500, prepared.error);
  const pdf = await renderPages([prepared.pages], snapshot.title);
  await logDocumentEvent(req.supabase, req.organization.id, `document.${type}`, `${snapshot.title} — ${snapshot.student.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `${type.replace(/_/g, "-")}-${snapshot.student.matricule}`, search.has("telecharger"));
}
