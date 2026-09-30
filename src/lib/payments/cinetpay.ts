import { detail, pick, providerRequest, safeId, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * CinetPay — API Checkout v2 (https://docs.cinetpay.com) :
 *   POST https://api-checkout.cinetpay.com/v2/payment        → data.payment_url
 *   POST https://api-checkout.cinetpay.com/v2/payment/check  → data.status (ACCEPTED, REFUSED, …)
 * Identifiants : apikey + site_id. L'identifiant de transaction est notre
 * référence NEO-… ; la notification (cpm_trans_id) est toujours revérifiée.
 */
export type CinetPayConfig = { mode: PaymentMode; apiKey: string; siteId: string; fetchImpl?: typeof fetch };
const BASE = "https://api-checkout.cinetpay.com/v2";

function state(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toUpperCase();
  if (s === "ACCEPTED") return "paid";
  if (s === "REFUSED") return "failed";
  if (s === "CANCELED" || s === "CANCELLED") return "cancelled";
  return "pending";
}

export class CinetPayProvider implements PaymentProvider {
  readonly code = "cinetpay";
  readonly mode: PaymentMode;
  private readonly config: CinetPayConfig;
  constructor(config: CinetPayConfig) {
    if (!config.apiKey || !config.siteId) throw new PaymentProviderError("Configuration CinetPay incomplète (apikey / site_id).");
    this.config = config;
    this.mode = config.mode;
  }
  private post(path: string, body: Record<string, unknown>) {
    return providerRequest("CinetPay", `${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apikey: this.config.apiKey, site_id: this.config.siteId, ...body }), fetchImpl: this.config.fetchImpl });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    // CinetPay : montant XOF multiple de 5, description sans caractères spéciaux.
    if (!Number.isInteger(r.amount) || r.amount <= 0 || r.amount % 5 !== 0) throw new PaymentProviderError("Montant invalide pour CinetPay (multiple de 5 F CFA).");
    const { json } = await this.post("/payment", {
      transaction_id: r.reference,
      amount: r.amount,
      currency: r.currency,
      description: r.description.replace(/[#/$_&]/g, " ").slice(0, 250),
      notify_url: r.callbackUrl,
      return_url: r.returnUrl,
      channels: "ALL",
      lang: "fr",
      metadata: r.reference,
      customer_name: r.customer?.name ?? undefined,
      customer_email: r.customer?.email ?? undefined,
      customer_phone_number: r.customer?.phone ?? undefined,
    });
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (String(json.code) !== "201" || typeof data.payment_url !== "string") throw new PaymentProviderError("CinetPay a refusé la création du paiement.", detail(json, "code", "message", "description"));
    return { providerTransactionId: r.reference, checkoutUrl: data.payment_url, raw: { code: json.code, payment_token: data.payment_token ?? null } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!safeId(id)) throw new PaymentProviderError("Identifiant CinetPay invalide.");
    const { json } = await this.post("/payment/check", { transaction_id: id });
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (!json.data) throw new PaymentProviderError("Statut CinetPay indisponible.", detail(json, "code", "message"));
    return {
      state: state(data.status),
      providerTransactionId: id,
      amount: toInteger(data.amount),
      currency: typeof data.currency === "string" ? data.currency : null,
      reference: id,
      method: typeof data.payment_method === "string" ? data.payment_method : null,
      raw: { code: json.code ?? null, message: json.message ?? null, status: data.status ?? null, amount: data.amount ?? null, payment_method: data.payment_method ?? null, operator_id: data.operator_id ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const id = safeId(pick(body, ["cpm_trans_id"]) ?? pick(body, ["transaction_id"]));
    return { providerTransactionId: id, reference: id };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord CinetPay, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { json } = await this.post("/payment/check", { transaction_id: "NEO-0000-000000" });
    const message = String(json.message ?? "");
    if (/AUTH|API ?KEY|SITE_ID|NOT ?VALID|INVALID/i.test(message) && !/TRANSACTION/i.test(message)) return { ok: false as const, error: `CinetPay refuse les identifiants (${message}).` };
    return { ok: true as const, message: "Identifiants CinetPay acceptés." };
  }
}
