import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { CustomDefinition } from "./custom-definition";
import { REFERENCE, safeId, toInteger } from "./http";
import { PaymentProviderError, type CheckoutRequest, type CheckoutSession, type PaymentMode, type PaymentProvider, type VerifiedPayment, type WebhookSignal } from "./types";

/**
 * Agrégateur personnalisé : exécute la définition saisie par le Super Admin.
 * Mêmes règles que les agrégateurs intégrés : seule la vérification serveur →
 * fournisseur fait foi ; aucune clé dans les erreurs ni dans ce qui est stocké
 * (seules les valeurs lues aux chemins de la définition sont conservées).
 *
 * Sécurité : HTTPS obligatoire, aucune adresse interne (localhost, réseau privé),
 * aucune redirection suivie. PAYMENT_CUSTOM_ALLOW_LOCAL=1 lève ces deux règles
 * pour les tests locaux uniquement.
 */
export type CustomProviderConfig = {
  code: string;
  name: string;
  mode: PaymentMode;
  definition: CustomDefinition;
  config: Record<string, string>;
  secrets: Record<string, string>;
  fetchImpl?: typeof fetch;
  allowLocal?: boolean;
};

type Vars = Record<string, string | number>;

const localAllowed = () => process.env.PAYMENT_CUSTOM_ALLOW_LOCAL === "1";

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Refuse toute adresse non publique (sauf tests locaux explicitement autorisés). */
export async function assertPublicUrl(raw: string, allowLocal = localAllowed()): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentProviderError("Adresse de l'agrégateur invalide.");
  }
  if (allowLocal) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new PaymentProviderError("Adresse de l'agrégateur invalide.");
    return url;
  }
  if (url.protocol !== "https:") throw new PaymentProviderError("L'adresse de l'agrégateur doit commencer par https://.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new PaymentProviderError("Adresse interne refusée.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new PaymentProviderError("Adresse de l'agrégateur introuvable (DNS).");
  if (addresses.some((a) => privateAddress(a.address))) throw new PaymentProviderError("Adresse interne refusée.");
  return url;
}

/** Valeur à un chemin « a.b.0.c » d'une réponse JSON. */
export function atPath(body: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let current: unknown = body;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const PLACEHOLDER = /\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)?)\s*\}\}/g;

/** Remplace les modèles {{…}} ; une valeur qui n'est qu'un modèle garde son type (montant numérique). */
export function fill(template: unknown, vars: Vars): unknown {
  if (typeof template === "string") {
    const whole = template.match(/^\{\{\s*([a-z_]+(?:\.[a-z0-9_]+)?)\s*\}\}$/);
    if (whole) return vars[whole[1]!] ?? "";
    return template.replace(PLACEHOLDER, (_, name: string) => String(vars[name] ?? ""));
  }
  if (Array.isArray(template)) return template.map((v) => fill(v, vars));
  if (template && typeof template === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) {
      const value = fill(v, vars);
      // Champ optionnel non renseigné (ex. e-mail du payeur absent) : omis.
      if (value !== "" || typeof v !== "string" || !v.includes("{{")) out[k] = value;
    }
    return out;
  }
  return template;
}

function flatForm(value: unknown, prefix = "", out = new URLSearchParams()): URLSearchParams {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatForm(v, prefix ? `${prefix}[${k}]` : k, out);
  } else if (prefix) out.append(prefix, value === null || value === undefined ? "" : String(value));
  return out;
}

const stringOrNull = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 120) : null);

export class CustomHttpProvider implements PaymentProvider {
  readonly code: string;
  readonly mode: PaymentMode;
  private readonly c: CustomProviderConfig;
  constructor(config: CustomProviderConfig) {
    const missing = config.definition.secret_fields.filter((f) => (f.required ?? true) && !config.secrets[f.key]);
    if (missing.length) throw new PaymentProviderError(`Configuration ${config.name} incomplète (${missing.map((f) => f.label).join(", ")}).`);
    this.c = config;
    this.code = config.code;
    this.mode = config.mode;
  }

  private vars(extra: Vars = {}): Vars {
    const v: Vars = { ...extra };
    for (const [k, value] of Object.entries(this.c.config)) v[`config.${k}`] = value;
    for (const [k, value] of Object.entries(this.c.secrets)) v[`secret.${k}`] = value;
    return v;
  }

  private async call(step: "create" | "verify" | "check", request: CustomDefinition["create"] | CustomDefinition["verify"] | NonNullable<CustomDefinition["check"]>, vars: Vars) {
    const d = this.c.definition;
    const allowLocal = this.c.allowLocal ?? localAllowed();
    // Valeurs insérées dans le chemin : encodées ; jamais de clé (refusé par la définition).
    const pathVars: Vars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, encodeURIComponent(String(v))]));
    const url = await assertPublicUrl(`${d.base_url[this.mode].replace(/\/+$/, "")}${String(fill(request.path, pathVars))}`, allowLocal);
    const headers: Record<string, string> = { Accept: "application/json" };
    for (const [name, value] of Object.entries(d.headers ?? {})) headers[name] = String(fill(value, vars));
    const secret = d.auth.secret_field ? (this.c.secrets[d.auth.secret_field] ?? "") : "";
    if (d.auth.type === "bearer") headers.Authorization = `Bearer ${secret}`;
    if (d.auth.type === "header" && d.auth.name) headers[d.auth.name] = secret;
    if (d.auth.type === "basic") headers.Authorization = `Basic ${Buffer.from(`${secret}:${d.auth.password_field ? (this.c.secrets[d.auth.password_field] ?? "") : ""}`).toString("base64")}`;
    if (d.auth.type === "query" && d.auth.name) url.searchParams.set(d.auth.name, secret);
    let body: string | undefined;
    const format = request.body_format ?? (request.method === "GET" ? "none" : "json");
    if (request.method === "POST" && format !== "none") {
      const filled = fill(request.body ?? {}, vars);
      if (format === "form") {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = flatForm(filled).toString();
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(filled);
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const label = this.c.name;
    try {
      const response = await (this.c.fetchImpl ?? fetch)(url, { method: request.method, headers, body, signal: controller.signal, redirect: "manual", cache: "no-store" });
      if (response.status >= 300 && response.status < 400) throw new PaymentProviderError(`${label} a répondu par une redirection (refusée).`, { step, http_status: response.status });
      const text = (await response.text()).slice(0, 256 * 1024);
      let json: unknown = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new PaymentProviderError(`Réponse ${label} illisible (JSON attendu).`, { step, http_status: response.status });
      }
      return { status: response.status, json };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(`${label} est injoignable pour le moment.`, { step, cause: error instanceof Error ? error.name : "unknown" });
    } finally {
      clearTimeout(timer);
    }
  }

  private multiplier() {
    return this.c.definition.amount_unit === "cents" ? 100 : 1;
  }

  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PaymentProviderError("Montant invalide.");
    const d = this.c.definition;
    const vars = this.vars({
      amount: r.amount * this.multiplier(),
      currency: r.currency,
      reference: r.reference,
      description: r.description.slice(0, 250),
      item_name: r.itemName.slice(0, 120),
      return_url: r.returnUrl,
      cancel_url: r.cancelUrl,
      callback_url: r.callbackUrl,
      customer_email: r.customer?.email ?? "",
      customer_name: r.customer?.name ?? "",
      customer_phone: r.customer?.phone ?? "",
    });
    const { status, json } = await this.call("create", d.create, vars);
    const checkoutUrl = atPath(json, d.create.response.checkout_url);
    const id = d.create.transaction_id_source === "reference" ? r.reference : safeId(atPath(json, d.create.response.transaction_id));
    if (status >= 300 || typeof checkoutUrl !== "string" || !id) {
      throw new PaymentProviderError(`${this.c.name} a refusé la création du paiement.`, { http_status: status, checkout_url_found: typeof checkoutUrl === "string", transaction_id_found: Boolean(id) });
    }
    const allowLocal = this.c.allowLocal ?? localAllowed();
    let parsed: URL;
    try {
      parsed = new URL(checkoutUrl);
    } catch {
      throw new PaymentProviderError(`${this.c.name} a fourni un lien de paiement invalide.`);
    }
    if (parsed.protocol !== "https:" && !(allowLocal && parsed.protocol === "http:")) throw new PaymentProviderError(`${this.c.name} a fourni un lien de paiement non sécurisé.`);
    return { providerTransactionId: id, checkoutUrl: parsed.toString(), raw: { id } };
  }

  private state(value: unknown): VerifiedPayment["state"] {
    const s = String(value ?? "").trim().toLowerCase();
    const { paid, failed, cancelled } = this.c.definition.statuses;
    if (paid.some((x) => x.toLowerCase() === s)) return "paid";
    if (failed.some((x) => x.toLowerCase() === s)) return "failed";
    if (cancelled.some((x) => x.toLowerCase() === s)) return "cancelled";
    return "pending";
  }

  async getPaymentStatus(id: string): Promise<VerifiedPayment> {
    if (!safeId(id)) throw new PaymentProviderError(`Identifiant ${this.c.name} invalide.`);
    const d = this.c.definition;
    const { status, json } = await this.call("verify", d.verify, this.vars({ transaction_id: id, reference: REFERENCE.test(id) ? id : "" }));
    if (status === 404) return { state: "pending", providerTransactionId: id, amount: null, currency: null, reference: null, method: null, raw: { http_status: 404 } };
    if (status >= 300) throw new PaymentProviderError(`Statut ${this.c.name} indisponible.`, { http_status: status });
    const rawStatus = atPath(json, d.verify.response.status);
    if (rawStatus === undefined || rawStatus === null) throw new PaymentProviderError(`Statut ${this.c.name} introuvable dans la réponse (chemin « ${d.verify.response.status} »).`);
    const amount = d.verify.response.amount ? toInteger(atPath(json, d.verify.response.amount)) : null;
    const currency = d.verify.response.currency ? stringOrNull(atPath(json, d.verify.response.currency)) : d.currency;
    const ref = d.verify.response.reference ? atPath(json, d.verify.response.reference) : null;
    const method = d.verify.response.method ? stringOrNull(atPath(json, d.verify.response.method)) : null;
    return {
      state: this.state(rawStatus),
      providerTransactionId: id,
      amount: amount === null ? null : Math.round(amount / this.multiplier()),
      currency: currency ? currency.toUpperCase() : null,
      reference: typeof ref === "string" && REFERENCE.test(ref) ? ref : null,
      method,
      raw: { status: stringOrNull(rawStatus), amount, currency, reference: stringOrNull(ref), method },
    };
  }

  verifyPayment(id: string) {
    return this.getPaymentStatus(id);
  }

  handleWebhook(body: unknown): WebhookSignal {
    const d = this.c.definition;
    const ref = atPath(body, d.webhook.reference || undefined);
    const reference = typeof ref === "string" && REFERENCE.test(ref) ? ref : null;
    const fromBody = safeId(atPath(body, d.webhook.transaction_id || undefined));
    const id = fromBody ?? (d.create.transaction_id_source === "reference" ? reference : null);
    return { providerTransactionId: id, reference };
  }

  async refundPayment() {
    return { supported: false as const, message: `Remboursement à effectuer depuis le tableau de bord ${this.c.name}, puis à enregistrer dans NeoScool.` };
  }

  async checkCredentials() {
    const check = this.c.definition.check;
    if (!check) return { ok: true as const, message: "Aucun appel de vérification des clés défini." };
    const { status } = await this.call("check", check, this.vars());
    if (status === 401 || status === 403) return { ok: false as const, error: `${this.c.name} refuse les clés.` };
    return status < 300 ? { ok: true as const, message: `Clés ${this.c.name} acceptées.` } : { ok: false as const, error: `${this.c.name} a répondu ${status}.` };
  }

  /**
   * Test complet obligatoire avant activation : crée un paiement d'essai
   * (jamais payé), vérifie que le lien et l'identifiant sont lus, puis que la
   * vérification renvoie un statut compris (non payé).
   */
  async sandboxTest(baseUrl: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
    try {
      const creds = await this.checkCredentials();
      if (!creds.ok) return creds;
      const reference = `NEO-0000-${String(Date.now()).slice(-9)}`;
      const session = await this.createCheckout({
        reference,
        amount: 100,
        currency: this.c.definition.currency,
        description: "NeoScool — paiement d'essai (ne pas payer)",
        itemName: "Paiement d'essai",
        storeName: "NeoScool",
        returnUrl: `${baseUrl}/plateforme/paiements-en-ligne`,
        cancelUrl: `${baseUrl}/plateforme/paiements-en-ligne`,
        callbackUrl: `${baseUrl}/api/webhooks/payments/${this.code}`,
        customData: { kind: "gateway_test" },
      });
      const verified = await this.verifyPayment(session.providerTransactionId);
      if (verified.state === "paid") return { ok: false, error: "Le paiement d'essai apparaît déjà payé : vérifiez la correspondance des statuts." };
      return { ok: true, message: `Test réussi : paiement d'essai créé (lien reçu, identifiant ${session.providerTransactionId}) puis vérifié (statut « ${String(verified.raw.status)} » compris comme non payé).` };
    } catch (e) {
      return { ok: false, error: e instanceof PaymentProviderError ? e.message : "Test impossible." };
    }
  }
}
