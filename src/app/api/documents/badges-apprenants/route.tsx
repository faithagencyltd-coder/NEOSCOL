import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { errorResponse, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { isHigherOrg } from "@/features/university/config";
import { isUuid } from "@/lib/utils/search-params";

import { learnerBadgePages } from "./lib";

/** Planche des badges actifs de tous les apprenants d'une session (?session=<id>). */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session") ?? "";
  if (!isUuid(sessionId)) return errorResponse(400, "Choisissez une session ou une promotion.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  const group = isHigherOrg(req.context.organization.type) ? "promotion" : "session";
  if (!hasAll(req, "students.badges.manage")) return denyDocument(req, "badges de la session", { type: "classes", id: sessionId });
  const { data: enrollments } = await req.supabase
    .from("enrollments")
    .select("student_id")
    .eq("organization_id", req.organization.id)
    .eq("class_id", sessionId)
    .eq("status", "validated");
  const ids = [...new Set((enrollments ?? []).map((e) => e.student_id))];
  const pages = ids.length ? await learnerBadgePages(req, ids) : [];
  if (pages.length === 0) return errorResponse(409, `Aucun badge actif dans cette ${group} : générez d'abord les badges.`);
  const pdf = await renderToBuffer(
    <Document title={`Badges de la ${group}`} author="NéoScol" language="fr">
      {pages}
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.learner_badge", `${pages.length} badge(s) apprenant imprimé(s)`, { type: "classes", id: sessionId });
  return pdfResponse(pdf, `badges-${group}`, request.nextUrl.searchParams.has("telecharger"));
}
