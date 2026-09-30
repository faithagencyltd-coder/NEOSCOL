import { PaymentProviderError } from "./types";

/**
 * Appel HTTP vers un fournisseur de paiement : délai maximal, réponse JSON,
 * et jamais d'en-tête (clé) ni de corps envoyé dans les erreurs.
 */
export async function providerRequest(
  label: string,
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const doFetch = init.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
  try {
    const response = await doFetch(url, { method: init.method, headers: { Accept: "application/json", ...init.headers }, body: init.body, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    try {
      return { status: response.status, json: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
    } catch {
      throw new PaymentProviderError(`Réponse ${label} illisible.`, { http_status: response.status });
    }
  } catch (error) {
    if (error instanceof PaymentProviderError) throw error;
    throw new PaymentProviderError(`${label} est injoignable pour le moment.`, { cause: error instanceof Error ? error.name : "unknown" });
  } finally {
    clearTimeout(timer);
  }
}

export function toInteger(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Valeur d'un chemin dans un objet (y compris clés « aplaties » d'un formulaire). */
export function pick(body: unknown, path: string[]): unknown {
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

export const REFERENCE = /^NEO-\d{4}-\d{6,}$/;
export const safeId = (value: unknown, re = /^[A-Za-z0-9_.:-]{3,160}$/) => (typeof value === "string" || typeof value === "number") && re.test(String(value)) ? String(value) : null;

export function detail(json: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, typeof json[k] === "string" ? String(json[k]).slice(0, 300) : (json[k] ?? null)]));
}

export type CredentialCheck = { ok: true; message: string } | { ok: false; error: string };
