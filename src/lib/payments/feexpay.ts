import { detail, pick, providerRequest, REFERENCE, safeId, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * FeexPay — API REST v2 (bibliothèque PHP officielle feexpay/feexpay-php 3.x) :
 *   POST /api/transactions/requesttopay/integration → demande de paiement envoyée
 *        au téléphone du payeur (réseau + numéro) ; réponse : « reference » FeexPay
 *   GET  /api/transactions/public/single/status/{reference} → status
 *        (SUCCESSFUL, PENDING, FAILED), amount
 *   GET  /api/shop/{shop}/get_shop → nom de la boutique (vérification des clés)
 * Authentification : Authorization: Bearer <clé API fp_…> ; « shop » = identifiant de boutique.
 *
 * FeexPay n'a pas de page de paiement générique : le payeur choisit son réseau et
 * son numéro sur une page NeoScool (/paiement/feexpay/REF). L'identifiant suivi par
 * NeoScool est donc la référence NeoScool ; les références FeexPay obtenues par le
 * serveur sont enregistrées (feexpay_requests) puis revérifiées auprès de FeexPay.
 * FeexPay n'a pas d'environnement de test : le mode n'est qu'une étiquette.
 */
export const FEEXPAY_BASE_URL = "https://api-v2.feexpay.me";

export type FeexPayStore = { requestsFor(reference: string): Promise<string[]> };
export type FeexPayConfig = {
  mode: PaymentMode;
  shopId: string;
  apiKey: string;
  /** Adresse publique de NeoScool (page de paiement). */
  siteUrl: string;
  store: FeexPayStore;
  apiBase?: string;
  fetchImpl?: typeof fetch;
};
export type FeexPayRequest = { reference: string; amount: number; phone: string; network: string; name: string; email: string; otp?: string; description: string };

const FEEX_REF = /^[A-Za-z0-9_.:-]{6,120}$/;

function state(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toUpperCase();
  if (s === "SUCCESSFUL" || s === "SUCCESS") return "paid";
  if (s === "FAILED" || s === "REJECTED" || s === "EXPIRED") return "failed";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  return "pending";
}

export class FeexPayProvider implements PaymentProvider {
  readonly code = "feexpay";
  readonly mode: PaymentMode;
  private readonly config: FeexPayConfig;
  constructor(config: FeexPayConfig) {
    if (!config.apiKey || !config.shopId) throw new PaymentProviderError("Configuration FeexPay incomplète (identifiant de boutique et clé API).");
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(config.shopId)) throw new PaymentProviderError("Identifiant de boutique FeexPay invalide.");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, body?: unknown, timeoutMs?: number) {
    return providerRequest("FeexPay", `${this.config.apiBase ?? FEEXPAY_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      fetchImpl: this.config.fetchImpl,
      timeoutMs,
    });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    if (!REFERENCE.test(r.reference)) throw new PaymentProviderError("Référence invalide.");
    return { providerTransactionId: r.reference, checkoutUrl: `${this.config.siteUrl}/paiement/feexpay/${encodeURIComponent(r.reference)}`, raw: { page: "feexpay" } };
  }
  /**
   * Demande de paiement envoyée au téléphone du payeur. Montant et référence
   * viennent toujours de la base, jamais du navigateur. Délai long : selon le
   * réseau, FeexPay ne répond qu'une fois le paiement validé sur le téléphone.
   */
  async requestToPay(r: FeexPayRequest): Promise<{ feexpayReference: string; state: VerifiedPayment["state"] }> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    const { status, json } = await this.call(
      "POST",
      "/api/transactions/requesttopay/integration",
      {
        phoneNumber: r.phone,
        amount: r.amount,
        reseau: r.network,
        shop: this.config.shopId,
        first_name: r.name.slice(0, 80),
        email: r.email,
        description: r.description.replace(/[^A-Za-z0-9 ]/g, " ").slice(0, 100),
        reference: r.reference,
        callback_info: { reference: r.reference },
        otp: r.otp ?? "",
      },
      120000,
    );
    const ref = safeId(json.reference, FEEX_REF);
    if (status >= 300 || !ref) throw new PaymentProviderError(String(json.message ?? "FeexPay a refusé la demande de paiement.").slice(0, 200), detail(json, "message", "status"));
    return { feexpayReference: ref, state: state(json.status) };
  }
  private async statusOf(feexRef: string) {
    const { status, json } = await this.call("GET", `/api/transactions/public/single/status/${encodeURIComponent(feexRef)}`);
    if (status >= 300 || json.status === undefined) throw new PaymentProviderError("Statut FeexPay indisponible.", detail(json, "message"));
    return { state: state(json.status), amount: toInteger(json.amount), raw: { reference: feexRef, status: json.status ?? null, amount: json.amount ?? null } };
  }
  /**
   * État d'un paiement NeoScool : toutes les demandes FeexPay faites par le
   * serveur pour cette référence (le payeur a pu réessayer) sont revérifiées.
   * Une demande refusée ne clôt pas le paiement : le payeur peut réessayer
   * (autre numéro, solde rechargé) ; seul un succès vérifié le confirme.
   */
  async getPaymentStatus(reference: string): Promise<VerifiedPayment> {
    if (!REFERENCE.test(reference)) throw new PaymentProviderError("Référence invalide.");
    const refs = (await this.config.store.requestsFor(reference)).filter((r) => FEEX_REF.test(r));
    const results = await Promise.all(refs.map((r) => this.statusOf(r)));
    const paid = results.find((r) => r.state === "paid");
    if (paid) return { state: "paid", providerTransactionId: reference, amount: paid.amount, currency: "XOF", reference: null, method: "mobile_money", raw: paid.raw };
    return { state: "pending", providerTransactionId: reference, amount: null, currency: null, reference: null, method: null, raw: { requests: refs.length, last: results[0]?.raw ?? null } };
  }
  /** État de la dernière demande (affichage : « refusée, réessayez »). */
  async latestAttempt(reference: string): Promise<VerifiedPayment["state"] | null> {
    const [last] = (await this.config.store.requestsFor(reference)).filter((r) => FEEX_REF.test(r));
    return last ? (await this.statusOf(last)).state : null;
  }
  verifyPayment(reference: string) {
    return this.getPaymentStatus(reference);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const candidates = [pick(body, ["callback_info", "reference"]), pick(body, ["callback_info"]), pick(body, ["customId"]), pick(body, ["reference"])];
    const ref = candidates.find((c) => typeof c === "string" && REFERENCE.test(c)) as string | undefined;
    return { providerTransactionId: ref ?? null, reference: ref ?? null };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord FeexPay, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { status, json } = await this.call("GET", `/api/shop/${encodeURIComponent(this.config.shopId)}/get_shop`);
    if (status === 401 || status === 403) return { ok: false as const, error: "FeexPay refuse la clé API." };
    if (status >= 300 || typeof json.name !== "string") return { ok: false as const, error: `Boutique FeexPay introuvable (réponse ${status}).` };
    return { ok: true as const, message: `Boutique FeexPay « ${json.name.slice(0, 80)} » trouvée. FeexPay n'a pas de mode test : faites un petit paiement réel pour vérifier.` };
  }
}
