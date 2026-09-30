"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { processProviderSignal, receiveWebhook } from "@/features/billing/server";
import { getSessionContext } from "@/lib/auth/session";
import { activePaymentSetup, simulationAllowed } from "@/lib/payments/config";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

const REFERENCE = /^NEO-\d{4}-\d{6,}$/;

function refresh() {
  revalidatePath("/", "layout");
}

/** Réponse de l'enseignant à une invitation : son compte existant, rien n'est créé. */
export async function respondInvitation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const membershipId = String(formData.get("membership_id") ?? "");
  const accept = formData.get("accept") === "true";
  if (!isUuid(membershipId)) return { ok: false, message: "Invitation introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_membership_invitation", { p_membership_id: membershipId, p_accept: accept });
  if (error || !data) return { ok: false, message: dbErrorMessage(error) };
  const result = data as { result: string; organization: string; payment_required?: boolean };
  refresh();
  if (!accept) return { ok: true, message: `Invitation de ${result.organization} refusée. Votre compte n'est pas modifié.` };
  return {
    ok: true,
    message: result.payment_required
      ? `Invitation acceptée. L'accès à ${result.organization} sera ouvert après le paiement de l'abonnement supplémentaire.`
      : `Invitation acceptée : ${result.organization} est disponible dans votre liste d'établissements.`,
  };
}

/**
 * Paiement de l'accès supplémentaire : montant et périodicité calculés en base
 * (réglage Super Admin), paiement chez le fournisseur, activation seulement
 * après vérification serveur du paiement (même circuit que les abonnements).
 */
export async function startTeacherAccessCheckout(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const organizationId = String(formData.get("organization_id") ?? "");
  if (!isUuid(organizationId)) return { ok: false, message: "Établissement invalide." };
  const base = await publicBaseUrl();
  const setup = activePaymentSetup(base);
  if (!setup.enabled) return { ok: false, message: setup.reason };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("teacher_access_start_checkout", { p_org: organizationId, p_provider: setup.code, p_mode: setup.mode });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Création du paiement impossible.") };
  const checkout = data as { payment_id: string; reference: string; amount: number; currency: string; period_months: number; organization_name: string };

  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const returnUrl = `${base}/mes-etablissements/retour?ref=${encodeURIComponent(checkout.reference)}`;
  const months = checkout.period_months === 1 ? "1 mois" : `${checkout.period_months} mois`;
  let checkoutUrl: string;
  try {
    const session = await setup.provider.createCheckout({
      reference: checkout.reference,
      amount: checkout.amount,
      currency: checkout.currency,
      description: `Neoscool — accès enseignant supplémentaire : ${checkout.organization_name} (${months})`,
      itemName: `Accès enseignant ${checkout.organization_name} (${months})`,
      storeName: "NeoScool",
      returnUrl,
      cancelUrl: `${returnUrl}&annule=1`,
      callbackUrl: `${base}/api/webhooks/payments/${setup.code}${secret ? `?cle=${encodeURIComponent(secret)}` : ""}`,
      customData: { kind: "teacher_access", organization_id: organizationId },
    });
    const { error: attachError } = await admin.rpc("teacher_access_attach_checkout", {
      p_payment: checkout.payment_id,
      p_provider_tx: session.providerTransactionId,
      p_checkout_url: session.checkoutUrl,
      p_response: session.raw as never,
    });
    if (attachError) throw new PaymentProviderError("Enregistrement du paiement impossible.");
    checkoutUrl = session.checkoutUrl;
  } catch (e) {
    await admin.rpc("teacher_access_fail_payment", {
      p_provider: setup.code,
      p_mode: setup.mode,
      p_provider_tx: null as never,
      p_reference: checkout.reference,
      p_status: "FAILED",
      p_reason: e instanceof PaymentProviderError ? e.message : "Création du paiement impossible",
      p_response: (e instanceof PaymentProviderError ? e.details : {}) as never,
    });
    revalidatePath("/mes-etablissements");
    return { ok: false, message: e instanceof PaymentProviderError ? e.message : "Le fournisseur de paiement est indisponible. Réessayez dans un instant." };
  }
  redirect(checkoutUrl);
}

/** Retour du navigateur : jamais une preuve ; relance seulement la vérification serveur. */
export async function verifyReturnedTeacherPayment(reference: string) {
  const context = await getSessionContext();
  if (!context || !REFERENCE.test(reference)) return null;
  const supabase = await createClient();
  // RLS : seuls les paiements du compte connecté sont visibles.
  const { data: pay } = await supabase
    .from("teacher_access_payments")
    .select("provider, provider_transaction_id, status, organization_id, covers_to")
    .eq("internal_reference", reference)
    .maybeSingle();
  if (!pay) return null;
  if (pay.status === "SUCCESS" || !pay.provider_transaction_id || pay.provider === "manual") return { status: pay.status, coversTo: pay.covers_to };
  await processProviderSignal(pay.provider, pay.provider_transaction_id);
  const { data: after } = await supabase.from("teacher_access_payments").select("status, covers_to").eq("internal_reference", reference).maybeSingle();
  return after ? { status: after.status, coversTo: after.covers_to } : null;
}

/** Mode test local : même chemin qu'une notification réelle (vérification comprise). */
export async function simulateTeacherPayment(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const context = await getSessionContext();
  if (!context || !simulationAllowed() || !REFERENCE.test(reference) || !["completed", "cancelled", "failed"].includes(outcome)) {
    redirect("/mes-etablissements");
  }
  const supabase = await createClient();
  const { data: pay } = await supabase
    .from("teacher_access_payments")
    .select("amount, provider, provider_transaction_id")
    .eq("internal_reference", reference)
    .maybeSingle();
  const admin = createAdminClient();
  if (!pay || pay.provider !== "simulation" || !pay.provider_transaction_id || !admin) redirect("/mes-etablissements");
  await admin.from("payment_simulations").upsert({ reference, outcome, amount: pay.amount });
  await receiveWebhook("simulation", { token: pay.provider_transaction_id }, "simulation");
  redirect(`/mes-etablissements/retour?ref=${encodeURIComponent(reference)}`);
}
