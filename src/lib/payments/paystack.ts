import { detail, pick, providerRequest, REFERENCE, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Paystack — API (https://paystack.com/docs/api) :
 *   POST https://api.paystack.co/transaction/initialize → data.authorization_url
 *   GET  https://api.paystack.co/transaction/verify/{reference} → data.status (success, failed, abandoned)
 * Montants en sous-unité de la devise (× 100). Clé secrète sk_test_… / sk_live_….
 */
export type PaystackConfig = { mode: PaymentMode; secretKey: string; fetchImpl?: typeof fetch };
const BASE = "https://api.paystack.co";

function state(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "success") return "paid";
  if (s === "failed" || s === "reversed") return "failed";
  if (s === "abandoned") return "cancelled";
  return "pending";
}

export class PaystackProvider implements PaymentProvider {
  readonly code = "paystack";
  readonly mode: PaymentMode;
  private readonly config: PaystackConfig;
  constructor(config: PaystackConfig) {
    if (!config.secretKey) throw new PaymentProviderError("Configuration Paystack incomplète (clé secrète).");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, body?: unknown) {
    return providerRequest("Paystack", `${BASE}${path}`, { method, headers: { Authorization: `Bearer ${this.config.secretKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, fetchImpl: this.config.fetchImpl });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    if (!r.customer?.email) throw new PaymentProviderError("Paystack exige l'adresse e-mail du payeur (fiche de l'établissement).");
    const { json } = await this.call("POST", "/transaction/initialize", {
      email: r.customer.email,
      amount: r.amount * 100,
      currency: r.currency,
      reference: r.reference,
      callback_url: r.returnUrl,
      metadata: { reference: r.reference, description: r.description.slice(0, 200) },
    });
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (json.status !== true || typeof data.authorization_url !== "string") throw new PaymentProviderError("Paystack a refusé la création du paiement.", detail(json, "message"));
    return { providerTransactionId: r.reference, checkoutUrl: data.authorization_url, raw: { access_code: data.access_code ?? null } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!REFERENCE.test(id)) throw new PaymentProviderError("Référence Paystack invalide.");
    const { status, json } = await this.call("GET", `/transaction/verify/${encodeURIComponent(id)}`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (status === 404 || (json.status === false && !json.data)) return { state: "pending", providerTransactionId: id, amount: null, currency: null, reference: id, method: null, raw: { message: json.message ?? null } };
    if (status >= 300) throw new PaymentProviderError("Statut Paystack indisponible.", detail(json, "message"));
    const amount = toInteger(data.amount);
    return {
      state: state(data.status),
      providerTransactionId: id,
      amount: amount === null ? null : Math.round(amount / 100),
      currency: typeof data.currency === "string" ? data.currency : null,
      reference: typeof data.reference === "string" ? data.reference : id,
      method: typeof data.channel === "string" ? data.channel : null,
      raw: { id: data.id ?? null, status: data.status ?? null, amount: data.amount ?? null, currency: data.currency ?? null, channel: data.channel ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const ref = pick(body, ["data", "reference"]);
    const ok = typeof ref === "string" && REFERENCE.test(ref) ? ref : null;
    return { providerTransactionId: ok, reference: ok };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord Paystack, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { status } = await this.call("GET", "/balance");
    if (status === 401 || status === 403) return { ok: false as const, error: "Paystack refuse la clé secrète." };
    return status < 300 ? { ok: true as const, message: "Clé Paystack acceptée." } : { ok: false as const, error: `Paystack a répondu ${status}.` };
  }
}
