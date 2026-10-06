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

function refresh() {
  revalidatePath("/plateforme/sms");
  revalidatePath("/communication", "layout");
}

const optionalPrice = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : Math.floor(Number(text));
};

/** Facturation des SMS : activation, prix par défaut d'un SMS, achat minimum (historique des prix en base). */
export async function saveSmsPricing(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_sms_pricing", {
    p_enabled: formData.get("billing_enabled") === "on",
    p_default_price: Math.floor(Number(formData.get("default_price") ?? 0)),
    p_min_purchase: Math.floor(Number(formData.get("min_purchase") ?? 0)),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Réglages des SMS enregistrés. Les crédits déjà achetés ne changent pas." };
}

/** Prix d'un SMS pour un pays (vide = prix par défaut). */
export async function setCountrySmsPrice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const country = String(formData.get("country") ?? "");
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, message: "Pays invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_country_sms_price", { p_country: country, p_price: optionalPrice(formData.get("price")) as number });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Prix du pays enregistré." };
}

/** Prix particulier pour un établissement (vide = retire le prix particulier). */
export async function setOrgSmsPrice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = String(formData.get("organization_id") ?? "");
  if (!isUuid(org)) return { ok: false, message: "Établissement invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_org_sms_price", {
    p_org: org,
    p_price: optionalPrice(formData.get("price")) as number,
    p_note: String(formData.get("note") ?? "").slice(0, 300),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Prix particulier enregistré." };
}

/** Offrir ou retirer des SMS à un établissement (motif obligatoire, tracé). */
export async function adjustSmsCredit(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = String(formData.get("organization_id") ?? "");
  if (!isUuid(org)) return { ok: false, message: "Établissement invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_adjust_sms_credit", {
    p_org: org,
    p_delta: Math.trunc(Number(formData.get("delta") ?? 0)),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `Crédit mis à jour : ${data} SMS.` };
}
