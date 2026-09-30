import { detail, pick, providerRequest, REFERENCE, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Flutterwave — API v3 (https://developer.flutterwave.com) :
 *   POST https://api.flutterwave.com/v3/payments → data.link (paiement hébergé)
 *   GET  https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=… → data.status
 * Clé secrète FLWSECK… (FLWSECK_TEST… en mode test). tx_ref = notre référence.
 */
export type FlutterwaveConfig = { mode: PaymentMode; secretKey: string; fetchImpl?: typeof fetch };
const BASE = "https://api.flutterwave.com/v3";

function state(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "successful") return "paid";
  if (s === "failed") return "failed";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

export class FlutterwaveProvider implements PaymentProvider {
  readonly code = "flutterwave";
  readonly mode: PaymentMode;
  private readonly config: FlutterwaveConfig;
  constructor(config: FlutterwaveConfig) {
    if (!config.secretKey) throw new PaymentProviderError("Configuration Flutterwave incomplète (clé secrète).");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, body?: unknown) {
    return providerRequest("Flutterwave", `${BASE}${path}`, { method, headers: { Authorization: `Bearer ${this.config.secretKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, fetchImpl: this.config.fetchImpl });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    if (!r.customer?.email) throw new PaymentProviderError("Flutterwave exige l'adresse e-mail du payeur (fiche de l'établissement).");
    const { json } = await this.call("POST", "/payments", {
      tx_ref: r.reference,
      amount: r.amount,
      currency: r.currency,
      redirect_url: r.returnUrl,
      customer: { email: r.customer.email, name: r.customer.name ?? undefined, phonenumber: r.customer.phone ?? undefined },
      customizations: { title: r.storeName, description: r.description.slice(0, 250) },
      meta: { reference: r.reference },
    });
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (json.status !== "success" || typeof data.link !== "string") throw new PaymentProviderError("Flutterwave a refusé la création du paiement.", detail(json, "status", "message"));
    return { providerTransactionId: r.reference, checkoutUrl: data.link, raw: { status: json.status } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!REFERENCE.test(id)) throw new PaymentProviderError("Référence Flutterwave invalide.");
    const { status, json } = await this.call("GET", `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(id)}`);
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (status === 404 || (json.status === "error" && !json.data)) return { state: "pending", providerTransactionId: id, amount: null, currency: null, reference: id, method: null, raw: { message: json.message ?? null } };
    if (status >= 300) throw new PaymentProviderError("Statut Flutterwave indisponible.", detail(json, "status", "message"));
    return {
      state: state(data.status),
      providerTransactionId: id,
      amount: toInteger(data.amount),
      currency: typeof data.currency === "string" ? data.currency : null,
      reference: typeof data.tx_ref === "string" ? data.tx_ref : id,
      method: typeof data.payment_type === "string" ? data.payment_type : null,
      raw: { id: data.id ?? null, status: data.status ?? null, amount: data.amount ?? null, currency: data.currency ?? null, payment_type: data.payment_type ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const ref = pick(body, ["data", "tx_ref"]) ?? pick(body, ["txRef"]) ?? pick(body, ["tx_ref"]);
    const ok = typeof ref === "string" && REFERENCE.test(ref) ? ref : null;
    return { providerTransactionId: ok, reference: ok };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord Flutterwave, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { status } = await this.call("GET", "/balances");
    if (status === 401 || status === 403) return { ok: false as const, error: "Flutterwave refuse la clé secrète." };
    return status < 300 ? { ok: true as const, message: "Clé Flutterwave acceptée." } : { ok: false as const, error: `Flutterwave a répondu ${status}.` };
  }
}
