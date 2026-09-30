import { detail, pick, providerRequest, REFERENCE, safeId, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * FedaPay — API REST v1 (https://docs.fedapay.com) :
 *   test : https://sandbox-api.fedapay.com/v1 · réel : https://api.fedapay.com/v1
 *   POST /transactions → « v1/transaction ».id ; POST /transactions/{id}/token → url
 *   GET  /transactions/{id} → status (approved, pending, declined, canceled…)
 * Authentification : Authorization: Bearer <clé secrète sk_…>.
 */
export type FedaPayConfig = { mode: PaymentMode; secretKey: string; fetchImpl?: typeof fetch };
const BASES: Record<PaymentMode, string> = { test: "https://sandbox-api.fedapay.com/v1", live: "https://api.fedapay.com/v1" };

function state(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "approved" || s === "transferred") return "paid";
  if (s === "declined") return "failed";
  if (s === "canceled" || s === "cancelled" || s === "refunded") return "cancelled";
  return "pending";
}
const tx = (json: Record<string, unknown>) => ((json["v1/transaction"] ?? json.transaction ?? {}) as Record<string, unknown>);

export class FedaPayProvider implements PaymentProvider {
  readonly code = "fedapay";
  readonly mode: PaymentMode;
  private readonly config: FedaPayConfig;
  constructor(config: FedaPayConfig) {
    if (!config.secretKey) throw new PaymentProviderError("Configuration FedaPay incomplète (clé secrète).");
    this.config = config;
    this.mode = config.mode;
  }
  private call(method: "GET" | "POST", path: string, body?: unknown) {
    return providerRequest("FedaPay", `${BASES[this.mode]}${path}`, { method, headers: { Authorization: `Bearer ${this.config.secretKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, fetchImpl: this.config.fetchImpl });
  }
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    const created = await this.call("POST", "/transactions", {
      description: r.description.slice(0, 250),
      amount: r.amount,
      currency: { iso: r.currency },
      callback_url: r.returnUrl,
      merchant_reference: r.reference,
      custom_metadata: { reference: r.reference },
      ...(r.customer?.email ? { customer: { email: r.customer.email, firstname: r.customer.name ?? undefined } } : {}),
    });
    const id = safeId(tx(created.json).id);
    if (created.status >= 300 || !id) throw new PaymentProviderError("FedaPay a refusé la création du paiement.", detail(created.json, "message", "errors"));
    const token = await this.call("POST", `/transactions/${id}/token`);
    if (token.status >= 300 || typeof token.json.url !== "string") throw new PaymentProviderError("FedaPay n'a pas fourni de lien de paiement.", detail(token.json, "message"));
    return { providerTransactionId: id, checkoutUrl: token.json.url, raw: { id } };
  }
  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!/^\d{1,20}$/.test(id)) throw new PaymentProviderError("Identifiant FedaPay invalide.");
    const { status, json } = await this.call("GET", `/transactions/${id}`);
    const t = tx(json);
    if (status >= 300 || !t.id) throw new PaymentProviderError("Statut FedaPay indisponible.", detail(json, "message"));
    const ref = typeof t.merchant_reference === "string" && REFERENCE.test(t.merchant_reference) ? t.merchant_reference : null;
    return {
      state: state(t.status),
      providerTransactionId: id,
      amount: toInteger(t.amount),
      // Compte FedaPay en F CFA (XOF) : la devise est fixée à la création.
      currency: "XOF",
      reference: ref,
      method: typeof t.mode === "string" ? t.mode : null,
      raw: { id: t.id, status: t.status ?? null, amount: t.amount ?? null, mode: t.mode ?? null, reference: t.reference ?? null },
    };
  }
  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }
  handleWebhook(body: unknown): WebhookSignal {
    const id = pick(body, ["entity", "id"]) ?? pick(body, ["id"]);
    const ref = pick(body, ["entity", "merchant_reference"]);
    return { providerTransactionId: id !== undefined && /^\d{1,20}$/.test(String(id)) ? String(id) : null, reference: typeof ref === "string" && REFERENCE.test(ref) ? ref : null };
  }
  async refundPayment() {
    return { supported: false as const, message: "Remboursement à effectuer depuis le tableau de bord FedaPay, puis à enregistrer dans NeoScool." };
  }
  async checkCredentials() {
    const { status, json } = await this.call("GET", "/transactions?per_page=1");
    if (status === 401 || status === 403) return { ok: false as const, error: "FedaPay refuse la clé secrète." };
    if (status >= 300) return { ok: false as const, error: `FedaPay a répondu ${status} ${String(json.message ?? "")}`.trim() };
    return { ok: true as const, message: `Clé FedaPay acceptée (mode ${this.mode === "live" ? "réel" : "test"}).` };
  }
}
