"use server";

import { z } from "zod";

import { loadFeexPayPayment } from "@/features/billing/feexpay";
import { processProviderSignal } from "@/features/billing/server";
import { displayName, getSessionContext } from "@/lib/auth/session";
import { providerFor } from "@/lib/payments/config";
import { FeexPayProvider } from "@/lib/payments/feexpay";
import { feexpayNetwork, feexpayPhone } from "@/lib/payments/feexpay-networks";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils/action-result";

/**
 * Paiement FeexPay (abonnements des établissements et des enseignants) :
 * le payeur choisit réseau et numéro, le serveur envoie la demande à FeexPay
 * (montant lu en base, jamais dans le formulaire), puis seule la vérification
 * serveur auprès de FeexPay confirme le paiement (processProviderSignal).
 */

const MAX_ATTEMPTS = 5;
const OPEN = ["PENDING", "PROCESSING"];

const requestSchema = z.object({
  reference: z.string().regex(/^NEO-\d{4}-\d{6,}$/),
  country: z.string().regex(/^[A-Z]{2}$/),
  network: z.string().min(2).max(30),
  phone: z.string().trim().min(6).max(30),
  otp: z.string().trim().regex(/^\d{0,8}$/, { error: "Code de confirmation invalide." }).optional(),
});

export type FeexPayState = { state: "paid" | "pending" | "failed" | "none" };

async function feexpaySetup() {
  const setup = await providerFor("feexpay", await publicBaseUrl());
  if (!setup.enabled || !(setup.provider instanceof FeexPayProvider)) return null;
  return { mode: setup.mode, provider: setup.provider };
}

export async function startFeexPayRequest(_: ActionResult<FeexPayState> | null, formData: FormData): Promise<ActionResult<FeexPayState>> {
  const parsed = requestSchema.safeParse({
    reference: formData.get("reference"),
    country: formData.get("country"),
    network: formData.get("network"),
    phone: formData.get("phone"),
    otp: formData.get("otp") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  const choice = feexpayNetwork(parsed.data.country, parsed.data.network);
  if (!choice) return { ok: false, message: "Choisissez votre pays et votre réseau Mobile Money." };
  const phone = feexpayPhone(choice.country.dial, parsed.data.phone);
  if (!phone) return { ok: false, message: `Numéro invalide : tapez votre numéro ${choice.network.label} (${choice.country.name}).` };
  if (choice.network.otp && !parsed.data.otp) return { ok: false, message: `${choice.network.label} : saisissez le code de confirmation généré sur votre téléphone.` };

  const context = await getSessionContext();
  const payment = await loadFeexPayPayment(parsed.data.reference);
  if (!context || !payment) return { ok: false, message: "Paiement introuvable." };
  if (!payment.canPay) return { ok: false, message: "Vous n'avez pas les droits nécessaires pour payer l'abonnement." };
  if (payment.status === "SUCCESS") return { ok: true, message: "Ce paiement est déjà confirmé.", data: { state: "paid" } };
  if (!OPEN.includes(payment.status)) return { ok: false, message: "Ce paiement est clos : recommencez depuis votre abonnement." };
  const setup = await feexpaySetup();
  const admin = createAdminClient();
  if (!setup || !admin) return { ok: false, message: "FeexPay n'est pas disponible pour le moment." };
  if (setup.mode !== payment.mode) return { ok: false, message: "Ce paiement a été commencé avec un autre réglage FeexPay : recommencez depuis votre abonnement." };
  const { count } = await admin.from("feexpay_requests").select("id", { count: "exact", head: true }).eq("internal_reference", payment.reference);
  if ((count ?? 0) >= MAX_ATTEMPTS) return { ok: false, message: "Trop de tentatives pour ce paiement : recommencez depuis votre abonnement." };

  let result;
  try {
    result = await setup.provider.requestToPay({
      reference: payment.reference,
      amount: payment.amount,
      phone,
      network: choice.network.code,
      name: displayName(context),
      email: context.user.email ?? "",
      otp: parsed.data.otp || undefined,
      description: payment.kind === "teacher" ? "NeoScool abonnement enseignant" : "NeoScool abonnement etablissement",
    });
  } catch (e) {
    return { ok: false, message: e instanceof PaymentProviderError ? e.message : "FeexPay est injoignable pour le moment. Réessayez dans un instant." };
  }
  const { error } = await admin.from("feexpay_requests").insert({
    internal_reference: payment.reference,
    feexpay_reference: result.feexpayReference,
    network: choice.network.code,
    phone_last4: phone.slice(-4),
    mode: setup.mode,
    created_by: context.user.id,
  });
  if (error) return { ok: false, message: "Demande FeexPay non enregistrée : réessayez." };
  const signal = await processProviderSignal("feexpay", payment.reference);
  if (signal.status === "confirmed" || signal.status === "duplicate") return { ok: true, message: "Paiement confirmé.", data: { state: "paid" } };
  return {
    ok: true,
    message: `Demande envoyée au ${choice.network.label} se terminant par ${phone.slice(-4)} : validez le paiement sur votre téléphone (code secret Mobile Money).`,
    data: { state: "pending" },
  };
}

/** Suivi pendant la validation sur le téléphone : vérification serveur auprès de FeexPay. */
export async function checkFeexPayPayment(reference: string): Promise<FeexPayState> {
  const payment = await loadFeexPayPayment(reference);
  if (!payment) return { state: "none" };
  if (payment.status === "SUCCESS") return { state: "paid" };
  const signal = await processProviderSignal("feexpay", payment.reference);
  if (signal.status === "confirmed" || signal.status === "duplicate") return { state: "paid" };
  const setup = await feexpaySetup();
  const last = setup ? await setup.provider.latestAttempt(payment.reference).catch(() => null) : null;
  return { state: last === "failed" || last === "cancelled" ? "failed" : last ? "pending" : "none" };
}
