import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * PayDunya — API HTTP/JSON « Checkout Invoice » (paiement avec redirection).
 *
 * Points d'accès, en-têtes et champs repris de la bibliothèque officielle
 * publiée par PayDunya (npm « paydunya », mainteneur notif@paydunya.com) :
 *   test       : https://app.paydunya.com/sandbox-api/v1
 *   production : https://app.paydunya.com/api/v1
 *   POST /checkout-invoice/create   → { response_code: "00", response_text: <URL de paiement>, token }
 *   GET  /checkout-invoice/confirm/{token} → { response_code: "00", status, invoice.total_amount, custom_data, … }
 *   En-têtes : PAYDUNYA-MASTER-KEY, PAYDUNYA-PRIVATE-KEY, PAYDUNYA-TOKEN.
 *
 * Le contenu d'une notification (IPN) n'est jamais cru : son jeton est
 * revérifié par `confirm`, appel serveur à serveur authentifié par nos clés.
 * Aucun endpoint de remboursement n'est documenté dans la bibliothèque officielle.
 */
export type PayDunyaConfig = {
  mode: PaymentMode;
  masterKey: string;
  privateKey: string;
  token: string;
  /** Pour les tests : remplace fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const PAYDUNYA_BASE_URLS: Record<PaymentMode, string> = {
  test: "https://app.paydunya.com/sandbox-api/v1",
  live: "https://app.paydunya.com/api/v1",
};

/** Statuts PayDunya (« completed, pending, canceled or fail ») → statut normalisé. */
function normalizeStatus(status: unknown): VerifiedPayment["state"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "completed") return "paid";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "fail" || s === "failed") return "failed";
  return "pending";
}

function toInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Valeur d'un chemin dans un objet, y compris des clés « aplaties » d'un formulaire (data[invoice][token]). */
function pick(body: unknown, path: string[]): unknown {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const flat = path[0] + path.slice(1).map((k) => `[${k}]`).join("");
  if (flat in record) return record[flat];
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export class PayDunyaProvider implements PaymentProvider {
  readonly code = "paydunya";
  readonly mode: PaymentMode;
  private readonly config: PayDunyaConfig;

  constructor(config: PayDunyaConfig) {
    if (!config.masterKey || !config.privateKey || !config.token) {
      throw new PaymentProviderError("Configuration PayDunya incomplète (clés manquantes côté serveur).");
    }
    this.config = config;
    this.mode = config.mode;
  }

  private get baseUrl(): string {
    return PAYDUNYA_BASE_URLS[this.mode];
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
    const doFetch = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20000);
    try {
      const response = await doFetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          "PAYDUNYA-MASTER-KEY": this.config.masterKey,
          "PAYDUNYA-PRIVATE-KEY": this.config.privateKey,
          "PAYDUNYA-TOKEN": this.config.token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new PaymentProviderError("Réponse PayDunya illisible.", { http_status: response.status });
      }
      return json;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      // Jamais les en-têtes (clés) dans l'erreur : uniquement le type d'incident.
      throw new PaymentProviderError("PayDunya est injoignable pour le moment.", { cause: error instanceof Error ? error.name : "unknown" });
    } finally {
      clearTimeout(timer);
    }
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(request.amount) || request.amount <= 0) {
      throw new PaymentProviderError("Montant invalide.");
    }
    const body = {
      invoice: {
        total_amount: request.amount,
        description: request.description,
        items: {
          item_0: { name: request.itemName, quantity: 1, unit_price: request.amount, total_price: request.amount, description: request.description },
        },
      },
      store: { name: request.storeName },
      actions: { return_url: request.returnUrl, cancel_url: request.cancelUrl, callback_url: request.callbackUrl },
      custom_data: { ...request.customData, reference: request.reference },
    };
    const json = await this.request("/checkout-invoice/create", { method: "POST", body });
    if (json.response_code !== "00" || typeof json.token !== "string" || typeof json.response_text !== "string") {
      throw new PaymentProviderError("PayDunya a refusé la création du paiement.", {
        response_code: json.response_code ?? null,
        response_text: typeof json.response_text === "string" ? json.response_text.slice(0, 300) : null,
      });
    }
    return {
      providerTransactionId: json.token,
      checkoutUrl: json.response_text,
      raw: { response_code: json.response_code, token: json.token, description: json.description ?? null },
    };
  }

  async getPaymentStatus(providerTransactionId: string): Promise<VerifiedPayment> {
    if (!/^[A-Za-z0-9_-]{4,120}$/.test(providerTransactionId)) {
      throw new PaymentProviderError("Jeton PayDunya invalide.");
    }
    const json = await this.request(`/checkout-invoice/confirm/${encodeURIComponent(providerTransactionId)}`, { method: "GET" });
    if (json.response_code !== "00") {
      throw new PaymentProviderError("Statut PayDunya indisponible.", {
        response_code: json.response_code ?? null,
        response_text: typeof json.response_text === "string" ? json.response_text.slice(0, 300) : null,
      });
    }
    const invoice = (json.invoice ?? {}) as Record<string, unknown>;
    const custom = (json.custom_data ?? {}) as Record<string, unknown>;
    return {
      state: normalizeStatus(json.status),
      providerTransactionId,
      amount: toInteger(invoice.total_amount),
      // Le compte marchand PayDunya encaisse en F CFA (XOF).
      currency: "XOF",
      reference: typeof custom.reference === "string" ? custom.reference : null,
      method: null,
      raw: {
        status: json.status ?? null,
        total_amount: invoice.total_amount ?? null,
        receipt_url: json.receipt_url ?? null,
        receipt_identifier: json.receipt_identifier ?? null,
        provider_reference: json.provider_reference ?? null,
        custom_data: custom,
      },
    };
  }

  verifyPayment(providerTransactionId: string): Promise<VerifiedPayment> {
    return this.getPaymentStatus(providerTransactionId);
  }

  handleWebhook(body: unknown): WebhookSignal {
    const token = pick(body, ["data", "invoice", "token"]) ?? pick(body, ["invoice", "token"]) ?? pick(body, ["token"]);
    const reference = pick(body, ["data", "custom_data", "reference"]) ?? pick(body, ["custom_data", "reference"]);
    return {
      providerTransactionId: typeof token === "string" && /^[A-Za-z0-9_-]{4,120}$/.test(token) ? token : null,
      reference: typeof reference === "string" && /^NEO-\d{4}-\d{6,}$/.test(reference) ? reference : null,
    };
  }

  async refundPayment(): Promise<{ supported: false; message: string }> {
    return { supported: false, message: "Remboursement non disponible via l'API PayDunya : à traiter depuis le tableau de bord PayDunya puis à enregistrer dans NéoScol." };
  }
}
