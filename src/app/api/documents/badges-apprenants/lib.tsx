import "server-only";

import type { DocumentRequest } from "@/features/documents/generate";
import { LearnerBadgePage } from "@/features/documents/pdf/badge";
import { loadImages } from "@/features/documents/server";
import { qrDataUrl } from "@/lib/pdf/qr";

/** Pages des badges actifs des apprenants demandés (le QR contient le jeton du badge ACTIF). */
export async function learnerBadgePages(req: DocumentRequest, studentIds: string[]) {
  const { data: badges } = await req.supabase
    .from("student_badges")
    .select("id, number, token, status, printed_count, student:students(id, first_name, last_name, matricule, photo_path)")
    .eq("organization_id", req.organization.id)
    .eq("status", "active")
    .in("student_id", studentIds);
  const { data: enrollments } = await req.supabase
    .from("enrollments")
    .select("student_id, created_at, group:training_groups(name), class:classes!inner(name, kind, program:programs(name))")
    .eq("organization_id", req.organization.id)
    .eq("status", "validated")
    .eq("class.kind", "training_session")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });
  const pages = [];
  for (const badge of (badges ?? []).sort((a, b) => `${a.student?.last_name}`.localeCompare(`${b.student?.last_name}`, "fr"))) {
    if (!badge.student) continue;
    const enrollment = (enrollments ?? []).find((e) => e.student_id === badge.student!.id);
    const images = await loadImages(req.supabase, req.organization, badge.student.photo_path);
    pages.push(
      <LearnerBadgePage
        key={badge.id}
        images={images}
        data={{
          organization: req.organization,
          learner: { first_name: badge.student.first_name, last_name: badge.student.last_name, matricule: badge.student.matricule },
          formation: enrollment?.class?.program?.name ?? null,
          session: enrollment?.class?.name ?? null,
          group: enrollment?.group?.name ?? null,
          badge: { number: badge.number, status: badge.status },
          qr: await qrDataUrl(`NEOSCOL-BADGE:${badge.token}`, "#000000"),
        }}
      />,
    );
    await req.supabase
      .from("student_badges")
      .update({ printed_count: badge.printed_count + 1, last_printed_at: new Date().toISOString() })
      .eq("id", badge.id);
  }
  return pages;
}
