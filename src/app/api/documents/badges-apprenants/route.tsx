import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isUuid } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

import { learnerBadgePages } from "./lib";

/** Cartes actives de toute une classe, session ou promotion (?session=<id>), vocabulaire du module. */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session") ?? "";
  if (!isUuid(sessionId)) return errorResponse(400, "Choisissez une session ou une promotion.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const v = vocabularyFor(req.context.organization.type);
  const group = v.klass.toLowerCase();
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, `cartes de la ${group}`, { type: "classes", id: sessionId });
  const { data: enrollments } = await req.supabase
    .from("enrollments")
    .select("student_id")
    .eq("organization_id", req.organization.id)
    .eq("class_id", sessionId)
    .eq("status", "validated");
  const ids = [...new Set((enrollments ?? []).map((e) => e.student_id))];
  const pages = ids.length ? await learnerBadgePages(req, ids) : [];
  if (pages.length === 0) return errorResponse(409, `Aucune carte active dans cette ${group} : générez d'abord les cartes.`);
  const pdf = await renderToBuffer(
    <Document title={`Cartes de la ${group}`} author="NeoScool" language="fr">
      {pages}
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.learner_badge", `${pages.length} carte(s) imprimée(s) (${group})`, { type: "classes", id: sessionId });
  return pdfResponse(pdf, `cartes-${group}`, request.nextUrl.searchParams.has("telecharger"));
}
