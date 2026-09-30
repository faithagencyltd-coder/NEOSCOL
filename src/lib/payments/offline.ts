import { type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Paiement par transfert (universel) : Mobile Money, virement ou lien de
 * paiement de n'importe quel fournisseur. Le client paie selon les
 * instructions du Super Admin puis déclare sa référence ; rien n'est activé
 * tant que le Super Admin n'a pas validé le paiement (aucune confirmation automatique).
 */
export class OfflineProvider implements PaymentProvider {
  readonly code = "offline";
  readonly mode: PaymentMode;
  private readonly baseUrl: string;
  constructor(mode: PaymentMode, baseUrl: string) {
    this.mode = mode;
    this.baseUrl = baseUrl;
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    const kind = r.customData.kind === "teacher_access" ? "mes-etablissements" : "abonnement";
    return { providerTransactionId: `OFF-${r.reference}`, checkoutUrl: `${this.baseUrl}/${kind}/transfert/${encodeURIComponent(r.reference)}`, raw: { offline: true } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    return { state: "pending", providerTransactionId: id, amount: null, currency: null, reference: id.replace(/^OFF-/, ""), method: "transfer", raw: { awaiting: "validation Super Admin" } };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(): WebhookSignal {
    return { providerTransactionId: null, reference: null };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer hors plateforme." };
  }
}
