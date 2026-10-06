"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Console Super Admin › Écosystème : modération, vérification, catégories, offres, paiements, publicité externe. */

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const checked = (formData: FormData, key: string) => formData.get(key) === "on" || formData.get(key) === "true";
const refresh = () => revalidatePath("/plateforme/ecosysteme", "layout");

async function writer(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? { ok: true } : { ok: false, message: platformDeniedMessage(role) };
}

async function run(rpc: string, args: Record<string, unknown>, message: string): Promise<ActionResult> {
  const auth = await writer();
  if (!auth.ok) return auth;
  const { error } = await ((await createClient()).rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(rpc, args);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message };
}

export async function saveEcosystemSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("platform_save_ecosystem_settings", { p_campaigns: checked(formData, "campaigns"), p_opportunities: checked(formData, "opportunities"), p_profiles: checked(formData, "profiles") }, "Règles de publication enregistrées.");
}

export async function moderateContent(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const action = text(formData, "action");
  return run("platform_moderate", { p_type: text(formData, "type"), p_id: text(formData, "id"), p_action: action, p_note: text(formData, "reason") }, action === "approve" ? "Contenu approuvé et publié." : action === "restore" ? "Contenu rétabli." : "Décision enregistrée.");
}

export async function resolveReport(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("platform_resolve_report", { p_id: text(formData, "id"), p_status: text(formData, "status"), p_note: text(formData, "reason") }, "Signalement traité.");
}

export async function decideVerification(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("platform_decide_verification", { p_org: text(formData, "organization_id"), p_decision: text(formData, "decision"), p_note: text(formData, "reason") }, "Décision de vérification enregistrée.");
}

export async function saveVerificationRequirement(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = text(formData, "id");
  return run(
    "platform_save_verification_requirement",
    { p_id: isUuid(id) ? id : null, p_country: text(formData, "country"), p_type: text(formData, "org_type"), p_label: text(formData, "label"), p_description: text(formData, "description"), p_required: checked(formData, "required"), p_active: checked(formData, "active") },
    "Pièce de vérification enregistrée.",
  );
}

export async function saveOpportunityCategory(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(
    "platform_save_opportunity_category",
    { p_key: text(formData, "key").toLowerCase(), p_label: text(formData, "label"), p_kind: text(formData, "kind"), p_poster: text(formData, "poster"), p_description: text(formData, "description"), p_sort: Number(text(formData, "sort_order") || 100), p_active: checked(formData, "active") },
    "Catégorie enregistrée.",
  );
}

export async function saveVisibilityOffer(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = text(formData, "id");
  const duration = text(formData, "duration_days");
  return run(
    "platform_save_visibility_offer",
    {
      p_id: isUuid(id) ? id : null,
      p_code: text(formData, "code"),
      p_label: text(formData, "label"),
      p_kind: text(formData, "kind"),
      p_description: text(formData, "description"),
      p_price: Number(text(formData, "price").replace(/\D/g, "")),
      p_currency: text(formData, "currency") || "XOF",
      p_duration: duration ? Number(duration) : null,
      p_country: text(formData, "country"),
      p_type: text(formData, "org_type"),
      p_active: checked(formData, "active"),
    },
    "Offre enregistrée.",
  );
}

export async function confirmVisibilityOrder(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const decision = text(formData, "decision");
  return run("platform_confirm_visibility_order", { p_order: text(formData, "id"), p_decision: decision, p_reference: text(formData, "reference") }, decision === "paid" ? "Paiement confirmé : mise en avant appliquée." : "Commande refusée.");
}

export async function setAdPlatform(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run("platform_set_ad_platform", { p_provider: text(formData, "provider"), p_enabled: checked(formData, "enabled"), p_note: text(formData, "note") }, "Plateforme publicitaire mise à jour.");
}

export async function updateAdRequest(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const results = Object.fromEntries((["impressions", "clicks", "leads", "spend"] as const).map((k) => [k, text(formData, k)]).filter(([, v]) => v).map(([k, v]) => [k, Number((v ?? "").replace(/\D/g, ""))]));
  return run(
    "platform_update_ad_request",
    { p_id: text(formData, "id"), p_status: text(formData, "status"), p_note: text(formData, "note"), p_results: Object.keys(results).length ? results : null, p_source: text(formData, "source") },
    "Demande mise à jour.",
  );
}
