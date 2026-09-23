import { Document, renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { denyDocument, hasAll, openDocumentRequest } from "@/features/documents/generate";
import { StaffBadgePage } from "@/features/documents/pdf/badge";
import { errorResponse, loadImages, logDocumentEvent, pdfResponse } from "@/features/documents/server";
import { qrDataUrl } from "@/lib/pdf/qr";

/** Tous les badges actifs (une page par badge), filtrables : ?type=enseignants|administratif. */
export async function GET(request: NextRequest) {
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "staff.badges.manage")) return denyDocument(req, "badges", { type: "staff_badges", id: null });
  const type = request.nextUrl.searchParams.get("type");

  let query = req.supabase
    .from("staff_badges")
    .select("id, number, token, status, staff:staff_members!inner(first_name, last_name, job_title, employee_number, photo_path, is_teacher, archived_at), academic_year:academic_years(name)")
    .eq("organization_id", req.organization.id)
    .eq("status", "active")
    .is("staff.archived_at", null);
  if (type === "enseignants") query = query.eq("staff.is_teacher", true);
  if (type === "administratif") query = query.eq("staff.is_teacher", false);
  const { data: badges } = await query;
  if (!badges?.length) return errorResponse(404, "Aucun badge actif à imprimer.");
  badges.sort((a, b) => (a.staff?.last_name ?? "").localeCompare(b.staff?.last_name ?? "", "fr"));

  const pages = await Promise.all(
    badges.map(async (badge) => ({
      badge,
      images: await loadImages(req.supabase, req.organization, badge.staff?.photo_path),
      qr: await qrDataUrl(`NEOSCOL-BADGE:${badge.token}`, "#000000"),
    })),
  );
  const pdf = await renderToBuffer(
    <Document title="Badges du personnel" author="NéoScol" language="fr">
      {pages.map(({ badge, images, qr }) => (
        <StaffBadgePage
          key={badge.id}
          images={images}
          data={{
            organization: req.organization,
            staff: {
              first_name: badge.staff?.first_name ?? "",
              last_name: badge.staff?.last_name ?? "",
              job_title: badge.staff?.job_title ?? null,
              employee_number: badge.staff?.employee_number ?? "",
            },
            badge: { number: badge.number, year: badge.academic_year?.name ?? null, status: badge.status },
            qr,
          }}
        />
      ))}
    </Document>,
  );
  await logDocumentEvent(req.supabase, req.organization.id, "document.staff_badge", `Impression groupée de ${badges.length} badge(s)`, { type: "staff_badges", id: null });
  return pdfResponse(pdf, "badges-du-personnel", request.nextUrl.searchParams.has("telecharger"));
}
