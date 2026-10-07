import "server-only";

import { can, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Paiement FeexPay en attente, retrouvé pour l'utilisateur connecté :
 * abonnement de l'établissement actif (droit billing.read / billing.manage)
 * ou accès enseignant de son propre compte (RLS : ses paiements uniquement).
 */
export type FeexPayPayment = {
  kind: "subscription" | "teacher";
  reference: string;
  amount: number;
  currency: string;
  status: string;
  mode: string;
  returnPath: string;
  canPay: boolean;
};

const REFERENCE = /^NEO-\d{4}-\d{6,}$/;

export async function loadFeexPayPayment(reference: string): Promise<FeexPayPayment | null> {
  if (!REFERENCE.test(reference)) return null;
  const context = await getSessionContext();
  if (!context) return null;
  const supabase = await createClient();
  if (context.organization && can(context, "billing.read")) {
    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("internal_reference, amount, currency, status, mode, provider")
      .eq("organization_id", context.organization.id)
      .eq("internal_reference", reference)
      .maybeSingle();
    if (tx) {
      return tx.provider === "feexpay"
        ? {
            kind: "subscription",
            reference,
            amount: tx.amount,
            currency: tx.currency,
            status: tx.status,
            mode: tx.mode,
            returnPath: `/abonnement/retour?ref=${encodeURIComponent(reference)}`,
            canPay: can(context, "billing.manage"),
          }
        : null;
    }
  }
  const { data: pay } = await supabase
    .from("teacher_access_payments")
    .select("internal_reference, amount, currency, status, mode, provider")
    .eq("internal_reference", reference)
    .maybeSingle();
  if (!pay || pay.provider !== "feexpay") return null;
  return {
    kind: "teacher",
    reference,
    amount: pay.amount,
    currency: pay.currency,
    status: pay.status,
    mode: pay.mode,
    returnPath: `/mes-etablissements/retour?ref=${encodeURIComponent(reference)}`,
    canPay: true,
  };
}
