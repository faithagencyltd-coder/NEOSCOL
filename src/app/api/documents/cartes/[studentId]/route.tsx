import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { loadStudentCard } from "@/features/cards/server";
import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { StudentCardPdfPages } from "@/features/documents/pdf/student-card";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Carte scolaire / apprenant / étudiant depuis les Documents : un seul modèle,
 * celui de la carte 3D (design de l'établissement, recto + verso CR80). L'ancien
 * modèle plat n'est plus produit ; les cartes déjà délivrées restent vérifiables.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/cartes/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.generate")) return denyDocument(req, "carte", { type: "students", id: studentId });
  const loaded = await loadStudentCard(req.supabase, req.organization.id, studentId);
  if (!loaded) return errorResponse(404, "Élève introuvable.");
  if (!loaded.badge) return errorResponse(409, "Aucune carte active : générez d'abord la carte dans le dossier (onglet Badge & QR) ou dans Cartes scolaires.");
  const pdf = await renderToBuffer(
    <Document title={`${loaded.card.title} — ${loaded.card.holder.lastName} ${loaded.card.holder.firstName}`} author="NeoScool" language="fr">
      <StudentCardPdfPages card={loaded.card} design={loaded.design} />
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.student_card", `${loaded.card.title} ${loaded.card.holder.matricule}`, { type: "students", id: studentId });
  return pdfResponse(pdf, `carte-${loaded.card.holder.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
