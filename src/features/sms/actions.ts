"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { processProviderSignal, receiveWebhook } from "@/features/billing/server";
import { authorize } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/session";
import { activePaymentSetup, simulationAllowed } from "@/lib/payments/config";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

const REFERENCE = /^NEO-\d{4}-\d{6,}$/;

/**
 * Achat de crédit SMS : nombre de SMS × prix fixé par la plateforme, calculé en
 * base ; paiement chez le fournisseur (même circuit que l'abonnement) ; le crédit
 * n'est ajouté qu'après vérification serveur du paiement.
 */
export async function startSmsCreditCheckout(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("billing.manage");
  if (!auth.ok) return auth;
  const count = Math.floor(Number(formData.get("sms") ?? 0));
  if (!Number.isFinite(count) || count <= 0) return { ok: false, message: "Indiquez le nombre de SMS à acheter." };
  const base = await publicBaseUrl();
  const setup = await activePaymentSetup(base, String(formData.get("gateway") ?? "") || null, { includeOffline: false });
  if (!setup.enabled) return { ok: false, message: setup.reason };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };
  const organizationId = auth.context.organization.id;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sms_credit_start_checkout", { p_org: organizationId, p_sms: count, p_provider: setup.code, p_mode: setup.mode });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Création du paiement impossible.") };
  const checkout = data as { payment_id: string; reference: string; sms: number; amount: number; currency: string };

  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const returnUrl = `${base}/communication/credit-sms/retour?ref=${encodeURIComponent(checkout.reference)}`;
  let checkoutUrl: string;
  try {
    const session = await setup.provider.createCheckout({
      reference: checkout.reference,
      amount: checkout.amount,
      currency: checkout.currency,
      description: `NeoScool — crédit de ${checkout.sms} SMS`,
      itemName: `Crédit SMS (${checkout.sms} SMS)`,
      storeName: "NeoScool",
      returnUrl,
      cancelUrl: `${returnUrl}&annule=1`,
      callbackUrl: `${base}/api/webhooks/payments/${setup.code}${secret ? `?cle=${encodeURIComponent(secret)}` : ""}`,
      customData: { kind: "sms_credit", organization_id: organizationId },
    });
    const { error: attachError } = await admin.rpc("sms_credit_attach_checkout", {
      p_payment: checkout.payment_id,
      p_provider_tx: session.providerTransactionId,
      p_checkout_url: session.checkoutUrl,
      p_response: session.raw as never,
    });
    if (attachError) throw new PaymentProviderError("Enregistrement du paiement impossible.");
    checkoutUrl = session.checkoutUrl;
  } catch (e) {
    await admin.rpc("sms_credit_fail_payment", {
      p_provider: setup.code,
      p_mode: setup.mode,
      p_provider_tx: null as never,
      p_reference: checkout.reference,
      p_status: "FAILED",
      p_reason: e instanceof PaymentProviderError ? e.message : "Création du paiement impossible",
      p_response: (e instanceof PaymentProviderError ? e.details : {}) as never,
    });
    revalidatePath("/communication/credit-sms");
    return { ok: false, message: e instanceof PaymentProviderError ? e.message : "Le fournisseur de paiement est indisponible. Réessayez dans un instant." };
  }
  redirect(checkoutUrl);
}

/** Retour du navigateur : jamais une preuve ; relance seulement la vérification serveur. */
export async function verifyReturnedSmsPayment(reference: string) {
  const context = await getSessionContext();
  if (!context || !REFERENCE.test(reference)) return null;
  const supabase = await createClient();
  const { data: pay } = await supabase
    .from("sms_credit_purchases")
    .select("provider, provider_transaction_id, status, sms_count, amount, currency")
    .eq("internal_reference", reference)
    .maybeSingle();
  if (!pay) return null;
  if (pay.status !== "SUCCESS" && pay.provider_transaction_id) await processProviderSignal(pay.provider, pay.provider_transaction_id);
  const { data: after } = await supabase.from("sms_credit_purchases").select("status, sms_count, amount, currency").eq("internal_reference", reference).maybeSingle();
  return after;
}

/** Mode test local : même chemin qu'une notification réelle (vérification comprise). */
export async function simulateSmsPayment(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const context = await getSessionContext();
  if (!context || !simulationAllowed() || !REFERENCE.test(reference) || !["completed", "cancelled", "failed"].includes(outcome)) {
    redirect("/communication/credit-sms");
  }
  const supabase = await createClient();
  const { data: pay } = await supabase.from("sms_credit_purchases").select("amount, provider, provider_transaction_id").eq("internal_reference", reference).maybeSingle();
  const admin = createAdminClient();
  if (!pay || pay.provider !== "simulation" || !pay.provider_transaction_id || !admin) redirect("/communication/credit-sms");
  await admin.from("payment_simulations").upsert({ reference, outcome, amount: pay.amount });
  await receiveWebhook("simulation", { token: pay.provider_transaction_id }, "simulation");
  redirect(`/communication/credit-sms/retour?ref=${encodeURIComponent(reference)}`);
}
