import type { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReactElement } from "react";

import { DOSSIER_SECTIONS, dossierOrder, type DossierSectionKey } from "@/features/documents/dossier";
import { denyDocument, hasAll, openDocumentRequest, preparePages } from "@/features/documents/generate";
import {
  errorResponse,
  loadFile,
  loadImages,
  logDocumentEvent,
  pdfResponse,
  renderPages,
  snapshotPages,
  snapshotPhoto,
  verificationFor,
} from "@/features/documents/server";
import {
  buildCommitmentSnapshot,
  buildEnrollmentFormSnapshot,
  buildInvoiceSnapshot,
  buildReceiptSnapshot,
  buildReportCardSnapshots,
} from "@/features/documents/snapshots";
import type { DocumentSnapshot, DossierSnapshot } from "@/features/documents/types";
import { featureEnabled } from "@/lib/features";
import { isUuid } from "@/lib/utils/search-params";

const A4: [number, number] = [595.28, 841.89];

/**
 * « Générer le dossier complet PDF » : fiche d'inscription, engagement,
 * factures, reçus, certificats, bulletins et pièces jointes fusionnés en UN
 * seul PDF, dans l'ordre demandé. Rôles autorisés : documents.dossier.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documents/dossiers/[studentId]">) {
  const { studentId } = await ctx.params;
  if (!isUuid(studentId)) return errorResponse(404, "Élève introuvable.");
  const req = await openDocumentRequest(request);
  if (req instanceof Response) return req;
  if (!hasAll(req, "documents.dossier", "documents.generate")) return denyDocument(req, "dossier complet", { type: "students", id: studentId });

  const { supabase, organization } = req;
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, matricule, sex, birth_date, birth_place, photo_path")
    .eq("organization_id", organization.id)
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return errorResponse(404, "Élève introuvable.");

  const settings = req.context.organization.settings as Record<string, unknown> | null;
  const saved = (settings?.documents as Record<string, unknown> | undefined)?.dossier_sections;
  const order = dossierOrder(request.nextUrl.searchParams.get("ordre"), saved);

  const [{ data: enrollments }, { data: invoices }, { data: payments }, { data: issued }, { data: justifications }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, created_at, class:classes(name), academic_year:academic_years(is_current)")
      .eq("student_id", studentId)
      .in("status", ["pending", "validated"])
      .order("created_at"),
    supabase.from("invoices").select("id").eq("student_id", studentId).eq("status", "issued").order("issued_on"),
    supabase.from("payments").select("id").eq("student_id", studentId).eq("status", "completed").order("paid_at"),
    supabase
      .from("issued_documents")
      .select("id, number, verification_code, issued_at, data")
      .eq("student_id", studentId)
      .eq("status", "valid")
      .in("kind", ["school_certificate", "attestation", "training_certificate", "convocation", "contract", "custom", "transcript", "student_card"])
      .order("issued_at"),
    supabase.from("absence_justifications").select("id").eq("student_id", studentId),
  ]);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  const latest = [...(enrollments ?? [])].reverse().find((e) => e.status === "validated") ?? null;

  const pages: ReactElement[] = [];
  const counts = new Map<DossierSectionKey, number>();
  const attachments: { name: string; mime: string; bytes: Buffer }[] = [];
  const failure = (message: string) => errorResponse(500, message);

  const issue = async (snapshot: DocumentSnapshot | null, title: string, subject: Parameters<typeof preparePages>[2]["subject"]) => {
    if (!snapshot) return null;
    const prepared = await preparePages(req, snapshot, { mode: "issue", title, studentId, subject, reuse: true });
    if ("error" in prepared) throw new Error(prepared.error);
    return prepared.pages;
  };

  try {
    for (const section of order) {
      const before = pages.length;
      if (section === "fiche") {
        for (const e of enrollments ?? []) {
          const page = await issue(await buildEnrollmentFormSnapshot(supabase, organization, e.id), "Fiche d'inscription", { type: "enrollment", id: e.id });
          if (page) pages.push(page);
        }
      } else if (section === "engagement" && latest) {
        const page = await issue(await buildCommitmentSnapshot(supabase, organization, latest.id), "Engagement", { type: "enrollment", id: latest.id });
        if (page) pages.push(page);
      } else if (section === "factures") {
        for (const invoice of invoices ?? []) {
          const snapshot = await buildInvoiceSnapshot(supabase, organization, invoice.id);
          const page = await issue(snapshot, `Facture ${snapshot?.invoice.number ?? ""}`, { type: "invoice", id: invoice.id });
          if (page) pages.push(page);
        }
      } else if (section === "recus") {
        for (const payment of payments ?? []) {
          const snapshot = await buildReceiptSnapshot(supabase, organization, payment.id);
          const page = await issue(snapshot, `Reçu ${snapshot?.payment.number ?? ""}`, { type: "payment", id: payment.id });
          if (page) pages.push(page);
        }
      } else if (section === "certificats") {
        for (const doc of issued ?? []) {
          const snapshot = doc.data as DocumentSnapshot | null;
          if (!snapshot || typeof snapshot !== "object" || !("kind" in snapshot)) continue;
          const images = await loadImages(supabase, organization, snapshotPhoto(snapshot));
          pages.push(snapshotPages(snapshot, images, await verificationFor(doc, req.origin, organization.primary_color), doc.issued_at));
        }
      } else if (section === "bulletins") {
        const cards = await buildReportCardSnapshots(supabase, organization, { studentId, publishedOnly: true }, featureEnabled(req.context.organization, "ranking"));
        for (const card of cards) {
          const page = await issue(card, `Bulletin ${card.period}`, { type: "report_card", id: card.card.id });
          if (page) pages.push(page);
        }
      } else if (section === "pieces") {
        const owners = [
          `and(owner_type.eq.student,owner_id.eq.${studentId})`,
          ...enrollmentIds.map((id) => `and(owner_type.eq.enrollment,owner_id.eq.${id})`),
          ...(justifications ?? []).map((j) => `and(owner_type.eq.absence_justification,owner_id.eq.${j.id})`),
        ];
        const { data: files } = await supabase
          .from("file_objects")
          .select("id, mime_type, created_at")
          .eq("organization_id", organization.id)
          .eq("bucket", "database")
          .in("mime_type", ["application/pdf", "image/png", "image/jpeg"])
          .or(owners.join(","))
          .order("created_at");
        for (const f of files ?? []) {
          // La photo d'identité figure déjà sur la couverture.
          if (f.id === student.photo_path) continue;
          const file = await loadFile(supabase, f.id);
          if (file) attachments.push(file);
        }
        counts.set(section, attachments.length);
        continue;
      }
      counts.set(section, pages.length - before);
    }
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Génération impossible.");
  }

  const cover: DossierSnapshot = {
    kind: "dossier",
    organization,
    student: { ...student, photo_file_id: student.photo_path },
    class_name: latest?.class?.name ?? null,
    sections: order.map((key) => ({ key, label: DOSSIER_SECTIONS.find((s) => s.key === key)!.label, count: counts.get(key) ?? 0 })),
  };
  const coverPages = await preparePages(req, cover, {
    mode: "issue",
    title: `Dossier complet — ${student.last_name} ${student.first_name}`,
    studentId,
    subject: { type: "dossier", id: studentId },
  });
  if ("error" in coverPages) return failure(coverPages.error);

  const generated = await renderPages([coverPages.pages, ...pages], `Dossier complet ${student.matricule}`);
  let bytes: Uint8Array = generated;
  if (attachments.length) {
    const merged = await PDFDocument.load(generated);
    const font = await merged.embedFont(StandardFonts.Helvetica);
    for (const file of attachments) {
      try {
        if (file.mime === "application/pdf") {
          const source = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
          for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
        } else {
          const image = file.mime === "image/png" ? await merged.embedPng(file.bytes) : await merged.embedJpg(file.bytes);
          const page = merged.addPage(A4);
          const scale = Math.min((A4[0] - 60) / image.width, (A4[1] - 100) / image.height, 1);
          page.drawText(file.name.replace(/[^\x20-\x7E]/g, "?").slice(0, 90), { x: 30, y: A4[1] - 36, size: 9, font, color: rgb(0.36, 0.42, 0.55) });
          page.drawImage(image, { x: (A4[0] - image.width * scale) / 2, y: (A4[1] - 60 - image.height * scale), width: image.width * scale, height: image.height * scale });
        }
      } catch {
        // Pièce illisible (PDF chiffré ou corrompu) : ignorée, le reste du dossier est produit.
      }
    }
    bytes = await merged.save();
  }
  await logDocumentEvent(supabase, organization.id, "document.dossier", `Dossier complet ${student.matricule} (${order.join(", ")})`, { type: "students", id: studentId });
  return pdfResponse(bytes, `dossier-${student.matricule}`, request.nextUrl.searchParams.has("telecharger"));
}
