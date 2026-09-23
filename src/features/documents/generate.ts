import "server-only";

import type { ReactElement } from "react";

import type { Permission } from "@/config/permissions";
import { can, getSessionContext, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import {
  errorResponse,
  issueDocument,
  loadDocOrganization,
  loadImages,
  logDocumentEvent,
  snapshotPages,
  snapshotPhoto,
  verificationFor,
  type Client,
  type IssuedDocument,
} from "./server";
import type { DocOrganization, DocumentSnapshot, Verification } from "./types";

export type DocumentRequest = {
  context: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
  supabase: Client;
  organization: DocOrganization;
  origin: string;
  /** Profil portail (parent / élève) : consultation de SES documents uniquement. */
  portal: boolean;
};

/** Ouvre une requête de document : session + établissement actif. */
export async function openDocumentRequest(request: Request): Promise<DocumentRequest | Response> {
  const context = await getSessionContext();
  if (!context) return errorResponse(401, "Session expirée : reconnectez-vous.");
  if (!context.organization) return errorResponse(403, "Aucun établissement actif.");
  const supabase = await createClient();
  const organization = await loadDocOrganization(supabase, context.organization.id);
  if (!organization) return errorResponse(404, "Établissement introuvable.");
  const portal = context.personas.has("parent") || context.personas.has("student");
  return {
    context: context as DocumentRequest["context"],
    supabase,
    organization,
    origin: new URL(request.url).origin,
    portal,
  };
}

/** Refus explicite côté serveur, journalisé (résultat « denied »). */
export async function denyDocument(req: DocumentRequest, what: string, entity: { type: string; id: string | null }): Promise<Response> {
  await logDocumentEvent(req.supabase, req.organization.id, "document.denied", `Refus : ${what}`, entity, "denied");
  return errorResponse(403, `Vous n'avez pas l'autorisation de générer ou télécharger ce document (${what}).`);
}

export function hasAll(req: DocumentRequest, ...permissions: Permission[]): boolean {
  return permissions.every((p) => can(req.context, p));
}

/** Document valide existant pour un sujet (vérification affichée sur les copies portail). */
export async function existingDocument(req: DocumentRequest, kind: string, subjectId: string): Promise<IssuedDocument | null> {
  const { data } = await req.supabase
    .from("issued_documents")
    .select("id, number, verification_code, issued_at, status")
    .eq("organization_id", req.organization.id)
    .eq("kind", kind)
    .eq("subject_id", subjectId)
    .eq("status", "valid")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

type Subject = { type: "payment" | "report_card" | "enrollment" | "student" | "invoice" | "dossier"; id: string | null };

/**
 * Prépare les pages PDF d'un instantané.
 * mode « issue » : émet (ou réutilise) un document officiel numéroté ;
 * mode « copy »  : copie sans émission (portails), avec la vérification existante si visible ;
 * mode « draft » : aperçu provisoire sans numéro.
 */
export async function preparePages(
  req: DocumentRequest,
  snapshot: DocumentSnapshot,
  options: { mode: "issue" | "copy" | "draft"; title: string; studentId: string | null; subject: Subject; reuse?: boolean },
): Promise<{ pages: ReactElement; document: IssuedDocument | null } | { error: string }> {
  let document: IssuedDocument | null = null;
  if (options.mode === "issue") {
    const issued = await issueDocument(req.supabase, {
      organizationId: req.organization.id,
      snapshot,
      title: options.title,
      studentId: options.studentId,
      subjectType: options.subject.type,
      subjectId: options.subject.id,
      reuse: options.reuse ?? false,
    });
    if (!issued.document) return { error: issued.error ?? "Émission impossible." };
    document = issued.document;
  } else if (options.mode === "copy" && options.subject.id) {
    document = await existingDocument(req, snapshot.kind, options.subject.id);
  }
  const verification: Verification | null = document ? await verificationFor(document, req.origin, req.organization.primary_color) : null;
  const images = await loadImages(req.supabase, req.organization, snapshotPhoto(snapshot));
  return { pages: snapshotPages(snapshot, images, verification, document?.issued_at ?? new Date().toISOString()), document };
}
