import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isHigherOrg } from "@/features/university/config";
import { isUuid } from "@/lib/utils/search-params";

import { learnerBadgePages } from "../lib";

/** Badge imprimable d'un apprenant (impression / réimpression, compteur tenu). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/badges-apprenants/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Apprenant introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, "badge apprenant", { type: "students", id: studentId });
  const who = isHigherOrg(req.context.organization.type) ? "étudiant" : "apprenant";
  const pages = await learnerBadgePages(req, [studentId]);
  if (pages.length === 0) return errorResponse(409, `Aucun badge actif : générez d'abord le badge de l'${who}.`);
  const pdf = await renderToBuffer(
    <Document title={`Badge ${who}`} author="NEOSCOOL" language="fr">
      {pages}
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.learner_badge", `Badge ${who} imprimé`, { type: "students", id: studentId });
  return pdfResponse(pdf, `badge-${who}`, request.nextUrl.searchParams.has("telecharger"));
}
