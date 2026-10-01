import "server-only";

import { redact } from "@/features/billing/server";
import { buildProvider, loadCustomGateway, readGatewaySecrets, simulationAllowed } from "@/lib/payments/config";
import { CustomHttpProvider } from "@/lib/payments/custom";
import { customDefinitionSchema } from "@/lib/payments/custom-definition";
import { MockSchoolProvider, type MockStore } from "@/lib/payments/mock";
import { BUILTIN_SCHOOL_ADAPTERS, CUSTOM_SCHOOL_ADAPTER, MOCK_SCHOOL_ADAPTER, platformCustomAdapter, type SchoolAdapter } from "@/lib/payments/school-adapters";
import { PaymentProviderError, type PaymentMode, type PaymentProvider } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Service serveur des paiements en ligne des familles (frais de scolarité).
 *
 * Chaque fournisseur d'établissement (org_payment_providers) est transformé en
 * PaymentProvider par son « adapter » ; le reste du module ne connaît que ce
 * contrat (aucun « if fournisseur = … » ailleurs). Toute confirmation suit le
 * même chemin, quelle que soit son origine (notification, retour du navigateur,
 * rapprochement) : vérification SERVEUR auprès du fournisseur, puis
 * fee_payment_confirm / fee_payment_fail en base (contrôles d'établissement,
 * référence, montant, devise, statut et doublons appliqués en base).
 */

export type ProviderRow = {
  id: string;
  organization_id: string;
  adapter: string;
  label: string;
  mode: string;
  currency: string;
  config: unknown;
  custom_definition: unknown;
  secret_ciphertext: string | null;
  is_active: boolean;
  archived_at: string | null;
  webhook_token: string;
};

const PROVIDER_COLUMNS = "id, organization_id, adapter, label, mode, currency, config, custom_definition, secret_ciphertext, is_active, archived_at, webhook_token";
const TOKEN = /^[0-9a-f]{48}$/;

/** Le fournisseur de test n'est disponible qu'en local / démonstration (jamais en production réelle). */
export const testProviderAllowed = simulationAllowed;

const mockStore: MockStore = {
  async getState(reference: string) {
    const admin = createAdminClient();
    if (!admin) return null;
    const [{ data: sim }, { data: tx }] = await Promise.all([
      admin.from("payment_simulations").select("outcome, amount").eq("reference", reference).maybeSingle(),
      admin.from("fee_payment_transactions").select("currency").eq("internal_reference", reference).maybeSingle(),
    ]);
    if (!sim || !tx) return null;
    return { outcome: sim.outcome as "completed" | "cancelled" | "failed", amount: sim.amount, currency: tx.currency };
  },
};

/** Fournisseurs que l'établissement peut ajouter (intégrés, ajoutés par NeoScool, API décrite, test). */
export async function listSchoolAdapters(): Promise<SchoolAdapter[]> {
  const list = [...BUILTIN_SCHOOL_ADAPTERS];
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin.from("custom_payment_gateways").select("provider, definition, payment_providers(name, description)").order("provider");
    for (const row of data ?? []) {
      const parsed = customDefinitionSchema.safeParse(row.definition);
      if (!parsed.success) continue;
      const p = row.payment_providers as unknown as { name: string; description: string | null } | null;
      list.push(platformCustomAdapter(row.provider, p?.name ?? row.provider, p?.description ?? null, parsed.data));
    }
  }
  list.push(CUSTOM_SCHOOL_ADAPTER);
  if (testProviderAllowed()) list.push(MOCK_SCHOOL_ADAPTER);
  return list;
}

export async function schoolAdapter(code: string): Promise<SchoolAdapter | null> {
  if (code === "custom") return CUSTOM_SCHOOL_ADAPTER;
  if (code === "mock") return testProviderAllowed() ? MOCK_SCHOOL_ADAPTER : null;
  const builtin = BUILTIN_SCHOOL_ADAPTERS.find((a) => a.code === code);
  if (builtin) return builtin;
  const custom = await loadCustomGateway(code);
  return custom ? platformCustomAdapter(code, custom.name, custom.description, custom.definition) : null;
}

/** Fournisseurs dont la connexion doit avoir été testée avec succès avant activation. */
export const testRequired = (adapter: string) => adapter === "custom" || adapter.startsWith("custom_");

export async function loadProviderRow(id: string): Promise<ProviderRow | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("org_payment_providers").select(PROVIDER_COLUMNS).eq("id", id).maybeSingle();
  return (data as ProviderRow | null) ?? null;
}

/** Construit l'adapter d'un fournisseur d'établissement (clés déchiffrées ici, jamais renvoyées). */
export async function buildSchoolProvider(row: ProviderRow, baseUrl: string): Promise<PaymentProvider> {
  const mode: PaymentMode = row.mode === "live" ? "live" : "test";
  const config = (row.config ?? {}) as Record<string, string>;
  const secrets = readGatewaySecrets(row.secret_ciphertext);
  if (row.adapter === "mock") {
    if (!testProviderAllowed() || mode !== "test") throw new PaymentProviderError("Le fournisseur de test est désactivé sur ce serveur.");
    return new MockSchoolProvider(baseUrl, mockStore);
  }
  if (row.adapter === "custom") {
    const parsed = customDefinitionSchema.safeParse(row.custom_definition);
    if (!parsed.success) throw new PaymentProviderError("Description de l'API du fournisseur invalide : corrigez-la dans Paramètres › Paiements.");
    const definition = config.api_url_test || config.api_url_live ? { ...parsed.data, base_url: { test: config.api_url_test || parsed.data.base_url.test, live: config.api_url_live || parsed.data.base_url.live } } : parsed.data;
    return new CustomHttpProvider({ code: "custom", name: row.label, mode, definition, config, secrets });
  }
  if (row.adapter === "offline" || row.adapter === "simulation") throw new PaymentProviderError("Type de fournisseur non disponible pour les paiements des familles.");
  return buildProvider(row.adapter, mode, config, secrets, baseUrl, row.adapter.startsWith("custom_") ? await loadCustomGateway(row.adapter) : null);
}

export const feeWebhookUrl = (base: string, token: string) => `${base.replace(/\/+$/, "")}/api/webhooks/school-payments/${token}`;
export const feeReturnUrl = (base: string, reference: string) => `${base.replace(/\/+$/, "")}/portail/finances/retour?ref=${encodeURIComponent(reference)}`;

/** Test de connexion d'un fournisseur (sans paiement réel). */
export async function testSchoolProvider(row: ProviderRow): Promise<{ ok: boolean; message: string }> {
  if (row.adapter !== "mock" && !row.secret_ciphertext) return { ok: false, message: "Enregistrez d'abord les clés de ce fournisseur." };
  try {
    const base = await publicBaseUrl();
    const provider = await buildSchoolProvider(row, base);
    if (provider instanceof CustomHttpProvider) {
      const r = await provider.sandboxTest(base);
      return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.error };
    }
    if (provider.checkCredentials) {
      const r = await provider.checkCredentials();
      return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.error };
    }
    return { ok: true, message: `Clés enregistrées. ${row.label} ne permet pas de vérifier les clés sans paiement : faites un petit paiement en mode test pour confirmer.` };
  } catch (e) {
    return { ok: false, message: e instanceof PaymentProviderError ? e.message : "Test de connexion impossible." };
  }
}

export type FeeStart = {
  transaction_id: string;
  reference: string;
  amount: number;
  currency: string;
  adapter: string;
  mode: string;
  provider_id: string;
  checkout_url: string | null;
  purpose: string;
  reused: boolean;
};

/**
 * Ouvre le paiement chez le fournisseur pour une transaction créée en base
 * (fee_payment_start) ; en cas d'échec, la transaction passe en FAILED.
 */
export async function openFeeCheckout(
  start: FeeStart,
  ctx: { organizationId: string; storeName: string; customer?: { email?: string | null; name?: string | null; phone?: string | null } },
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (start.reused && start.checkout_url) return { ok: true, url: start.checkout_url };
  const admin = createAdminClient();
  const row = await loadProviderRow(start.provider_id);
  if (!admin || !row) return { ok: false, message: "Configuration serveur incomplète." };
  const base = await publicBaseUrl();
  try {
    const provider = await buildSchoolProvider(row, base);
    const returnUrl = feeReturnUrl(base, start.reference);
    const session = await provider.createCheckout({
      reference: start.reference,
      amount: Number(start.amount),
      currency: start.currency,
      description: `${ctx.storeName} — ${start.purpose}`.slice(0, 200),
      itemName: start.purpose.slice(0, 120),
      storeName: ctx.storeName.slice(0, 80),
      returnUrl,
      cancelUrl: `${returnUrl}&annule=1`,
      callbackUrl: feeWebhookUrl(base, row.webhook_token),
      customData: { kind: "school_fee", organization_id: ctx.organizationId },
      customer: ctx.customer,
    });
    const { error } = await admin.rpc("fee_payment_attach", {
      p_tx: start.transaction_id,
      p_provider_tx: session.providerTransactionId,
      p_checkout_url: session.checkoutUrl,
      p_response: redact(session.raw),
    });
    if (error) throw new PaymentProviderError("Enregistrement du paiement impossible.");
    return { ok: true, url: session.checkoutUrl };
  } catch (e) {
    const message = e instanceof PaymentProviderError ? e.message : "Le fournisseur de paiement est indisponible. Réessayez dans un instant.";
    await admin.rpc("fee_payment_fail", {
      p_provider: row.id,
      p_provider_tx: null as never,
      p_reference: start.reference,
      p_status: "FAILED",
      p_reason: `Ouverture du paiement impossible : ${message}`,
      p_response: redact(e instanceof PaymentProviderError ? e.details : {}),
    });
    return { ok: false, message };
  }
}

export type FeeSignalResult = {
  status: "confirmed" | "confirmed_review" | "duplicate" | "pending" | "failed" | "cancelled" | "rejected" | "error";
  reason?: string;
  transactionId?: string;
  organizationId?: string;
  paymentId?: string;
  receipt?: string;
};

/** Vérifie une transaction auprès de son fournisseur puis applique le résultat en base (idempotent). */
export async function processFeeSignal(providerId: string, providerTransactionId: string, source: "webhook" | "return" | "reconciliation"): Promise<FeeSignalResult> {
  const admin = createAdminClient();
  if (!admin) return { status: "error", reason: "Clé de service Supabase absente du serveur." };
  const row = await loadProviderRow(providerId);
  if (!row) return { status: "rejected", reason: "fournisseur_inconnu" };
  const { data: tx } = await admin
    .from("fee_payment_transactions")
    .select("id, organization_id, internal_reference, mode, status")
    .eq("provider_id", providerId)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();
  if (!tx) return { status: "rejected", reason: "transaction_inconnue" };
  const base = { transactionId: tx.id, organizationId: tx.organization_id };
  if (tx.mode !== row.mode) return { status: "rejected", reason: "mode_different", ...base };

  let verified;
  try {
    const provider = await buildSchoolProvider(row, await publicBaseUrl());
    verified = await provider.verifyPayment(providerTransactionId);
  } catch (e) {
    return { status: "error", reason: e instanceof PaymentProviderError ? e.message : "Vérification impossible.", ...base };
  }
  if (verified.state === "pending") return { status: "pending", ...base };

  if (verified.state === "paid") {
    const { data, error } = await admin.rpc("fee_payment_confirm", {
      p_provider: row.id,
      p_provider_tx: providerTransactionId,
      p_reference: verified.reference ?? tx.internal_reference,
      p_amount: verified.amount as number,
      p_currency: verified.currency as string,
      p_method: (verified.method ?? "") as string,
      p_response: redact(verified.raw),
      p_source: source,
    });
    if (error) return { status: "error", reason: "Enregistrement du paiement impossible.", ...base };
    const r = data as { result: string; reason?: string; payment_id?: string; receipt?: string };
    return {
      status: r.result === "confirmed" ? "confirmed" : r.result === "confirmed_review" ? "confirmed_review" : r.result === "duplicate" ? "duplicate" : "rejected",
      reason: r.reason,
      paymentId: r.payment_id,
      receipt: r.receipt,
      ...base,
    };
  }
  const { data, error } = await admin.rpc("fee_payment_fail", {
    p_provider: row.id,
    p_provider_tx: providerTransactionId,
    p_reference: tx.internal_reference,
    p_status: verified.state === "failed" ? "FAILED" : "CANCELLED",
    p_reason: verified.state === "failed" ? "Paiement refusé par le fournisseur" : "Paiement annulé",
    p_response: redact(verified.raw),
  });
  if (error) return { status: "error", reason: "Mise à jour du paiement impossible.", ...base };
  return { status: (data as { result: string }).result === "duplicate" ? "duplicate" : verified.state, ...base };
}

/**
 * Notification d'un fournisseur (adresse propre à chaque fournisseur
 * d'établissement, jeton aléatoire) : journalisée sans secret, puis
 * l'identifiant qu'elle porte est revérifié auprès du fournisseur.
 */
export async function receiveFeeWebhook(token: string, body: unknown, ip: string | null): Promise<FeeSignalResult & { known: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { status: "error", reason: "Clé de service Supabase absente du serveur.", known: false };
  if (!TOKEN.test(token)) return { status: "rejected", reason: "adresse_inconnue", known: false };
  const { data } = await admin.from("org_payment_providers").select(PROVIDER_COLUMNS).eq("webhook_token", token).maybeSingle();
  const row = data as ProviderRow | null;
  if (!row) return { status: "rejected", reason: "adresse_inconnue", known: false };

  let providerTransactionId: string | null = null;
  let reference: string | null = null;
  let setupError: string | null = null;
  try {
    const signal = (await buildSchoolProvider(row, await publicBaseUrl())).handleWebhook(body);
    providerTransactionId = signal.providerTransactionId;
    reference = signal.reference;
  } catch (e) {
    setupError = e instanceof PaymentProviderError ? e.message : "Fournisseur mal configuré.";
  }
  if (!providerTransactionId && reference) {
    const { data: byRef } = await admin.from("fee_payment_transactions").select("provider_transaction_id").eq("provider_id", row.id).eq("internal_reference", reference).maybeSingle();
    providerTransactionId = byRef?.provider_transaction_id ?? null;
  }
  const { data: webhook } = await admin
    .from("fee_payment_webhooks")
    .insert({ organization_id: row.organization_id, provider_id: row.id, ip, payload: redact(body), provider_transaction_id: providerTransactionId })
    .select("id")
    .single();

  let result: FeeSignalResult;
  if (setupError) result = { status: "rejected", reason: setupError };
  else if (!providerTransactionId) result = { status: "rejected", reason: "identifiant_absent" };
  else result = await processFeeSignal(row.id, providerTransactionId, "webhook");

  if (webhook) {
    await admin
      .from("fee_payment_webhooks")
      .update({
        processing_status: ["confirmed", "confirmed_review", "failed", "cancelled"].includes(result.status)
          ? "processed"
          : result.status === "duplicate"
            ? "duplicate"
            : result.status === "pending"
              ? "ignored"
              : result.status === "rejected"
                ? "rejected"
                : "error",
        transaction_id: result.transactionId ?? null,
        error: result.status === "error" || result.status === "rejected" ? (result.reason ?? null) : null,
      })
      .eq("id", webhook.id);
  }
  return { ...result, known: true };
}

/** Demandes restées sans réponse au-delà de leur délai : expirées (une confirmation tardive reste acceptée). */
export async function expireStaleFeePayments(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  if (admin) await admin.rpc("fee_payment_expire_stale", { p_org: organizationId });
}

/** Remboursement auprès du fournisseur quand son API le permet ; sinon procédure manuelle. */
export async function refundWithProvider(providerId: string, providerTransactionId: string | null, amount: number): Promise<{ supported: true; reference: string } | { supported: false; message: string }> {
  const row = await loadProviderRow(providerId);
  if (!row || !providerTransactionId) return { supported: false, message: "Remboursement automatique impossible : à effectuer chez le fournisseur puis à enregistrer ici." };
  try {
    const provider = await buildSchoolProvider(row, await publicBaseUrl());
    const r = await provider.refundPayment(providerTransactionId, amount);
    if (!r.supported) return { supported: false, message: r.message };
    const ref = r.raw.refund_id ?? r.raw.id ?? r.raw.reference;
    return { supported: true, reference: typeof ref === "string" || typeof ref === "number" ? String(ref).slice(0, 120) : `${row.label} ${new Date().toISOString().slice(0, 10)}` };
  } catch (e) {
    return { supported: false, message: e instanceof PaymentProviderError ? e.message : "Le fournisseur n'a pas pu effectuer le remboursement." };
  }
}
