import "server-only";

import { createHash } from "node:crypto";

import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Document } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { safeFileName } from "@/lib/pdf/format";
import { qrDataUrl } from "@/lib/pdf/qr";
import { isUuid } from "@/lib/utils/search-params";
import type { Database, Json } from "@/types/database";

import { InvoicePage, ReceiptPage } from "./pdf/finance";
import { ReportCardPage } from "./pdf/report-card";
import { CompetencySheetPage, TrainingTranscriptPage } from "./pdf/training";
import { CertificatePage, CommitmentPage, DossierCoverPage, EnrollmentFormPage, StudentCardPage, TranscriptPage } from "./pdf/student";
import type { DocImages, DocOrganization, DocumentSnapshot, Verification } from "./types";

export type Client = SupabaseClient<Database>;

/** Identité visuelle et coordonnées de l'établissement pour les documents. */
export async function loadDocOrganization(supabase: Client, organizationId: string): Promise<DocOrganization | null> {
  const [{ data: org }, { data: branding }, { data: settings }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, code, type, address, city, phone, email, timezone, currency, is_demo")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_branding")
      .select("logo_path, stamp_path, signature_path, primary_color, secondary_color, header_text, footer_text, signatory_name, signatory_title")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("report_card_settings").select("config").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (!org) return null;
  const config = (settings?.config ?? {}) as Record<string, unknown>;
  const fileId = (value: string | null | undefined) => (value && isUuid(value) ? value : null);
  return {
    ...org,
    header_text: branding?.header_text ?? null,
    footer_text: branding?.footer_text ?? null,
    signatory_name: branding?.signatory_name ?? null,
    signatory_title: branding?.signatory_title ?? null,
    primary_color: typeof config.primary_color === "string" ? config.primary_color : (branding?.secondary_color ?? "#0B1F3A"),
    accent_color: typeof config.accent_color === "string" ? config.accent_color : (branding?.primary_color ?? "#1E6FFF"),
    logo_file_id: fileId(branding?.logo_path),
    stamp_file_id: fileId(branding?.stamp_path),
    signature_file_id: fileId(branding?.signature_path),
  };
}

/** Contenu d'un fichier stocké en base (RLS appliquée), ou null. */
export async function loadFile(supabase: Client, fileId: string | null | undefined) {
  if (!fileId || !isUuid(fileId)) return null;
  const { data } = await supabase
    .from("file_objects")
    .select("id, file_name, mime_type, content")
    .eq("id", fileId)
    .maybeSingle();
  if (!data?.content) return null;
  const hex = String(data.content);
  const bytes = Buffer.from(hex.startsWith("\\x") ? hex.slice(2) : hex, "hex");
  return { name: data.file_name, mime: data.mime_type, bytes };
}

/** Image (PNG/JPEG) en data URL pour react-pdf. */
export async function loadImage(supabase: Client, fileId: string | null | undefined): Promise<string | null> {
  const file = await loadFile(supabase, fileId);
  if (!file || !["image/png", "image/jpeg"].includes(file.mime)) return null;
  return `data:${file.mime};base64,${file.bytes.toString("base64")}`;
}

export async function loadImages(supabase: Client, organization: DocOrganization, photoFileId?: string | null): Promise<DocImages> {
  const [logo, stamp, signature, photo] = await Promise.all([
    loadImage(supabase, organization.logo_file_id),
    loadImage(supabase, organization.stamp_file_id),
    loadImage(supabase, organization.signature_file_id),
    loadImage(supabase, photoFileId),
  ]);
  return { logo, stamp, signature, photo };
}

export type IssuedDocument = { id: string; number: string; verification_code: string; issued_at: string; status: string };

/**
 * Émet un document officiel (numéro + code de vérification) avec son instantané.
 * reuse : réutilise le document valide existant pour le même sujet (bulletin, reçu, facture).
 * La RLS exige documents.generate.
 */
export async function issueDocument(
  supabase: Client,
  input: {
    organizationId: string;
    snapshot: DocumentSnapshot;
    title: string;
    studentId: string | null;
    subjectType: "payment" | "report_card" | "enrollment" | "student" | "invoice" | "dossier";
    subjectId: string | null;
    reuse: boolean;
  },
): Promise<{ document: IssuedDocument | null; error: string | null }> {
  if (input.reuse && input.subjectId) {
    const { data: existing } = await supabase
      .from("issued_documents")
      .select("id, number, verification_code, issued_at, status, data")
      .eq("organization_id", input.organizationId)
      .eq("kind", input.snapshot.kind)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .eq("status", "valid")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && hashSnapshot(existing.data) === hashSnapshot(input.snapshot as unknown as Json)) {
      return { document: existing, error: null };
    }
  }
  const { data, error } = await supabase
    .from("issued_documents")
    .insert({
      organization_id: input.organizationId,
      kind: input.snapshot.kind,
      title: input.title,
      student_id: input.studentId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      data: input.snapshot as unknown as Json,
      content_hash: hashSnapshot(input.snapshot as unknown as Json),
    })
    .select("id, number, verification_code, issued_at, status")
    .single();
  return { document: data ?? null, error: error?.message ?? null };
}

/** Empreinte stable d'un instantané (hors horodatages de calcul). */
function hashSnapshot(value: Json | null | undefined): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "computed_at")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, normalize(val)]),
      );
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value ?? null))).digest("hex");
}

export async function verificationFor(document: Pick<IssuedDocument, "number" | "verification_code">, origin: string, color?: string): Promise<Verification> {
  const url = `${origin}/verifier/${document.verification_code}`;
  return { number: document.number, code: document.verification_code, url, qr: await qrDataUrl(url, color) };
}

/** Page(s) PDF correspondant à un instantané. */
export function snapshotPages(snapshot: DocumentSnapshot, images: DocImages, verification: Verification | null, issuedAt: string): ReactElement {
  switch (snapshot.kind) {
    case "report_card":
      return <ReportCardPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "receipt":
      return <ReceiptPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "invoice":
      return <InvoicePage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "school_certificate":
    case "attestation":
    case "training_certificate":
    case "training_attestation":
    case "convocation":
    case "contract":
    case "custom":
      return <CertificatePage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "transcript":
      return <TranscriptPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "enrollment_form":
      return <EnrollmentFormPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "commitment_form":
      return <CommitmentPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "student_card":
      return <StudentCardPage snapshot={snapshot} images={images} verification={verification} />;
    case "dossier":
      return <DossierCoverPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "training_transcript":
      return <TrainingTranscriptPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
    case "competency_sheet":
      return <CompetencySheetPage snapshot={snapshot} images={images} verification={verification} issuedAt={issuedAt} />;
  }
}

export async function renderPages(pages: ReactElement[], title: string): Promise<Buffer> {
  return renderToBuffer(
    <Document title={title} author="NéoScol" creator="NéoScol" producer="NéoScol" language="fr">
      {pages}
    </Document>,
  );
}

/** Photo associée à l'instantané (élève), si présente. */
export function snapshotPhoto(snapshot: DocumentSnapshot): string | null {
  return "student" in snapshot ? (snapshot.student.photo_file_id ?? null) : null;
}

export function pdfResponse(bytes: Uint8Array, fileName: string, download = false): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(fileName)}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(status: 400 | 401 | 403 | 404 | 409 | 500, message: string): Response {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Journalise la génération / le refus d'un document. */
export async function logDocumentEvent(
  supabase: Client,
  organizationId: string,
  action: string,
  summary: string,
  entity: { type: string; id: string | null },
  result: "success" | "denied" | "failure" = "success",
) {
  await supabase.rpc("log_event", {
    p_action: action,
    p_organization_id: organizationId,
    p_entity_type: entity.type,
    p_entity_id: entity.id ?? undefined,
    p_summary: summary,
    p_result: result,
  });
}
