"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dossierOrder } from "@/features/documents/dossier";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Révocation d'un document émis (motif obligatoire) : la vérification publique affichera « révoqué ». */
export async function revokeDocument(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("documents.revoke");
  if (!auth.ok) return auth;
  const id = String(formData.get("document_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Document introuvable." };
  if (reason.length < 3) return { ok: false, message: "Le motif de révocation est obligatoire." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("issued_documents")
    .update({ status: "revoked", revoked_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .eq("status", "valid");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Révocation impossible.") };
  revalidatePath("/eleves", "layout");
  return { ok: true, message: "Document révoqué." };
}

/** Ordre par défaut des pièces du dossier complet (paramètre de l'établissement). */
export async function saveDossierOrder(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  const order = dossierOrder(String(formData.get("order") ?? ""), null);
  const supabase = await createClient();
  const settings = (auth.context.organization.settings ?? {}) as Record<string, unknown>;
  const documents = (settings.documents && typeof settings.documents === "object" ? settings.documents : {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, documents: { ...documents, dossier_sections: order } } })
    .eq("id", auth.context.organization.id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/eleves", "layout");
  return { ok: true, message: "Ordre enregistré pour tout l'établissement." };
}

const TEMPLATE_KINDS = ["school_certificate", "attestation", "training_certificate", "convocation", "contract", "custom"] as const;

const templateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS, { error: "Type de document inconnu." }),
  name: z.string().trim().min(2, { error: "Nom du modèle requis." }).max(120),
  description: z.string().trim().max(300).optional(),
  title: z.string().trim().min(2, { error: "Titre requis." }).max(120),
  body: z.string().trim().min(10, { error: "Le texte du document est trop court." }).max(6000),
  closing: z.string().trim().max(600),
});

/**
 * Document Studio : modèle d'un document rédigé (documents.templates.manage).
 * Types standard : un modèle par défaut par type. Personnalisés : autant que
 * nécessaire. Les documents déjà émis gardent leur texte (instantané).
 */
export async function saveTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("documents.templates.manage");
  if (!auth.ok) return auth;
  const parsed = templateSchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    description: String(formData.get("description") ?? "") || undefined,
    title: formData.get("title"),
    body: formData.get("body"),
    closing: String(formData.get("closing") ?? ""),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides." };
  const v = parsed.data;
  const organizationId = auth.context.organization.id;
  const supabase = await createClient();
  const row = { name: v.name, description: v.description ?? null, layout: { title: v.title, body: v.body, closing: v.closing } };
  const id = String(formData.get("template_id") ?? "");
  let error;
  if (isUuid(id)) {
    ({ error } = await supabase.from("document_templates").update(row).eq("organization_id", organizationId).eq("id", id));
  } else if (v.kind === "custom") {
    ({ error } = await supabase.from("document_templates").insert({ ...row, organization_id: organizationId, kind: "custom" }));
  } else {
    const { data: existing } = await supabase.from("document_templates").select("id").eq("organization_id", organizationId).eq("kind", v.kind).eq("is_default", true).maybeSingle();
    ({ error } = existing
      ? await supabase.from("document_templates").update(row).eq("id", existing.id)
      : await supabase.from("document_templates").insert({ ...row, organization_id: organizationId, kind: v.kind, is_default: true }));
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/documents", "layout");
  return { ok: true, message: "Modèle enregistré : il s'applique aux prochains documents émis." };
}

/** Rétablit le texte standard (supprime le modèle par défaut) ou supprime un modèle personnalisé. */
export async function deleteTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("documents.templates.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("template_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Modèle introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("document_templates").delete({ count: "exact" }).eq("organization_id", auth.context.organization.id).eq("id", id);
  if (error || !count) return { ok: false, message: dbErrorMessage(error, "Modèle introuvable.") };
  revalidatePath("/documents", "layout");
  return { ok: true, message: "Modèle supprimé." };
}
