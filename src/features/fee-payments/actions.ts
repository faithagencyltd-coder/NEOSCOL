"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/session";
import { encryptionKeyFrom, encryptSecret, secretHint } from "@/lib/messaging/crypto";
import { readGatewaySecrets } from "@/lib/payments/config";
import { customDefinitionSchema, definitionError } from "@/lib/payments/custom-definition";
import { SCHOOL_METHODS } from "@/lib/payments/school-adapters";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import {
  loadProviderRow,
  openFeeCheckout,
  processFeeSignal,
  receiveFeeWebhook,
  refundWithProvider,
  schoolAdapter,
  testProviderAllowed,
  testRequired,
  testSchoolProvider,
  type FeeStart,
} from "./server";

const REFERENCE = /^NEO-\d{4}-\d{6,}$/;
const KEY = /^[a-z][a-z0-9_]{1,30}$/;
const RESERVED_CONFIG = new Set(["api_url_test", "api_url_live"]);

const refreshAdmin = () => {
  revalidatePath("/parametres/paiements");
  revalidatePath("/finances/paiements-en-ligne");
};
const refreshFamily = () => {
  revalidatePath("/portail/finances");
  revalidatePath("/finances/paiements-en-ligne");
  revalidatePath("/finances");
};

const text = (formData: FormData, key: string, max = 200) => String(formData.get(key) ?? "").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Super Admin : interrupteur global (aucune configuration supprimée)
// ---------------------------------------------------------------------------
export async function setSchoolPaymentsGlobal(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const enabled = formData.get("enabled") === "on";
  const { error } = await supabase.rpc("platform_set_school_payments", { p_enabled: enabled });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/paiements-en-ligne");
  refreshAdmin();
  refreshFamily();
  return { ok: true, message: enabled ? "Paiements en ligne des établissements activés." : "Paiements en ligne désactivés pour tous les établissements (configurations conservées)." };
}

// ---------------------------------------------------------------------------
// Établissement : activation et options
// ---------------------------------------------------------------------------
export async function saveFeePaymentSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.online.manage");
  if (!auth.ok) return auth;
  const minPartial = Number(formData.get("min_partial") || 0);
  const pending = Number(formData.get("pending_minutes") || 60);
  if (!Number.isFinite(minPartial) || minPartial < 0) return { ok: false, message: "Montant minimum invalide." };
  if (!Number.isInteger(pending) || pending < 10 || pending > 1440) return { ok: false, message: "Délai de paiement : entre 10 et 1 440 minutes." };
  const supabase = await createClient();
  const enabled = formData.get("online_enabled") === "on";
  const { error } = await supabase.rpc("org_save_payment_settings", {
    p_org: auth.context.organization.id,
    p_enabled: enabled,
    p_allow_partial: formData.get("allow_partial") === "on",
    p_min_partial: Math.round(minPartial),
    p_pending_minutes: pending,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshAdmin();
  refreshFamily();
  return { ok: true, message: enabled ? "Paiement en ligne activé pour les familles." : "Paiement en ligne désactivé (fournisseurs et historique conservés)." };
}

// ---------------------------------------------------------------------------
// Fournisseurs de l'établissement (sans limite)
// ---------------------------------------------------------------------------
/**
 * Ajout / modification d'un fournisseur. Les clés sont chiffrées ICI (serveur)
 * avant d'être envoyées à la base, ne sont jamais renvoyées au navigateur ; un
 * champ de clé laissé vide conserve la clé enregistrée.
 */
export async function saveFeeProvider(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize("finance.online.manage");
  if (!auth.ok) return auth;
  const id = text(formData, "id", 40);
  if (id && !isUuid(id)) return { ok: false, message: "Fournisseur introuvable." };
  const adapterCode = text(formData, "adapter", 40);
  const adapter = await schoolAdapter(adapterCode);
  if (!adapter) return { ok: false, message: "Type de fournisseur indisponible." };
  const label = text(formData, "label", 60);
  if (label.length < 2) return { ok: false, message: "Indiquez le nom du fournisseur." };
  const country = text(formData, "country", 2).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, message: "Pays : code à deux lettres (ex. CI, SN, BJ)." };
  const currency = text(formData, "currency", 3).toUpperCase() || auth.context.organization.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: "Devise : code à trois lettres (ex. XOF, EUR, USD)." };
  const methods = formData.getAll("methods").map(String).filter((m) => SCHOOL_METHODS.some((x) => x.value === m));
  if (!methods.length) return { ok: false, message: "Choisissez au moins un moyen de paiement." };
  const mode = adapter.kind === "mock" ? "test" : formData.get("mode") === "live" ? "live" : "test";

  const config: Record<string, string> = {};
  for (const f of adapter.publicFields) {
    const value = text(formData, `config_${f.key}`);
    if (/\s/.test(value)) return { ok: false, message: `${f.label} : valeur invalide (sans espace).` };
    if (value) config[f.key] = value;
  }
  let definition: unknown = null;
  if (adapter.kind === "custom") {
    for (const k of ["api_url_test", "api_url_live"] as const) {
      const value = text(formData, k);
      if (value && !/^https?:\/\/[A-Za-z0-9.-]+(:\d{2,5})?(\/[^\s?#]*)?$/.test(value)) return { ok: false, message: "Adresse de l'API invalide (ex. : https://api.fournisseur.com/v1)." };
      if (value) config[k] = value;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("custom_definition") ?? ""));
    } catch {
      return { ok: false, message: "Description technique de l'API : JSON invalide." };
    }
    const parsed = customDefinitionSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: `Description technique de l'API : ${definitionError(parsed.error)}` };
    definition = parsed.data;
  }
  // Paramètres supplémentaires : « clé=valeur », un par ligne (utilisables par l'API comme {{config.clé}}).
  for (const line of String(formData.get("extra_params") ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [k, ...rest] = line.split("=");
    const key = (k ?? "").trim();
    const value = rest.join("=").trim();
    if (!KEY.test(key) || RESERVED_CONFIG.has(key) || !value || value.length > 200) return { ok: false, message: `Paramètre supplémentaire invalide : « ${line.slice(0, 40)} » (format clé=valeur, clé en minuscules).` };
    if (!(key in config)) config[key] = value;
  }
  if (Object.keys(config).length > 30) return { ok: false, message: "Trop de paramètres (30 au maximum)." };

  const clear = formData.get("clear_secret") === "on";
  const typed: Record<string, string> = {};
  for (const f of adapter.secretFields) {
    const value = String(formData.get(`secret_${f.key}`) ?? "").trim();
    if (value && (value.length < 6 || value.length > 500 || /\s/.test(value))) return { ok: false, message: `${f.label} : valeur invalide.` };
    if (value) typed[f.key] = value;
  }
  let ciphertext: string | null = null;
  let hint: string | null = null;
  if (Object.keys(typed).length && !clear) {
    const current = id ? await loadProviderRow(id) : null;
    if (id && (!current || current.organization_id !== auth.context.organization.id)) return { ok: false, message: "Fournisseur introuvable." };
    const stored = current && current.adapter === adapter.code ? readGatewaySecrets(current.secret_ciphertext) : {};
    // Clés identiques à celles enregistrées : rien ne change (le dernier test reste valable).
    if (Object.entries(typed).every(([k, v]) => stored[k] === v)) for (const k of Object.keys(typed)) delete typed[k];
    if (Object.keys(typed).length) {
      const key = encryptionKeyFrom(process.env);
      if (!key) return { ok: false, message: "Chiffrement indisponible sur le serveur : clés non enregistrées." };
      const merged = { ...stored, ...typed };
      ciphertext = encryptSecret(JSON.stringify(merged), key);
      const first = adapter.secretFields.find((f) => merged[f.key]);
      hint = first ? secretHint(merged[first.key]!) : null;
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_save_payment_provider", {
    p_org: auth.context.organization.id,
    p_id: (id || null) as never,
    p_adapter: adapter.code,
    p_label: label,
    p_country: country || (null as never),
    p_currency: currency,
    p_methods: methods,
    p_mode: mode,
    p_config: config,
    p_custom_definition: definition as never,
    p_secret_ciphertext: ciphertext as never,
    p_secret_hint: hint as never,
    p_clear_secret: clear,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Enregistrement impossible.") };
  refreshAdmin();
  return { ok: true, message: `${label} enregistré${ciphertext ? " (clés chiffrées)" : ""}.`, data: { id: data as string } };
}

export async function testFeeProvider(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.online.manage");
  if (!auth.ok) return auth;
  const id = text(formData, "id", 40);
  const row = isUuid(id) ? await loadProviderRow(id) : null;
  if (!row || row.organization_id !== auth.context.organization.id) return { ok: false, message: "Fournisseur introuvable." };
  const result = await testSchoolProvider(row);
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_record_payment_provider_test", { p_provider: row.id, p_ok: result.ok, p_message: result.message });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshAdmin();
  return result.ok ? { ok: true, message: result.message } : { ok: false, message: result.message };
}

export async function setFeeProviderState(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.online.manage");
  if (!auth.ok) return auth;
  const id = text(formData, "id", 40);
  const row = isUuid(id) ? await loadProviderRow(id) : null;
  if (!row || row.organization_id !== auth.context.organization.id) return { ok: false, message: "Fournisseur introuvable." };
  const active = formData.get("is_active") === "on";
  const isDefault = active && formData.get("is_default") === "on";
  const priority = Number(formData.get("priority") || 100);
  if (!Number.isInteger(priority) || priority < 0 || priority > 9999) return { ok: false, message: "Priorité : nombre entier entre 0 et 9999." };
  if (active) {
    const adapter = await schoolAdapter(row.adapter);
    if (!adapter) return { ok: false, message: "Ce type de fournisseur n'est plus disponible sur ce serveur." };
    const config = (row.config ?? {}) as Record<string, string>;
    const secrets = readGatewaySecrets(row.secret_ciphertext);
    const missing = [...adapter.publicFields.filter((f) => f.required && !config[f.key]), ...adapter.secretFields.filter((f) => f.required && !secrets[f.key])];
    if (missing.length) return { ok: false, message: `Renseignez d'abord : ${missing.map((f) => f.label).join(", ")}.` };
    if (testRequired(row.adapter)) {
      const supabase = await createClient();
      const { data: state } = await supabase.from("org_payment_providers").select("last_test_ok").eq("id", row.id).maybeSingle();
      if (!state?.last_test_ok) return { ok: false, message: "Testez d'abord la connexion : un test réussi est obligatoire pour ce fournisseur." };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_set_payment_provider_state", { p_provider: row.id, p_active: active, p_default: isDefault, p_priority: priority });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshAdmin();
  refreshFamily();
  return { ok: true, message: active ? `${row.label} est proposé aux familles${isDefault ? " (par défaut)" : ""}.` : `${row.label} n'est plus proposé (configuration conservée).` };
}

export async function archiveFeeProvider(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.online.manage");
  if (!auth.ok) return auth;
  const id = text(formData, "id", 40);
  if (!isUuid(id)) return { ok: false, message: "Fournisseur introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_archive_payment_provider", { p_provider: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshAdmin();
  refreshFamily();
  redirect("/parametres/paiements");
}

// ---------------------------------------------------------------------------
// Parent : payer en ligne
// ---------------------------------------------------------------------------
/**
 * Paiement d'une échéance, du solde ou d'un montant autorisé. Le montant, la
 * devise et l'établissement sont déterminés EN BASE (fee_payment_start) à partir
 * de la facture : le navigateur n'envoie que des choix.
 */
export async function startFeePayment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("portal.parent");
  if (!auth.ok) return auth;
  const invoice = text(formData, "invoice", 40);
  const installment = text(formData, "installment", 40);
  const provider = text(formData, "provider", 40);
  const method = text(formData, "method", 20);
  const choice = text(formData, "choice", 20);
  if (!isUuid(invoice) || !isUuid(provider)) return { ok: false, message: "Choisissez la facture et le moyen de paiement." };
  let amount: number | null = null;
  if (choice === "montant") {
    amount = Number(String(formData.get("amount") ?? "").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Indiquez le montant à payer." };
  }
  if (choice === "echeance" && !isUuid(installment)) return { ok: false, message: "Choisissez l'échéance à payer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fee_payment_start", {
    p_invoice: invoice,
    p_installment: (choice === "echeance" ? installment : null) as never,
    p_amount: amount as never,
    p_provider: provider,
    p_method: (method || null) as never,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Paiement impossible pour le moment.") };
  const start = data as unknown as FeeStart;
  const org = auth.context.organization;
  const profile = auth.context.profile;
  const opened = await openFeeCheckout(start, {
    organizationId: org.id,
    storeName: org.short_name || org.name,
    customer: {
      email: auth.context.user.email,
      name: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || null : null,
      phone: auth.context.user.phone,
    },
  });
  refreshFamily();
  if (!opened.ok) return { ok: false, message: opened.message };
  redirect(opened.url);
}

export type ReturnedFeePayment = {
  internal_reference: string;
  status: string;
  amount: number;
  currency: string;
  purpose: string;
  provider_label: string;
  mode: string;
  payment_id: string | null;
  failure_reason: string | null;
  needs_review: boolean;
  receipt: string | null;
};

/** Retour du navigateur : jamais une preuve ; relance seulement la vérification serveur. */
export async function verifyReturnedFeePayment(reference: string): Promise<ReturnedFeePayment | null> {
  const context = await getSessionContext();
  if (!context || !REFERENCE.test(reference)) return null;
  const supabase = await createClient();
  const columns = "internal_reference, status, amount, currency, purpose, provider_label, mode, payment_id, failure_reason, needs_review, provider_id, provider_transaction_id";
  const { data: tx } = await supabase.from("fee_payment_transactions").select(columns).eq("internal_reference", reference).maybeSingle();
  if (!tx) return null;
  let after = tx;
  if ((tx.status === "PENDING" || tx.status === "PROCESSING") && tx.provider_transaction_id) {
    await processFeeSignal(tx.provider_id, tx.provider_transaction_id, "return");
    const { data } = await supabase.from("fee_payment_transactions").select(columns).eq("internal_reference", reference).maybeSingle();
    if (data) after = data;
  }
  let receipt: string | null = null;
  if (after.payment_id) {
    const { data: pay } = await supabase.from("payments").select("number").eq("id", after.payment_id).maybeSingle();
    receipt = pay?.number ?? null;
  }
  return {
    internal_reference: after.internal_reference,
    status: after.status,
    amount: Number(after.amount),
    currency: after.currency,
    purpose: after.purpose,
    provider_label: after.provider_label,
    mode: after.mode,
    payment_id: after.payment_id,
    failure_reason: after.failure_reason,
    needs_review: after.needs_review,
    receipt,
  };
}

/**
 * Fournisseur de TEST : la page de paiement simulée enregistre le résultat
 * « chez le fournisseur » puis envoie une vraie notification à l'adresse du
 * fournisseur — même chemin qu'en production (vérification comprise).
 */
export async function simulateFeeTestPayment(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const context = await getSessionContext();
  if (!context || !testProviderAllowed() || !REFERENCE.test(reference) || !["completed", "cancelled", "failed", "wrong_amount"].includes(outcome)) redirect("/portail/finances");
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("fee_payment_transactions")
    .select("amount, adapter, provider_id, provider_transaction_id, payer_user_id, status")
    .eq("internal_reference", reference)
    .maybeSingle();
  const admin = createAdminClient();
  if (!tx || !admin || tx.adapter !== "mock" || tx.payer_user_id !== context.user.id || !tx.provider_transaction_id) redirect("/portail/finances");
  const amount = Number(tx.amount);
  await admin.from("payment_simulations").upsert({ reference, outcome: outcome === "wrong_amount" ? "completed" : outcome, amount: outcome === "wrong_amount" ? Math.max(1, amount - 1000) : amount });
  const { data: provider } = await admin.from("org_payment_providers").select("webhook_token").eq("id", tx.provider_id).maybeSingle();
  if (provider) await receiveFeeWebhook(provider.webhook_token, { transaction_id: tx.provider_transaction_id }, "test");
  refreshFamily();
  redirect(`/portail/finances/retour?ref=${encodeURIComponent(reference)}`);
}

// ---------------------------------------------------------------------------
// Comptabilité : rapprochement, cas à traiter, remboursements
// ---------------------------------------------------------------------------
async function txOfActiveOrg(organizationId: string, id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_transactions")
    .select("id, organization_id, internal_reference, provider_id, provider_transaction_id, status, amount, currency")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

const SIGNAL_TEXT: Record<string, string> = {
  confirmed: "Paiement confirmé par le fournisseur et enregistré en comptabilité.",
  confirmed_review: "Paiement confirmé par le fournisseur, mais la facture ne peut plus le recevoir : cas à traiter.",
  duplicate: "Déjà à jour : aucune nouvelle écriture.",
  pending: "Le fournisseur indique que le paiement est toujours en attente.",
  failed: "Le fournisseur indique que le paiement a échoué.",
  cancelled: "Le fournisseur indique que le paiement a été annulé.",
  rejected: "Confirmation refusée par les contrôles (voir l'historique).",
  error: "Le fournisseur n'a pas pu être interrogé.",
};

/** Rapprochement : interroge le fournisseur pour une transaction (même chemin que la notification). */
export async function reconcileFeeTransaction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.read");
  if (!auth.ok) return auth;
  const tx = await txOfActiveOrg(auth.context.organization.id, text(formData, "id", 40));
  if (!tx) return { ok: false, message: "Transaction introuvable." };
  if (!tx.provider_transaction_id) return { ok: false, message: "Ce paiement n'a jamais été ouvert chez le fournisseur : rien à vérifier." };
  const result = await processFeeSignal(tx.provider_id, tx.provider_transaction_id, "reconciliation");
  const message = `${SIGNAL_TEXT[result.status] ?? result.status}${result.reason ? ` (${result.reason})` : ""}`;
  const supabase = await createClient();
  await supabase.rpc("fee_payment_log_check", { p_tx: tx.id, p_summary: `Vérification auprès du fournisseur : ${message}` });
  refreshFamily();
  return result.status === "error" || result.status === "rejected" ? { ok: false, message } : { ok: true, message };
}

export async function markFeeReviewed(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.payments.create");
  if (!auth.ok) return auth;
  const tx = await txOfActiveOrg(auth.context.organization.id, text(formData, "id", 40));
  if (!tx) return { ok: false, message: "Transaction introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fee_payment_mark_reviewed", { p_tx: tx.id, p_note: text(formData, "note", 200) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshFamily();
  return { ok: true, message: "Cas marqué comme traité." };
}

export async function requestFeeRefund(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.payments.create");
  if (!auth.ok) return auth;
  const tx = await txOfActiveOrg(auth.context.organization.id, text(formData, "id", 40));
  if (!tx) return { ok: false, message: "Transaction introuvable." };
  const amount = Number(String(formData.get("amount") ?? "").replace(/\s/g, "").replace(",", "."));
  const supabase = await createClient();
  const { error } = await supabase.rpc("fee_payment_refund_request", { p_tx: tx.id, p_amount: amount, p_reason: text(formData, "reason", 500) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshFamily();
  return { ok: true, message: "Remboursement demandé : à valider par une personne habilitée." };
}

/**
 * Exécution d'un remboursement : automatique auprès du fournisseur quand son
 * API le permet (après contrôle des droits), sinon procédure manuelle tracée
 * (référence du remboursement effectué chez le fournisseur obligatoire).
 */
export async function completeFeeRefund(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.payments.cancel");
  if (!auth.ok) return auth;
  const refundId = text(formData, "refund", 40);
  if (!isUuid(refundId)) return { ok: false, message: "Remboursement introuvable." };
  const supabase = await createClient();
  const { data: refund } = await supabase
    .from("fee_payment_refunds")
    .select("id, transaction_id, amount, status")
    .eq("id", refundId)
    .eq("organization_id", auth.context.organization.id)
    .maybeSingle();
  if (!refund || refund.status !== "requested") return { ok: false, message: "Remboursement introuvable ou déjà traité." };
  const tx = await txOfActiveOrg(auth.context.organization.id, refund.transaction_id);
  if (!tx) return { ok: false, message: "Transaction introuvable." };
  const automatic = formData.get("mode") === "automatic";
  let externalReference = text(formData, "external_reference", 120);
  const note = text(formData, "note", 500);
  if (automatic) {
    const r = await refundWithProvider(tx.provider_id, tx.provider_transaction_id, Number(refund.amount));
    if (!r.supported) return { ok: false, message: `${r.message} Effectuez le remboursement chez le fournisseur, puis enregistrez-le avec sa référence.` };
    externalReference = r.reference;
  } else if (externalReference.length < 3) {
    return { ok: false, message: "Indiquez la référence du remboursement effectué chez le fournisseur (ou du reçu de remise en espèces)." };
  }
  const { error } = await supabase.rpc("fee_payment_refund_complete", { p_refund: refund.id, p_external_reference: externalReference, p_note: note || (null as never), p_automatic: automatic });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshFamily();
  return { ok: true, message: automatic ? `Remboursement effectué auprès du fournisseur (réf. ${externalReference}) et comptabilité mise à jour.` : "Remboursement enregistré et comptabilité mise à jour." };
}

export async function rejectFeeRefund(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.payments.cancel");
  if (!auth.ok) return auth;
  const refundId = text(formData, "refund", 40);
  if (!isUuid(refundId)) return { ok: false, message: "Remboursement introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fee_payment_refund_reject", { p_refund: refundId, p_reason: text(formData, "reason", 300) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refreshFamily();
  return { ok: true, message: "Demande de remboursement refusée." };
}
