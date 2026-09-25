"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { processProviderSignal, receiveWebhook } from "@/features/billing/server";
import { can, getSessionContext } from "@/lib/auth/session";
import { activePaymentSetup, simulationAllowed } from "@/lib/payments/config";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

const choiceSchema = z.object({
  plan: z.string().regex(/^[A-Z][A-Z_]{2,39}$/, { error: "Formule invalide." }),
  interval: z.enum(["MONTHLY", "YEARLY"], { error: "Périodicité invalide." }),
});

async function billingContext(permission: "billing.manage" | "billing.read") {
  const context = await getSessionContext();
  if (!context?.organization) return { ok: false as const, message: "Votre session a expiré. Reconnectez-vous." };
  if (!can(context, permission)) return { ok: false as const, message: "Seule la direction de l'établissement peut gérer l'abonnement NéoScol." };
  return { ok: true as const, context, organizationId: context.organization.id };
}

/**
 * Paiement de l'abonnement : facture + transaction locale (montant calculé en
 * base), création du paiement chez le fournisseur, redirection vers sa page.
 * L'abonnement n'est activé qu'après vérification serveur du paiement.
 */
export async function startSubscriptionCheckout(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await billingContext("billing.manage");
  if (!auth.ok) return auth;
  const choice = choiceSchema.safeParse({ plan: formData.get("plan"), interval: formData.get("interval") });
  if (!choice.success) return { ok: false, message: choice.error.issues[0]?.message ?? "Choix invalide." };

  const base = await publicBaseUrl();
  const setup = activePaymentSetup(base);
  if (!setup.enabled) return { ok: false, message: setup.reason };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète (clé de service Supabase absente)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_start_checkout", {
    p_org: auth.organizationId,
    p_plan_code: choice.data.plan,
    p_interval: choice.data.interval,
    p_provider: setup.code,
    p_mode: setup.mode,
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Création du paiement impossible.") };
  const checkout = data as { transaction_id: string; reference: string; amount: number; currency: string; invoice_number: string; plan_name: string; interval: string };

  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const returnUrl = `${base}/abonnement/retour?ref=${encodeURIComponent(checkout.reference)}`;
  let checkoutUrl: string;
  try {
    const session = await setup.provider.createCheckout({
      reference: checkout.reference,
      amount: checkout.amount,
      currency: checkout.currency,
      description: `Abonnement NéoScol ${checkout.plan_name} — ${checkout.interval === "YEARLY" ? "annuel" : "mensuel"} — facture ${checkout.invoice_number}`,
      itemName: `NéoScol ${checkout.plan_name} (${checkout.interval === "YEARLY" ? "12 mois" : "1 mois"})`,
      storeName: "NéoScol",
      returnUrl,
      cancelUrl: `${returnUrl}&annule=1`,
      callbackUrl: `${base}/api/webhooks/payments/${setup.code}${secret ? `?cle=${encodeURIComponent(secret)}` : ""}`,
      customData: { organization_id: auth.organizationId, invoice_number: checkout.invoice_number },
    });
    const { error: attachError } = await admin.rpc("billing_attach_checkout", {
      p_transaction: checkout.transaction_id,
      p_provider_tx: session.providerTransactionId,
      p_checkout_url: session.checkoutUrl,
      p_response: session.raw as never,
    });
    if (attachError) throw new PaymentProviderError("Enregistrement du paiement impossible.");
    checkoutUrl = session.checkoutUrl;
  } catch (e) {
    await admin.rpc("billing_fail_payment", {
      p_provider: setup.code,
      p_mode: setup.mode,
      p_provider_tx: null as never,
      p_reference: checkout.reference,
      p_status: "FAILED",
      p_reason: e instanceof PaymentProviderError ? e.message : "Création du paiement impossible",
      p_response: (e instanceof PaymentProviderError ? e.details : {}) as never,
    });
    revalidatePath("/abonnement");
    return { ok: false, message: e instanceof PaymentProviderError ? e.message : "Le fournisseur de paiement est indisponible. Réessayez dans un instant." };
  }
  redirect(checkoutUrl);
}

/** Pendant l'essai : changer de formule sans payer. */
export async function changeTrialPlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await billingContext("billing.manage");
  if (!auth.ok) return auth;
  const choice = choiceSchema.safeParse({ plan: formData.get("plan"), interval: formData.get("interval") });
  if (!choice.success) return { ok: false, message: choice.error.issues[0]?.message ?? "Choix invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_change_trial_plan", { p_org: auth.organizationId, p_plan_code: choice.data.plan, p_interval: choice.data.interval });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/abonnement");
  return { ok: true, message: "Formule de votre essai mise à jour. Aucun paiement n'est demandé pendant l'essai." };
}

export async function cancelSubscription(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await billingContext("billing.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_cancel", { p_org: auth.organizationId, p_reason: String(formData.get("reason") ?? "").slice(0, 500) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/abonnement");
  return { ok: true, message: "Annulation enregistrée : l'accès reste complet jusqu'à la fin de la période en cours. Vos données sont conservées." };
}

export async function resumeSubscription(): Promise<ActionResult> {
  const auth = await billingContext("billing.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("billing_resume", { p_org: auth.organizationId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/abonnement");
  return { ok: true, message: "Annulation retirée : votre abonnement continue normalement." };
}

/**
 * Retour du navigateur après paiement : ce n'est PAS une preuve. On relance
 * seulement la vérification serveur auprès du fournisseur pour cette transaction.
 */
export async function verifyReturnedPayment(reference: string) {
  const auth = await billingContext("billing.read");
  if (!auth.ok || !/^NEO-\d{4}-\d{6,}$/.test(reference)) return null;
  const supabase = await createClient();
  // Lecture sous RLS : seule une transaction de l'établissement de l'utilisateur est visible.
  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("id, provider, provider_transaction_id, status")
    .eq("organization_id", auth.organizationId)
    .eq("internal_reference", reference)
    .maybeSingle();
  if (!tx) return null;
  if (tx.status === "SUCCESS" || !tx.provider_transaction_id || tx.provider === "manual") return tx.status;
  const result = await processProviderSignal(tx.provider, tx.provider_transaction_id);
  return result.status;
}

/**
 * Mode test local : l'utilisateur choisit l'issue sur la page de paiement simulé,
 * l'issue est enregistrée côté « fournisseur » (serveur), puis la notification
 * suit exactement le même chemin qu'un webhook réel (vérification comprise).
 */
export async function simulatePayment(formData: FormData): Promise<void> {
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const auth = await billingContext("billing.manage");
  if (!auth.ok || !simulationAllowed() || !/^NEO-\d{4}-\d{6,}$/.test(reference) || !["completed", "cancelled", "failed"].includes(outcome)) {
    redirect("/abonnement");
  }
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("id, amount, provider, provider_transaction_id, status")
    .eq("organization_id", auth.organizationId)
    .eq("internal_reference", reference)
    .maybeSingle();
  const admin = createAdminClient();
  if (!tx || tx.provider !== "simulation" || !tx.provider_transaction_id || !admin) redirect("/abonnement");
  await admin.from("payment_simulations").upsert({ reference, outcome, amount: tx.amount });
  await receiveWebhook("simulation", { token: tx.provider_transaction_id }, "simulation");
  redirect(`/abonnement/retour?ref=${encodeURIComponent(reference)}`);
}
