"use server";

import { revalidatePath } from "next/cache";

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
