import { detail, pick, providerRequest, REFERENCE, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Stripe — Checkout Sessions (https://docs.stripe.com/api/checkout/sessions) :
 *   POST https://api.stripe.com/v1/checkout/sessions (formulaire) → url
 *   GET  https://api.stripe.com/v1/checkout/sessions/{id} → payment_status (paid…)
 * Le F CFA (XOF) est une devise sans décimales chez Stripe : montant tel quel.
 */
export type StripeConfig = { mode: PaymentMode; secretKey: string; fetchImpl?: typeof fetch };
const BASE = "https://api.stripe.com/v1";
const ZERO_DECIMAL = new Set(["XOF", "XAF", "GNF", "KMF", "MGA", "RWF", "UGX", "JPY", "KRW", "VND", "BIF", "CLP", "DJF", "PYG", "VUV"]);

export class StripeProvider implements PaymentProvider {
  readonly code = "stripe";
  readonly mode: PaymentMode;
  private readonly config: StripeConfig;
  constructor(config: StripeConfig) {
    if (!config.secretKey) throw new PaymentProviderError("Configuration Stripe incomplète (clé secrète).");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, form?: Record<string, string>) {
    return providerRequest("Stripe", `${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form ? new URLSearchParams(form).toString() : undefined,
      fetchImpl: this.config.fetchImpl,
    });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    const unit = ZERO_DECIMAL.has(r.currency) ? r.amount : r.amount * 100;
    const form: Record<string, string> = {
      mode: "payment",
      success_url: r.returnUrl,
      cancel_url: r.cancelUrl,
      client_reference_id: r.reference,
      "metadata[reference]": r.reference,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": r.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(unit),
      "line_items[0][price_data][product_data][name]": r.itemName.slice(0, 200),
      "line_items[0][price_data][product_data][description]": r.description.slice(0, 300),
    };
    if (r.customer?.email) form.customer_email = r.customer.email;
    const { status, json } = await this.call("POST", "/checkout/sessions", form);
    if (status >= 300 || typeof json.id !== "string" || typeof json.url !== "string") {
      const err = (json.error ?? {}) as Record<string, unknown>;
      throw new PaymentProviderError("Stripe a refusé la création du paiement.", detail(err, "type", "code", "message"));
    }
    return { providerTransactionId: json.id, checkoutUrl: json.url, raw: { id: json.id } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!/^cs_(test|live)_[A-Za-z0-9]{8,200}$/.test(id)) throw new PaymentProviderError("Identifiant Stripe invalide.");
    const { status, json } = await this.call("GET", `/checkout/sessions/${id}`);
    if (status >= 300) throw new PaymentProviderError("Statut Stripe indisponible.", detail((json.error ?? {}) as Record<string, unknown>, "type", "message"));
    const currency = typeof json.currency === "string" ? json.currency.toUpperCase() : null;
    const total = toInteger(json.amount_total);
    const meta = (json.metadata ?? {}) as Record<string, unknown>;
    const ref = typeof meta.reference === "string" && REFERENCE.test(meta.reference) ? meta.reference : typeof json.client_reference_id === "string" ? json.client_reference_id : null;
    const paid = json.payment_status === "paid";
    return {
      state: paid ? "paid" : json.status === "expired" ? "cancelled" : "pending",
      providerTransactionId: id,
      amount: total === null ? null : currency && ZERO_DECIMAL.has(currency) ? total : Math.round(total / 100),
      currency,
      reference: ref,
      method: "card",
      raw: { id, status: json.status ?? null, payment_status: json.payment_status ?? null, amount_total: json.amount_total ?? null, currency: json.currency ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const id = pick(body, ["data", "object", "id"]);
    const ref = pick(body, ["data", "object", "client_reference_id"]);
    return { providerTransactionId: typeof id === "string" && id.startsWith("cs_") ? id : null, reference: typeof ref === "string" && REFERENCE.test(ref) ? ref : null };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord Stripe, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { status } = await this.call("GET", "/balance");
    if (status === 401 || status === 403) return { ok: false as const, error: "Stripe refuse la clé secrète." };
    return status < 300 ? { ok: true as const, message: "Clé Stripe acceptée." } : { ok: false as const, error: `Stripe a répondu ${status}.` };
  }
}
