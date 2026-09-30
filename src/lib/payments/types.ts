/**
 * Abstraction des fournisseurs de paiement des abonnements NeoScool.
 * La logique d'abonnement (base de données) ne dépend que de ce contrat :
 * chaque agrégateur (PayDunya, CinetPay, FedaPay, Flutterwave, Paystack,
 * Stripe, Wave, transfert) en est une implémentation, réglée dans le Super Admin.
 *
 * Règle d'or : seul `verifyPayment` (appel serveur → fournisseur) fait foi.
 * Le retour du navigateur et le contenu d'un webhook ne sont que des signaux.
 */
export type PaymentMode = "test" | "live";

export type CheckoutRequest = {
  /** Référence NeoScool unique (NEO-AAAA-000001). */
  reference: string;
  /** Montant entier en XOF, calculé par la base de données. */
  amount: number;
  currency: string;
  description: string;
  itemName: string;
  storeName: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  customData: Record<string, string>;
  /** Payeur (certains fournisseurs exigent une adresse e-mail). */
  customer?: { email?: string | null; name?: string | null; phone?: string | null };
};

export type CheckoutSession = {
  providerTransactionId: string;
  checkoutUrl: string;
  /** Réponse du fournisseur, sans aucun secret. */
  raw: Record<string, unknown>;
};

export type VerifiedPayment = {
  state: "paid" | "pending" | "failed" | "cancelled";
  providerTransactionId: string;
  amount: number | null;
  currency: string | null;
  /** Référence NeoScool renvoyée par le fournisseur (custom_data), si disponible. */
  reference: string | null;
  method: string | null;
  raw: Record<string, unknown>;
};

export type WebhookSignal = {
  /** Identifiant fournisseur à vérifier ensuite côté serveur. */
  providerTransactionId: string | null;
  reference: string | null;
};

export interface PaymentProvider {
  readonly code: string;
  readonly mode: PaymentMode;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getPaymentStatus(providerTransactionId: string): Promise<VerifiedPayment>;
  /** Vérification serveur → fournisseur : la seule preuve de paiement. */
  verifyPayment(providerTransactionId: string): Promise<VerifiedPayment>;
  /** Extrait l'identifiant à vérifier d'une notification (jamais son statut). */
  handleWebhook(body: unknown): WebhookSignal;
  refundPayment(providerTransactionId: string, amount: number): Promise<{ supported: false; message: string } | { supported: true; raw: Record<string, unknown> }>;
  /** Vérifie les clés auprès du fournisseur, sans créer de paiement (quand l'API le permet). */
  checkCredentials?(): Promise<{ ok: true; message: string } | { ok: false; error: string }>;
}

export class PaymentProviderError extends Error {
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PaymentProviderError";
    this.details = details;
  }
}
