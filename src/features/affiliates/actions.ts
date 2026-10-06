"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Affiliation : actions de l'affilié (espace personnel) et du Super Admin (console). Contrôles en base. */
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const int = (f: FormData, k: string) => {
  const v = text(f, k).replace(/\s/g, "");
  return v === "" ? null : Math.trunc(Number(v));
};
const list = (f: FormData, k: string) => text(f, k).split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
const refreshSpace = () => revalidatePath("/espace/affiliation");
const refreshConsole = () => revalidatePath("/plateforme/affiliation", "layout");

async function signedIn(): Promise<ActionResult | null> {
  return (await getSessionContext()) ? null : { ok: false, message: "Connectez-vous pour continuer." };
}
async function writer(): Promise<ActionResult | null> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? null : { ok: false, message: platformDeniedMessage(role) };
}

// ---------------------------------------------------------------- Affilié
export async function applyAffiliate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await signedIn();
  if (denied) return denied;
  const { data, error } = await (await createClient()).rpc("affiliate_apply", {
    p_kind: text(formData, "kind"),
    p_phone: text(formData, "phone"),
    p_country: text(formData, "country"),
    p_city: text(formData, "city"),
    p_motivation: text(formData, "motivation").slice(0, 1000),
    p_payout_method: text(formData, "payout_method"),
    p_payout_details: text(formData, "payout_details").slice(0, 300),
    p_accept_terms: on(formData, "accept_terms"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshSpace();
  return { ok: true, message: (data as { status: string }).status === "approved" ? "Bienvenue dans le programme : votre lien est prêt." : "Demande envoyée : l'équipe NeoScool vous répondra." };
}

export async function updateAffiliatePayout(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await signedIn();
  if (denied) return denied;
  const { error } = await (await createClient()).rpc("affiliate_update_payout", {
    p_phone: text(formData, "phone"),
    p_payout_method: text(formData, "payout_method"),
    p_payout_details: text(formData, "payout_details").slice(0, 300),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshSpace();
  return { ok: true, message: "Coordonnées de versement enregistrées." };
}

export async function disputeCommission(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await signedIn();
  if (denied) return denied;
  const id = text(formData, "id");
  if (!isUuid(id)) return { ok: false, message: "Commission introuvable." };
  const { error } = await (await createClient()).rpc("affiliate_dispute", { p_commission: id, p_message: text(formData, "message") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshSpace();
  return { ok: true, message: "Contestation envoyée à l'équipe NeoScool." };
}

// ---------------------------------------------------------------- Console
export async function saveAffiliateSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const kinds = ["teacher", "ambassador", "freelance", "partner", "other"].filter((k) => on(formData, `kind_${k}`));
  const { error } = await (await createClient()).rpc("platform_save_affiliate_settings", {
    p: {
      enabled: on(formData, "enabled"),
      signups_open: on(formData, "signups_open"),
      links_enabled: on(formData, "links_enabled"),
      codes_enabled: on(formData, "codes_enabled"),
      campaigns_enabled: on(formData, "campaigns_enabled"),
      require_approval: on(formData, "require_approval"),
      require_phone: on(formData, "require_phone"),
      require_payout_details: on(formData, "require_payout_details"),
      count_test_payments: on(formData, "count_test_payments"),
      allowed_kinds: kinds,
      terms: text(formData, "terms"),
      reward_type: text(formData, "reward_type"),
      reward_value: int(formData, "reward_value"),
      reward_event: text(formData, "reward_event"),
      reward_months: int(formData, "reward_months"),
      eligible_plans: list(formData, "eligible_plans"),
      attribution_days: int(formData, "attribution_days"),
      conflict_rule: text(formData, "conflict_rule"),
      hold_days: int(formData, "hold_days"),
      min_payout: int(formData, "min_payout"),
      monthly_cap: int(formData, "monthly_cap") ?? 0,
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Réglages du programme enregistrés." };
}

export async function saveAffiliateCampaign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const id = text(formData, "id");
  const { error } = await (await createClient()).rpc("platform_save_affiliate_campaign", {
    p_id: (isUuid(id) ? id : null) as string,
    p: {
      name: text(formData, "name"),
      description: text(formData, "description"),
      starts_on: text(formData, "starts_on") || null,
      ends_on: text(formData, "ends_on") || null,
      reward_type: text(formData, "reward_type"),
      reward_value: int(formData, "reward_value"),
      reward_event: text(formData, "reward_event"),
      reward_months: int(formData, "reward_months") ?? 12,
      eligible_plans: list(formData, "eligible_plans"),
      is_active: on(formData, "is_active"),
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Campagne enregistrée." };
}

export async function reviewAffiliate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const id = text(formData, "id");
  const campaign = text(formData, "campaign_id");
  if (!isUuid(id)) return { ok: false, message: "Affilié introuvable." };
  const { error } = await (await createClient()).rpc("platform_review_affiliate", {
    p_id: id,
    p_action: text(formData, "action"),
    p_note: text(formData, "note"),
    p_campaign: (isUuid(campaign) ? campaign : null) as string,
    p_promo_code: text(formData, "promo_code"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Affilié mis à jour." };
}

export async function reviewCommission(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const id = text(formData, "id");
  if (!isUuid(id)) return { ok: false, message: "Commission introuvable." };
  const { error } = await (await createClient()).rpc("platform_review_commission", { p_id: id, p_action: text(formData, "action"), p_reason: text(formData, "reason") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Commission mise à jour." };
}

export async function recordAffiliatePayout(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const affiliate = text(formData, "affiliate_id");
  const commissions = formData.getAll("commission").map(String).filter(isUuid);
  if (!isUuid(affiliate) || commissions.length === 0) return { ok: false, message: "Cochez au moins une commission payable." };
  const { error } = await (await createClient()).rpc("platform_record_affiliate_payout", {
    p_affiliate: affiliate,
    p_commissions: commissions,
    p_method: text(formData, "method"),
    p_reference: text(formData, "reference"),
    p_paid_on: text(formData, "paid_on"),
    p_note: text(formData, "note"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Versement enregistré." };
}

export async function correctAttribution(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const denied = await writer();
  if (denied) return denied;
  const org = text(formData, "organization_id");
  const code = text(formData, "affiliate_code").toUpperCase();
  if (!isUuid(org)) return { ok: false, message: "Établissement introuvable." };
  const supabase = await createClient();
  let affiliate: string | null = null;
  if (code) {
    const { data } = await supabase.from("affiliates").select("id").eq("code", code).maybeSingle();
    if (!data) return { ok: false, message: "Code affilié introuvable." };
    affiliate = data.id;
  }
  const { error } = await supabase.rpc("platform_correct_attribution", { p_org: org, p_affiliate: affiliate as string, p_reason: text(formData, "reason") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshConsole();
  return { ok: true, message: "Attribution corrigée." };
}
