import type { CheckoutRequest, CheckoutSession, PaymentProvider, VerifiedPayment, WebhookSignal } from "./types";

/**
 * Fournisseur simulé (mode test local, sans argent réel) : permet de dérouler
 * tout le parcours — paiement, retour, notification, vérification serveur —
 * sans clé de fournisseur. L'« état chez le fournisseur » est conservé côté
 * serveur (table payment_simulations, service role) : le navigateur ne peut
 * jamais le lire ni l'écrire directement. Refusé en production (voir config).
 */
export type SimulationStore = {
  getOutcome(reference: string): Promise<{ outcome: "completed" | "cancelled" | "failed"; amount: number } | null>;
};

export class SimulationProvider implements PaymentProvider {
  readonly code = "simulation";
  readonly mode = "test" as const;
  private readonly baseUrl: string;
  private readonly store: SimulationStore;

  constructor(baseUrl: string, store: SimulationStore) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.store = store;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return {
      providerTransactionId: `SIM-${request.reference}`,
      checkoutUrl: `${this.baseUrl}/abonnement/paiement-simule/${encodeURIComponent(request.reference)}`,
      raw: { simulated: true },
    };
  }

  async getPaymentStatus(providerTransactionId: string): Promise<VerifiedPayment> {
    const reference = providerTransactionId.replace(/^SIM-/, "");
    const stored = await this.store.getOutcome(reference);
    return {
      state: !stored ? "pending" : stored.outcome === "completed" ? "paid" : stored.outcome,
      providerTransactionId,
      amount: stored?.amount ?? null,
      currency: stored ? "XOF" : null,
      reference,
      method: stored?.outcome === "completed" ? "simulation" : null,
      raw: { simulated: true, outcome: stored?.outcome ?? "pending" },
    };
  }

  verifyPayment(providerTransactionId: string): Promise<VerifiedPayment> {
    return this.getPaymentStatus(providerTransactionId);
  }

  handleWebhook(body: unknown): WebhookSignal {
    const token = body && typeof body === "object" ? (body as Record<string, unknown>).token : null;
    return { providerTransactionId: typeof token === "string" && /^SIM-NEO-\d{4}-\d{6,}$/.test(token) ? token : null, reference: null };
  }

  async refundPayment(): Promise<{ supported: false; message: string }> {
    return { supported: false, message: "Remboursement non applicable au paiement simulé." };
  }
}
