import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isUuid } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

import { learnerBadgePages } from "../lib";

/** Carte imprimable d'un élève, apprenant ou étudiant (impression / réimpression, compteur tenu). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/badges-apprenants/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Titulaire introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, "carte", { type: "students", id: studentId });
  const who = vocabularyFor(req.context.organization.type).student.toLowerCase();
  const pages = await learnerBadgePages(req, [studentId]);
  if (pages.length === 0) return errorResponse(409, "Aucune carte active : générez d'abord la carte.");
  const pdf = await renderToBuffer(
    <Document title={`Carte ${who}`} author="NeoScool" language="fr">
      {pages}
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.learner_badge", `Carte ${who} imprimée`, { type: "students", id: studentId });
  return pdfResponse(pdf, `carte-${who}`, request.nextUrl.searchParams.has("telecharger"));
}
