import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { loadStudentCard } from "@/features/cards/server";
import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { StudentCardPdfPages } from "@/features/documents/pdf/student-card";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isUuid } from "@/lib/utils/search-params";

/** Carte imprimable (recto + verso, format CR80) ; impression comptée. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cartes/[studentId]/pdf">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Titulaire introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, "carte", { type: "students", id: studentId });
  const loaded = await loadStudentCard(req.supabase, req.organization.id, studentId);
  if (!loaded) return errorResponse(404, "Titulaire introuvable.");
  if (!loaded.badge) return errorResponse(409, "Aucune carte active : générez d'abord la carte.");
  const pdf = await renderToBuffer(
    <Document title={`${loaded.card.title} — ${loaded.card.holder.lastName} ${loaded.card.holder.firstName}`} author="NeoScool" language="fr">
      <StudentCardPdfPages card={loaded.card} design={loaded.design} />
    </Document>,
  );
  await req.supabase
    .from("student_badges")
    .update({ printed_count: loaded.badge.printed_count + 1, last_printed_at: new Date().toISOString() })
    .eq("id", loaded.badge.id);
  await logDocumentEvent(req.supabase, req.organization.id, "document.student_card", `${loaded.card.title} imprimée`, { type: "students", id: studentId });
  return pdfResponse(pdf, `carte-${loaded.card.holder.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
