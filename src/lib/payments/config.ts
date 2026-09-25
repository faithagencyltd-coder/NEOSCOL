import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { PayDunyaProvider } from "./paydunya";
import { SimulationProvider } from "./simulation";
import type { PaymentMode, PaymentProvider } from "./types";

/**
 * Configuration des paiements, lue UNIQUEMENT côté serveur.
 * Aucune de ces variables n'est préfixée NEXT_PUBLIC_ : elles ne peuvent pas
 * atteindre le navigateur. Les clés ne sont jamais journalisées.
 *
 *   PAYMENT_PROVIDER      paydunya | simulation   (vide : paiement en ligne désactivé)
 *   PAYDUNYA_MODE         test | live              (test par défaut)
 *   PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_PUBLIC_KEY, PAYDUNYA_TOKEN
 *   PAYMENT_WEBHOOK_SECRET  secret ajouté à l'URL de notification (recommandé)
 *   PAYMENT_ALLOW_SIMULATION=1  autorise le paiement simulé hors développement
 *                                (démonstration locale uniquement, jamais en production réelle)
 */
export type PaymentSetup =
  | { enabled: true; provider: PaymentProvider; code: string; mode: PaymentMode; label: string }
  | { enabled: false; reason: string };

export function paydunyaMode(): PaymentMode {
  return ["live", "production", "prod"].includes((process.env.PAYDUNYA_MODE ?? "test").toLowerCase()) ? "live" : "test";
}

export function simulationAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENT_ALLOW_SIMULATION === "1";
}

const simulationStore = {
  async getOutcome(reference: string) {
    const admin = createAdminClient();
    if (!admin) return null;
    const { data } = await admin.from("payment_simulations").select("outcome, amount").eq("reference", reference).maybeSingle();
    return data ? { outcome: data.outcome as "completed" | "cancelled" | "failed", amount: data.amount } : null;
  },
};

/** Fournisseur d'un code donné (webhook /api/webhooks/payments/[provider]). */
export function providerFor(code: string, baseUrl: string): PaymentSetup {
  if (code === "paydunya") {
    try {
      const provider = new PayDunyaProvider({
        mode: paydunyaMode(),
        masterKey: process.env.PAYDUNYA_MASTER_KEY ?? "",
        privateKey: process.env.PAYDUNYA_PRIVATE_KEY ?? "",
        token: process.env.PAYDUNYA_TOKEN ?? "",
      });
      return { enabled: true, provider, code, mode: provider.mode, label: provider.mode === "test" ? "PayDunya (mode test)" : "PayDunya" };
    } catch {
      return { enabled: false, reason: "PayDunya n'est pas configuré sur le serveur (clés manquantes)." };
    }
  }
  if (code === "simulation") {
    if (!simulationAllowed()) return { enabled: false, reason: "Le paiement simulé est désactivé en production." };
    return { enabled: true, provider: new SimulationProvider(baseUrl, simulationStore), code, mode: "test", label: "Paiement simulé (mode test, aucun argent réel)" };
  }
  return { enabled: false, reason: "Fournisseur de paiement inconnu." };
}

/** Fournisseur actif pour les nouveaux paiements. */
export function activePaymentSetup(baseUrl: string): PaymentSetup {
  const code = (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  if (!code) return { enabled: false, reason: "Le paiement en ligne n'est pas encore activé sur ce serveur (PAYMENT_PROVIDER)." };
  return providerFor(code, baseUrl);
}
