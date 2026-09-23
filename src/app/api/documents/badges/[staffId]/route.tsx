import { Document } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { StaffBadgePage } from "@/features/documents/pdf/badge";
import { errorResponse, loadImages, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { qrDataUrl } from "@/lib/pdf/qr";
import { isUuid } from "@/lib/utils/search-params";

/** Badge professionnel imprimable : le QR contient le jeton du badge ACTIF (pointage). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/badges/[staffId]">) {
  const { staffId } = await ctx.params;
  if (!isUuid(staffId)) return errorResponse(404, "Membre du personnel introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "staff.badges.manage")) return denyDocument(req, "badge", { type: "staff_members", id: staffId });

  const [{ data: staff }, { data: badge }] = await Promise.all([
    req.supabase
      .from("staff_members")
      .select("first_name, last_name, job_title, employee_number, photo_path")
      .eq("organization_id", req.organization.id)
      .eq("id", staffId)
      .maybeSingle(),
    req.supabase
      .from("staff_badges")
      .select("id, number, token, status, printed_count, academic_year:academic_years(name)")
      .eq("organization_id", req.organization.id)
      .eq("staff_id", staffId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!staff) return errorResponse(404, "Membre du personnel introuvable.");
  if (!badge) return errorResponse(409, "Aucun badge actif : générez d'abord un badge.");

  const images = await loadImages(req.supabase, req.organization, staff.photo_path);
  const pdf = await renderToBuffer(
    <Document title={`Badge ${badge.number}`} author="NéoScol" language="fr">
      <StaffBadgePage
        images={images}
        data={{
          organization: req.organization,
          staff: { first_name: staff.first_name, last_name: staff.last_name, job_title: staff.job_title, employee_number: staff.employee_number ?? "" },
          badge: { number: badge.number, year: badge.academic_year?.name ?? null, status: badge.status },
          qr: await qrDataUrl(`NEOSCOL-BADGE:${badge.token}`, "#000000"),
        }}
      />
    </Document>,
  );
  await req.supabase
    .from("staff_badges")
    .update({ printed_count: badge.printed_count + 1, last_printed_at: new Date().toISOString() })
    .eq("id", badge.id);
  await logDocumentEvent(req.supabase, req.organization.id, "document.staff_badge", `Badge ${badge.number} — ${staff.last_name} ${staff.first_name}`, { type: "staff_badges", id: badge.id });
  return pdfResponse(pdf, `badge-${badge.number}`, request.nextUrl.searchParams.has("telecharger"));
}
