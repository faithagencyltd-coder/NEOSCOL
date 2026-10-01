import type { CheckoutRequest, CheckoutSession, PaymentProvider, VerifiedPayment, WebhookSignal } from "./types";

/**
 * Fournisseur de TEST des paiements des familles (adapter « mock ») : mode test
 * uniquement (contrainte en base), refusé en production sauf autorisation
 * explicite (PAYMENT_ALLOW_SIMULATION=1). Il se comporte comme un vrai
 * agrégateur : page de paiement, notification, puis vérification serveur.
 * L'« état chez le fournisseur » est conservé côté serveur (payment_simulations,
 * service role) : le navigateur ne peut ni le lire ni l'écrire directement.
 */
export type MockStore = {
  getState(reference: string): Promise<{ outcome: "completed" | "cancelled" | "failed"; amount: number; currency: string } | null>;
};

const MOCK_ID = /^MOCK-NEO-\d{4}-\d{6,}$/;

export class MockSchoolProvider implements PaymentProvider {
  readonly code = "mock";
  readonly mode = "test" as const;
  private readonly baseUrl: string;
  private readonly store: MockStore;

  constructor(baseUrl: string, store: MockStore) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.store = store;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return {
      providerTransactionId: `MOCK-${request.reference}`,
      checkoutUrl: `${this.baseUrl}/portail/finances/paiement-test/${encodeURIComponent(request.reference)}`,
      raw: { test_provider: true, amount: request.amount, currency: request.currency },
    };
  }

  async getPaymentStatus(providerTransactionId: string): Promise<VerifiedPayment> {
    const reference = providerTransactionId.replace(/^MOCK-/, "");
    const stored = await this.store.getState(reference);
    return {
      state: !stored ? "pending" : stored.outcome === "completed" ? "paid" : stored.outcome,
      providerTransactionId,
      amount: stored?.amount ?? null,
      currency: stored?.currency ?? null,
      reference,
      method: stored?.outcome === "completed" ? "test" : null,
      raw: { test_provider: true, status: stored?.outcome ?? "pending", amount: stored?.amount ?? null },
    };
  }

  verifyPayment(providerTransactionId: string): Promise<VerifiedPayment> {
    return this.getPaymentStatus(providerTransactionId);
  }

  handleWebhook(body: unknown): WebhookSignal {
    const id = body && typeof body === "object" ? (body as Record<string, unknown>).transaction_id : null;
    return { providerTransactionId: typeof id === "string" && MOCK_ID.test(id) ? id : null, reference: null };
  }

  async refundPayment(providerTransactionId: string, amount: number) {
    return { supported: true as const, raw: { test_provider: true, refund_id: `MOCK-RF-${providerTransactionId.slice(5)}-${amount}`, amount } };
  }

  async checkCredentials() {
    return { ok: true as const, message: "Fournisseur de test : aucune connexion externe, aucun argent réel." };
  }
}
