import { detail, pick, providerRequest, REFERENCE, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Wave — API Checkout (https://docs.wave.com/checkout) :
 *   POST https://api.wave.com/v1/checkout/sessions → id, wave_launch_url
 *   GET  https://api.wave.com/v1/checkout/sessions/{id} → payment_status (succeeded…)
 * Authentification : Authorization: Bearer <clé API Wave Business>.
 */
export type WaveConfig = { mode: PaymentMode; apiKey: string; fetchImpl?: typeof fetch };
const BASE = "https://api.wave.com/v1";

export class WaveProvider implements PaymentProvider {
  readonly code = "wave";
  readonly mode: PaymentMode;
  private readonly config: WaveConfig;
  constructor(config: WaveConfig) {
    if (!config.apiKey) throw new PaymentProviderError("Configuration Wave incomplète (clé API).");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, body?: unknown) {
    return providerRequest("Wave", `${BASE}${path}`, { method, headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, fetchImpl: this.config.fetchImpl });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    const { status, json } = await this.call("POST", "/checkout/sessions", {
      amount: String(r.amount),
      currency: r.currency,
      success_url: r.returnUrl,
      error_url: r.cancelUrl,
      client_reference: r.reference,
    });
    if (status >= 300 || typeof json.id !== "string" || typeof json.wave_launch_url !== "string") throw new PaymentProviderError("Wave a refusé la création du paiement.", detail(json, "code", "message"));
    return { providerTransactionId: json.id, checkoutUrl: json.wave_launch_url, raw: { id: json.id } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!/^[A-Za-z0-9_-]{4,120}$/.test(id)) throw new PaymentProviderError("Identifiant Wave invalide.");
    const { status, json } = await this.call("GET", `/checkout/sessions/${id}`);
    if (status >= 300) throw new PaymentProviderError("Statut Wave indisponible.", detail(json, "code", "message"));
    const ps = String(json.payment_status ?? "").toLowerCase();
    const ref = typeof json.client_reference === "string" && REFERENCE.test(json.client_reference) ? json.client_reference : null;
    return {
      state: ps === "succeeded" ? "paid" : ps === "cancelled" || json.checkout_status === "expired" ? "cancelled" : "pending",
      providerTransactionId: id,
      amount: toInteger(json.amount),
      currency: typeof json.currency === "string" ? json.currency : null,
      reference: ref,
      method: "wave",
      raw: { id, checkout_status: json.checkout_status ?? null, payment_status: json.payment_status ?? null, amount: json.amount ?? null, transaction_id: json.transaction_id ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const id = pick(body, ["data", "id"]);
    const ref = pick(body, ["data", "client_reference"]);
    return { providerTransactionId: typeof id === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(id) ? id : null, reference: typeof ref === "string" && REFERENCE.test(ref) ? ref : null };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis Wave Business, puis à enregistrer dans NeoScool." };
  }
}
