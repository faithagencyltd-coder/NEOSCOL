"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/session";
import { FEATURE_FLAGS } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Lit les interrupteurs envoyés (seulement les fonctionnalités présentes dans le formulaire). */
function readFeatures(formData: FormData): Record<string, boolean> {
  return Object.fromEntries(
    FEATURE_FLAGS.filter((f) => formData.get(`present_${f.key}`) === "1").map((f) => [f.key, formData.get(`feature_${f.key}`) === "on"]),
  );
}

/** Établissement : active ou désactive ses fonctionnalités (droit Paramètres, contrôlé en base). */
export async function saveOrganizationFeatures(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("settings.manage");
  if (!auth.ok) return auth;
  // Une fonctionnalité arrêtée par Neoscool n'est pas envoyée (case désactivée) : son réglage reste inchangé.
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_org_features", { p_org: auth.context.organization.id, p_features: readFeatures(formData) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Fonctionnalités enregistrées." };
}

/** Super Admin : arrêt forcé de fonctionnalités pour un établissement (prime sur son réglage). */
export async function savePlatformOrganizationFeatures(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const org = String(formData.get("organization_id") ?? "");
  if (!isUuid(org)) return { ok: false, message: "Établissement introuvable." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, message: "Le motif est obligatoire." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_org_features", { p_org: org, p_features: readFeatures(formData), p_reason: reason });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme", "layout");
  return { ok: true, message: "Réglage appliqué : les fonctionnalités décochées sont arrêtées pour cet établissement." };
}
