"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme NeoScool." };
}

function refresh() {
  revalidatePath("/plateforme", "layout");
}

/** Émet une facture d'abonnement pour un établissement (ex. avant un paiement hors plateforme). */
export async function issuePlatformInvoice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = String(formData.get("organization_id") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const interval = formData.get("interval") === "YEARLY" ? "YEARLY" : "MONTHLY";
  if (!isUuid(org) || !/^[A-Z_]{3,40}$/.test(plan)) return { ok: false, message: "Établissement ou formule invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_issue_invoice", { p_org: org, p_plan_code: plan, p_interval: interval });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Facture émise : elle apparaît dans « Mon abonnement » de l'établissement." };
}

const manualSchema = z.object({
  invoice_id: z.uuid({ error: "Facture invalide." }),
  reference: z.string().trim().min(3, { error: "Référence du paiement obligatoire." }).max(120),
  amount: z.coerce.number().int({ error: "Montant entier en F CFA." }).positive({ error: "Montant invalide." }),
  method: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Paiement hors plateforme : la base exige le montant exact et conserve l'identité du validateur. */
export async function recordManualPayment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = manualSchema.safeParse({
    invoice_id: formData.get("invoice_id"),
    reference: formData.get("reference"),
    amount: formData.get("amount"),
    method: String(formData.get("method") ?? "") || undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_record_manual_payment", {
    p_invoice: parsed.data.invoice_id,
    p_reference: parsed.data.reference,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method ?? "virement",
    p_note: parsed.data.note ?? "",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Paiement validé : facture payée et abonnement actif." };
}

export async function updatePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(planId)) return { ok: false, message: "Formule introuvable." };
  const features = Object.fromEntries(
    String(formData.get("feature_codes") ?? "")
      .split(",")
      .filter((code) => /^[a-z][a-z_]{1,49}$/.test(code))
      .map((code) => [code, formData.get(`feature_${code}`) === "on"]),
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_plan", {
    p_plan: planId,
    p_description: String(formData.get("description") ?? "").slice(0, 1000),
    p_audience: String(formData.get("audience") ?? "").slice(0, 200),
    p_is_active: formData.get("is_active") === "on",
    p_features: features,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  revalidatePath("/tarifs");
  return { ok: true, message: "Formule mise à jour. Les prix des abonnements existants ne changent pas." };
}

const settingsSchema = z
  .object({
    past_due: z.coerce.number().int().min(0).max(60),
    restrict: z.coerce.number().int().min(0).max(120),
    expire: z.coerce.number().int().min(1).max(730),
    renewal_notice: z.coerce.number().int().min(1).max(60),
  })
  .refine((v) => v.past_due <= v.restrict && v.restrict < v.expire, { error: "Délais incohérents : impayé ≤ restriction < expiration." });

export async function updateBillingSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = settingsSchema.safeParse({
    past_due: formData.get("past_due"),
    restrict: formData.get("restrict"),
    expire: formData.get("expire"),
    renewal_notice: formData.get("renewal_notice"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Valeurs invalides." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_billing_settings", {
    p_past_due: parsed.data.past_due,
    p_restrict: parsed.data.restrict,
    p_expire: parsed.data.expire,
    p_renewal_notice: parsed.data.renewal_notice,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Délais d'impayé enregistrés." };
}

/** Exécute immédiatement le traitement quotidien (sinon lancé par /api/cron/abonnements). */
export async function runBillingLifecycle(): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Clé de service Supabase absente du serveur." };
  const { data, error } = await admin.rpc("billing_process_lifecycle");
  if (error) return { ok: false, message: "Traitement impossible." };
  const r = data as { status_changes: number; notifications: number; renewal_invoices: number; expired_checkouts: number };
  refresh();
  return {
    ok: true,
    message: `Traitement effectué : ${r.status_changes} changement(s) de statut, ${r.notifications} notification(s), ${r.renewal_invoices} facture(s) de renouvellement, ${r.expired_checkouts} paiement(s) abandonné(s).`,
  };
}

const priceSchema = z.object({
  plan_id: z.uuid({ error: "Formule invalide." }),
  monthly_price: z.coerce.number({ error: "Prix invalide." }).int({ error: "Prix entier (sans décimales)." }).min(100, { error: "Prix mensuel trop bas." }).max(100_000_000),
  annual_discount_percent: z.coerce.number({ error: "Remise invalide." }).min(0, { error: "Remise : 0 à 60 %." }).max(60, { error: "Remise : 0 à 60 %." }),
  reason: z.string().trim().min(3, { error: "Le motif est obligatoire." }).max(500),
});

/** Nouveau prix d'une formule : jamais rétroactif (les abonnés gardent leur prix), historisé et audité en base. */
export async function updatePlanPrices(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = priceSchema.safeParse({
    plan_id: formData.get("plan_id"),
    monthly_price: formData.get("monthly_price"),
    annual_discount_percent: formData.get("annual_discount_percent"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_update_plan_prices", {
    p_plan: parsed.data.plan_id,
    p_monthly_price: parsed.data.monthly_price,
    p_annual_discount_percent: parsed.data.annual_discount_percent,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  revalidatePath("/tarifs");
  const result = data as { monthly_price: number; annual_price: number };
  return {
    ok: true,
    message: `Nouveau prix enregistré : ${result.monthly_price.toLocaleString("fr-FR")} F / mois, ${result.annual_price.toLocaleString("fr-FR")} F / an. Les abonnés actuels gardent leur prix.`,
  };
}

// -----------------------------------------------------------------------------
// Formules : création, modification, duplication, retrait, suppression.
// -----------------------------------------------------------------------------
const PLAN_FEATURE_CODES = ["students", "teachers", "parents", "student_portal", "finance", "attendance", "grades", "bulletins", "documents", "qr", "reports", "assistant", "communication", "sms", "voice_checkin", "pwa", "multi_establishment"];
const PLAN_ORG_TYPE_VALUES = ["primary_school", "middle_school", "high_school", "private_school", "school_complex", "vocational_center", "technical_center", "university", "institute", "school_group"] as const;
type PlanOrgType = (typeof PLAN_ORG_TYPE_VALUES)[number];

const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

function planForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    name_en: String(formData.get("name_en") ?? "").trim(),
    description: String(formData.get("description") ?? "").slice(0, 1000),
    description_en: String(formData.get("description_en") ?? "").slice(0, 1000),
    audience: String(formData.get("audience") ?? "").slice(0, 200),
    highlights: lines(formData.get("highlights")),
    highlights_en: lines(formData.get("highlights_en")),
    org_types: PLAN_ORG_TYPE_VALUES.filter((t) => formData.get(`org_type_${t}`) === "on") as PlanOrgType[],
    sort_order: Number(formData.get("sort_order") ?? 50) || 50,
    is_active: formData.get("is_active") === "on",
    features: Object.fromEntries(PLAN_FEATURE_CODES.filter((c) => formData.get(`present_${c}`) === "1").map((c) => [c, formData.get(`feature_${c}`) === "on"])),
  };
}

function refreshPlans() {
  refresh();
  revalidatePath("/tarifs");
  revalidatePath("/en/pricing");
  revalidatePath("/inscription");
  revalidatePath("/abonnement", "layout");
}

/** Nouvelle formule (prix, essai, options, types d'établissement). */
export async function createPlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const form = planForm(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_plan", {
    p_plan: null as unknown as string,
    p_code: String(formData.get("code") ?? "").trim().toUpperCase(),
    p_name: form.name,
    p_name_en: form.name_en,
    p_description: form.description,
    p_description_en: form.description_en,
    p_audience: form.audience,
    p_highlights: form.highlights,
    p_highlights_en: form.highlights_en,
    p_org_types: form.org_types,
    p_sort_order: form.sort_order,
    p_is_active: form.is_active,
    p_features: form.features,
    p_monthly_price: Number(formData.get("monthly_price") ?? 0),
    p_annual_discount_percent: Number(formData.get("annual_discount_percent") ?? 30),
    p_trial_days: Number(formData.get("trial_days") ?? 20),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshPlans();
  return { ok: true, message: form.is_active ? "Formule créée et proposée aux établissements concernés." : "Formule créée (non proposée tant qu'elle n'est pas activée)." };
}

/** Modification complète d'une formule (le prix se change à part, avec historique). */
export async function savePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(planId)) return { ok: false, message: "Formule introuvable." };
  const form = planForm(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_save_plan", {
    p_plan: planId,
    p_code: "",
    p_name: form.name,
    p_name_en: form.name_en,
    p_description: form.description,
    p_description_en: form.description_en,
    p_audience: form.audience,
    p_highlights: form.highlights,
    p_highlights_en: form.highlights_en,
    p_org_types: form.org_types,
    p_sort_order: form.sort_order,
    p_is_active: form.is_active,
    p_features: form.features,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshPlans();
  return { ok: true, message: "Formule mise à jour. Les abonnements existants gardent leur prix." };
}

/** Retirer des offres (abonnés actuels inchangés) ou réactiver. */
export async function setPlanActive(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(planId)) return { ok: false, message: "Formule introuvable." };
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_plan_active", { p_plan: planId, p_active: active });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshPlans();
  return { ok: true, message: active ? "Formule de nouveau proposée." : "Formule retirée des offres. Les abonnés actuels la gardent." };
}

/** Copie d'une formule (retirée, à relire avant de la proposer). */
export async function duplicatePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(planId)) return { ok: false, message: "Formule introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_duplicate_plan", {
    p_plan: planId,
    p_code: String(formData.get("code") ?? "").trim().toUpperCase(),
    p_name: String(formData.get("name") ?? "").trim(),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshPlans();
  return { ok: true, message: "Copie créée : relisez-la puis activez-la pour la proposer." };
}

/** Suppression définitive (seulement une formule qui n'a jamais servi). */
export async function deletePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const planId = String(formData.get("plan_id") ?? "");
  if (!isUuid(planId)) return { ok: false, message: "Formule introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_delete_plan", { p_plan: planId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshPlans();
  return { ok: true, message: "Formule supprimée." };
}
