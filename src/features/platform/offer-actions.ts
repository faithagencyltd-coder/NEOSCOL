"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  const data = canWritePlatform(role);
  return data ? { ok: true } : { ok: false, message: platformDeniedMessage(role) };
}

const refresh = () => {
  revalidatePath("/plateforme/offres");
  revalidatePath("/plateforme/formules");
  revalidatePath("/tarifs");
};

const dateOrNull = (value: FormDataEntryValue | null, endOfDay = false) => {
  const v = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).toISOString();
};
const intOrNull = (value: FormDataEntryValue | null) => {
  const n = Number(String(value ?? "").trim());
  return String(value ?? "").trim() && Number.isInteger(n) ? n : null;
};

/** Création ou modification d'un code promo / d'une offre automatique. */
export async function savePromo(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const value = intOrNull(formData.get("discount_value"));
  if (!value || value <= 0) return { ok: false, message: "Indiquez la valeur de la réduction." };
  const plan = String(formData.get("plan_code") ?? "");
  const interval = String(formData.get("interval") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_promo", {
    p_id: isUuid(id) ? id : (null as never),
    p_code: String(formData.get("code") ?? ""),
    p_name: String(formData.get("name") ?? ""),
    p_description: String(formData.get("description") ?? ""),
    p_discount_type: formData.get("discount_type") === "amount" ? "amount" : "percent",
    p_discount_value: value,
    p_plan_codes: plan ? [plan] : (null as never),
    p_intervals: interval === "MONTHLY" || interval === "YEARLY" ? [interval] : (null as never),
    p_starts_at: dateOrNull(formData.get("starts_on")) ?? (null as never),
    p_ends_at: dateOrNull(formData.get("ends_on"), true) ?? (null as never),
    p_max_uses: intOrNull(formData.get("max_uses")) ?? (null as never),
    p_auto_apply: formData.get("auto_apply") === "on",
    p_is_active: formData.get("is_active") === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Offre enregistrée." };
}

/** Tarif négocié d'un établissement (l'ancien reste dans l'historique). */
export async function saveNegotiatedPrice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = String(formData.get("organization_id") ?? "");
  if (!isUuid(org)) return { ok: false, message: "Choisissez l'établissement." };
  const active = formData.get("remove") !== "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_negotiated_price", {
    p_org: org,
    p_plan_code: String(formData.get("plan_code") ?? ""),
    p_monthly: intOrNull(formData.get("monthly_price")) ?? (null as never),
    p_annual: intOrNull(formData.get("annual_price")) ?? (null as never),
    p_note: String(formData.get("note") ?? ""),
    p_valid_until: String(formData.get("valid_until") ?? "") || (null as never),
    p_active: active,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  revalidatePath("/plateforme/abonnements");
  return { ok: true, message: active ? "Tarif négocié enregistré : il s'applique aux prochaines factures." : "Tarif négocié retiré (conservé dans l'historique)." };
}

export async function updatePlanTrial(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const plan = String(formData.get("plan_id") ?? "");
  const days = intOrNull(formData.get("trial_days"));
  if (!isUuid(plan) || days === null) return { ok: false, message: "Durée invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_plan_trial", { p_plan: plan, p_trial_days: days });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `Essai gratuit : ${days} jours pour les nouveaux essais.` };
}
