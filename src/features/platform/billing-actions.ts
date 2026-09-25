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
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme NéoScol." };
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
