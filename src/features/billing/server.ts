import "server-only";

import { activePaymentSetup, providerFor } from "@/lib/payments/config";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * Service serveur des paiements d'abonnement (SYSTÈME A). Toute confirmation
 * passe par `processProviderSignal` : vérification auprès du fournisseur,
 * contrôles (référence, montant, devise, mode) et application idempotente en base.
 */

const SENSITIVE_KEY = /hash|key|secret|password|pin|otp|cvv|card/i;

/** Copie d'un contenu reçu, sans aucune valeur sensible (journal des webhooks). */
export function redact(value: unknown, depth = 0): Json {
  if (depth > 6) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "[masqué]" : redact(v, depth + 1)]),
    );
  }
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return null;
}

export type SignalResult = {
  status: "confirmed" | "duplicate" | "pending" | "failed" | "cancelled" | "rejected" | "error";
  reason?: string;
  reference?: string;
  organizationId?: string;
  transactionId?: string;
};

/** Vérifie un paiement auprès du fournisseur puis l'applique en base (idempotent). */
export async function processProviderSignal(providerCode: string, providerTransactionId: string): Promise<SignalResult> {
  const admin = createAdminClient();
  if (!admin) return { status: "error", reason: "Clé de service Supabase absente du serveur." };
  const setup = providerFor(providerCode, await publicBaseUrl());
  if (!setup.enabled) return { status: "rejected", reason: setup.reason };

  const { data: tx } = await admin
    .from("payment_transactions")
    .select("id, organization_id, internal_reference, mode, status")
    .eq("provider", providerCode)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();
  if (!tx) return { status: "rejected", reason: "transaction_inconnue" };
  if (tx.mode !== setup.mode) {
    // Jamais de mélange test / production.
    return { status: "rejected", reason: "mode_different", reference: tx.internal_reference, transactionId: tx.id, organizationId: tx.organization_id };
  }

  let verified;
  try {
    verified = await setup.provider.verifyPayment(providerTransactionId);
  } catch (error) {
    return { status: "error", reason: error instanceof PaymentProviderError ? error.message : "Vérification impossible.", reference: tx.internal_reference };
  }
  if (verified.reference && verified.reference !== tx.internal_reference) {
    return { status: "rejected", reason: "reference_differente", reference: tx.internal_reference, transactionId: tx.id };
  }
  const base = { reference: tx.internal_reference, organizationId: tx.organization_id, transactionId: tx.id };

  if (verified.state === "pending") return { status: "pending", ...base };

  let status: SignalResult["status"];
  let reason: string | undefined;
  if (verified.state === "paid") {
    const { data, error } = await admin.rpc("billing_confirm_payment", {
      p_provider: providerCode,
      p_mode: setup.mode,
      p_provider_tx: providerTransactionId,
      p_reference: tx.internal_reference,
      p_amount: verified.amount as number,
      p_currency: verified.currency as string,
      p_method: verified.method as string,
      p_response: redact(verified.raw),
    });
    if (error) return { status: "error", reason: "Enregistrement du paiement impossible.", ...base };
    const result = data as { result: string; reason?: string };
    status = result.result === "confirmed" ? "confirmed" : result.result === "duplicate" ? "duplicate" : "rejected";
    reason = result.reason;
  } else {
    const { data, error } = await admin.rpc("billing_fail_payment", {
      p_provider: providerCode,
      p_mode: setup.mode,
      p_provider_tx: providerTransactionId,
      p_reference: tx.internal_reference,
      p_status: verified.state === "failed" ? "FAILED" : "CANCELLED",
      p_reason: verified.state === "failed" ? "Paiement refusé par le fournisseur" : "Paiement annulé",
      p_response: redact(verified.raw),
    });
    if (error) return { status: "error", reason: "Mise à jour du paiement impossible.", ...base };
    const result = data as { result: string };
    status = result.result === "duplicate" ? "duplicate" : verified.state;
  }

  // Journal des événements vérifiés : une clé par (jeton, état) → doublons ignorés.
  await admin.from("payment_provider_events").upsert(
    {
      provider: providerCode,
      mode: setup.mode,
      event_key: `${providerTransactionId}:${verified.state}`,
      provider_transaction_id: providerTransactionId,
      status: verified.state,
      organization_id: tx.organization_id,
      transaction_id: tx.id,
      payload: redact(verified.raw),
    },
    { onConflict: "provider,mode,event_key", ignoreDuplicates: true },
  );
  return { status, reason, ...base };
}

/**
 * Notification entrante d'un fournisseur : journalisée (sans secret), puis
 * l'identifiant qu'elle contient est revérifié auprès du fournisseur.
 */
export async function receiveWebhook(providerCode: string, body: unknown, ip: string | null): Promise<SignalResult & { webhookId?: string }> {
  const admin = createAdminClient();
  if (!admin) return { status: "error", reason: "Clé de service Supabase absente du serveur." };
  const setup = providerFor(providerCode, await publicBaseUrl());
  const signal = setup.enabled ? setup.provider.handleWebhook(body) : { providerTransactionId: null, reference: null };
  const { data: webhook } = await admin
    .from("payment_webhooks")
    .insert({
      provider: providerCode.slice(0, 30),
      mode: setup.enabled ? setup.mode : null,
      ip,
      payload: redact(body),
      provider_transaction_id: signal.providerTransactionId,
    })
    .select("id")
    .single();

  let result: SignalResult;
  if (!setup.enabled) result = { status: "rejected", reason: setup.reason };
  else if (!signal.providerTransactionId) result = { status: "rejected", reason: "identifiant_absent" };
  else result = await processProviderSignal(providerCode, signal.providerTransactionId);

  if (webhook) {
    await admin
      .from("payment_webhooks")
      .update({
        processing_status:
          result.status === "confirmed" || result.status === "failed" || result.status === "cancelled"
            ? "processed"
            : result.status === "duplicate"
              ? "duplicate"
              : result.status === "pending"
                ? "ignored"
                : result.status === "rejected"
                  ? "rejected"
                  : "error",
        result: redact(result),
        error: result.status === "error" || result.status === "rejected" ? (result.reason ?? null) : null,
        organization_id: result.organizationId ?? null,
        transaction_id: result.transactionId ?? null,
      })
      .eq("id", webhook.id);
  }
  return { ...result, webhookId: webhook?.id };
}

export { activePaymentSetup };
