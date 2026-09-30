import { z } from "zod";

import type { GatewayDefinition } from "./gateways";

/**
 * Définition d'un agrégateur de paiement ajouté par le Super Admin (aucune clé
 * ici : les clés sont saisies à part et chiffrées sur le serveur).
 *
 * Modèles utilisables dans les chemins, en-têtes et corps : {{amount}},
 * {{currency}}, {{reference}}, {{description}}, {{item_name}}, {{return_url}},
 * {{cancel_url}}, {{callback_url}}, {{customer_email}}, {{customer_name}},
 * {{customer_phone}}, {{transaction_id}}, {{config.<clé>}}, {{secret.<clé>}}
 * ({{secret.…}} interdit dans les chemins, qui peuvent apparaître dans des journaux).
 */
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, "Clé de champ invalide (minuscules, chiffres, _).");
const jsonPath = z.string().max(120).regex(/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+)*$/, "Chemin invalide (ex. : data.payment_url).");
const optionalPath = z.union([jsonPath, z.literal("")]).optional();

const field = z.object({
  key: fieldKey,
  label: z.string().trim().min(2).max(80),
  hint: z.string().max(160).optional(),
  required: z.boolean().optional(),
});

const templateValue: z.ZodType<unknown> = z.lazy(() => z.union([z.string().max(500), z.number(), z.boolean(), z.null(), z.array(templateValue).max(20), z.record(z.string().max(60), templateValue)]));

const request = z.object({
  method: z.enum(["GET", "POST"]),
  path: z
    .string()
    .max(300)
    .regex(/^\/[^\s]*$/, "Le chemin commence par « / » (ex. : /v1/payments).")
    .refine((p) => !p.includes("{{secret."), "Aucune clé dans le chemin : placez-la dans un en-tête ou le corps."),
  body_format: z.enum(["json", "form", "none"]).optional(),
  body: z.record(z.string().max(60), templateValue).optional(),
});

const baseUrl = z
  .string()
  .max(200)
  .regex(/^https?:\/\/[A-Za-z0-9.-]+(:\d{2,5})?(\/[^\s?#]*)?$/, "Adresse invalide (ex. : https://api.fournisseur.com/v1).");

export const customDefinitionSchema = z
  .object({
    version: z.literal(1),
    base_url: z.object({ test: baseUrl, live: baseUrl }),
    auth: z.object({
      type: z.enum(["bearer", "header", "basic", "query", "none"]),
      /** Nom de l'en-tête (type « header ») ou du paramètre d'adresse (type « query »). */
      name: z.string().max(60).regex(/^[A-Za-z0-9_-]*$/).optional(),
      /** Champ de clé utilisé (bearer, header, query) ou identifiant (basic). */
      secret_field: z.union([fieldKey, z.literal("")]).optional(),
      /** Mot de passe (basic). */
      password_field: z.union([fieldKey, z.literal("")]).optional(),
    }),
    headers: z.record(z.string().regex(/^[A-Za-z0-9-]{1,60}$/), z.string().max(300)).optional(),
    secret_fields: z.array(field).min(1, "Au moins une clé (fournie par l’agrégateur).").max(5),
    public_fields: z.array(field).max(5),
    /** « cents » : le fournisseur attend le montant × 100. */
    amount_unit: z.enum(["unit", "cents"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    create: request.extend({
      response: z.object({ checkout_url: jsonPath, transaction_id: optionalPath }),
      /** « reference » : le fournisseur identifie le paiement par la référence NeoScool. */
      transaction_id_source: z.enum(["response", "reference"]),
    }),
    verify: request.extend({
      response: z.object({ status: jsonPath, amount: optionalPath, currency: optionalPath, reference: optionalPath, method: optionalPath }),
    }),
    statuses: z.object({
      paid: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
      failed: z.array(z.string().trim().min(1).max(40)).max(12),
      cancelled: z.array(z.string().trim().min(1).max(40)).max(12),
    }),
    webhook: z.object({ transaction_id: optionalPath, reference: optionalPath }),
    /** Appel facultatif pour vérifier les clés sans créer de paiement. */
    check: request.optional(),
  })
  .superRefine((d, ctx) => {
    const keys = new Set(d.secret_fields.map((f) => f.key));
    if (d.auth.type !== "none" && (!d.auth.secret_field || !keys.has(d.auth.secret_field))) {
      ctx.addIssue({ code: "custom", path: ["auth", "secret_field"], message: "Choisissez la clé utilisée pour l'authentification." });
    }
    if (d.auth.type === "basic" && d.auth.password_field && !keys.has(d.auth.password_field)) {
      ctx.addIssue({ code: "custom", path: ["auth", "password_field"], message: "Mot de passe : champ de clé inconnu." });
    }
    if ((d.auth.type === "header" || d.auth.type === "query") && !d.auth.name) {
      ctx.addIssue({ code: "custom", path: ["auth", "name"], message: "Indiquez le nom de l'en-tête ou du paramètre." });
    }
    if (d.create.transaction_id_source === "response" && !d.create.response.transaction_id) {
      ctx.addIssue({ code: "custom", path: ["create", "response", "transaction_id"], message: "Indiquez où lire l'identifiant du paiement dans la réponse." });
    }
    if (!d.webhook.transaction_id && !d.webhook.reference) {
      ctx.addIssue({ code: "custom", path: ["webhook"], message: "Indiquez où lire l'identifiant (ou la référence) dans la notification." });
    }
    const all = [...d.statuses.paid, ...d.statuses.failed, ...d.statuses.cancelled].map((s) => s.toLowerCase());
    if (new Set(all).size !== all.length) ctx.addIssue({ code: "custom", path: ["statuses"], message: "Un même statut ne peut pas avoir deux sens." });
  });

export type CustomDefinition = z.infer<typeof customDefinitionSchema>;

export const CUSTOM_CODE = /^custom_[a-z0-9_]{2,20}$/;

export function customCodeFromName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20)
    .replace(/_+$/g, "");
  return `custom_${slug.length >= 2 ? slug : `${slug}pay`.padEnd(2, "x")}`;
}

/** Premier message d'erreur lisible d'une définition invalide. */
export function definitionError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Définition invalide.";
  const where = issue.path.join(" › ");
  return where ? `${where} : ${issue.message}` : issue.message;
}

/** Fiche affichée dans la liste des passerelles (mêmes écrans que les agrégateurs intégrés). */
export function customGatewayDefinition(code: string, name: string, description: string | null, d: CustomDefinition): GatewayDefinition & { custom: true } {
  return {
    code,
    name,
    description: description || "Agrégateur ajouté par NeoScool.",
    where: "Agrégateur personnalisé : clés fournies par l'agrégateur (tableau de bord développeur).",
    publicFields: d.public_fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint, required: f.required ?? true })),
    secretFields: d.secret_fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint, required: f.required ?? true })),
    webhook: true,
    testNote: "Test obligatoire (bouton « Tester ») avant de le proposer aux clients : un paiement d'essai est créé puis vérifié, sans être payé.",
    custom: true,
  };
}

/** Point de départ du formulaire (modifiable champ par champ). */
export const EMPTY_DEFINITION: CustomDefinition = {
  version: 1,
  base_url: { test: "https://sandbox.exemple.com/v1", live: "https://api.exemple.com/v1" },
  auth: { type: "bearer", secret_field: "secret_key" },
  headers: {},
  secret_fields: [{ key: "secret_key", label: "Clé secrète", required: true }],
  public_fields: [],
  amount_unit: "unit",
  currency: "XOF",
  create: {
    method: "POST",
    path: "/payments",
    body_format: "json",
    body: {
      amount: "{{amount}}",
      currency: "{{currency}}",
      reference: "{{reference}}",
      description: "{{description}}",
      return_url: "{{return_url}}",
      cancel_url: "{{cancel_url}}",
      notify_url: "{{callback_url}}",
      customer: { email: "{{customer_email}}", name: "{{customer_name}}" },
    },
    response: { checkout_url: "data.payment_url", transaction_id: "data.id" },
    transaction_id_source: "response",
  },
  verify: { method: "GET", path: "/payments/{{transaction_id}}", body_format: "none", response: { status: "data.status", amount: "data.amount", currency: "data.currency", reference: "data.reference", method: "data.channel" } },
  statuses: { paid: ["success", "completed", "paid"], failed: ["failed", "declined"], cancelled: ["cancelled", "canceled", "expired"] },
  webhook: { transaction_id: "data.id", reference: "data.reference" },
};

/**
 * Schéma JSON donné à l'assistant IA pour pré-remplir la définition à partir de
 * la documentation collée par le Super Admin (le résultat est ensuite revalidé
 * par customDefinitionSchema, puis relu et testé avant toute activation).
 */
const S = { type: "string" } as const;
const requestJson = (extra: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties: { method: { type: "string", enum: ["GET", "POST"] }, path: S, body_format: { type: "string", enum: ["json", "form", "none"] }, body_json: { type: "string", description: "Corps de la requête, en JSON (objet) avec les modèles {{…}} ; « {} » si aucun." }, ...extra },
  required: ["method", "path", "body_format", "body_json", ...required],
  additionalProperties: false,
});
const fieldJson = { type: "object", properties: { key: S, label: S, hint: S }, required: ["key", "label", "hint"], additionalProperties: false };

export const AI_DEFINITION_SCHEMA = {
  type: "object",
  properties: {
    understood: { type: "boolean", description: "false si la documentation ne permet pas de créer puis vérifier un paiement." },
    name: S,
    notes: { type: "string", description: "Points à vérifier par le Super Admin, en français, courts." },
    base_url_test: S,
    base_url_live: S,
    auth_type: { type: "string", enum: ["bearer", "header", "basic", "query", "none"] },
    auth_name: S,
    auth_secret_field: S,
    auth_password_field: S,
    headers_json: { type: "string", description: "En-têtes supplémentaires, en JSON (objet) ; « {} » si aucun." },
    secret_fields: { type: "array", items: fieldJson },
    public_fields: { type: "array", items: fieldJson },
    amount_unit: { type: "string", enum: ["unit", "cents"] },
    currency: S,
    create: requestJson(
      { response_checkout_url: S, response_transaction_id: S, transaction_id_source: { type: "string", enum: ["response", "reference"] } },
      ["response_checkout_url", "response_transaction_id", "transaction_id_source"],
    ),
    verify: requestJson(
      { response_status: S, response_amount: S, response_currency: S, response_reference: S, response_method: S },
      ["response_status", "response_amount", "response_currency", "response_reference", "response_method"],
    ),
    statuses_paid: { type: "array", items: S },
    statuses_failed: { type: "array", items: S },
    statuses_cancelled: { type: "array", items: S },
    webhook_transaction_id: S,
    webhook_reference: S,
  },
  required: [
    "understood", "name", "notes", "base_url_test", "base_url_live", "auth_type", "auth_name", "auth_secret_field", "auth_password_field", "headers_json",
    "secret_fields", "public_fields", "amount_unit", "currency", "create", "verify", "statuses_paid", "statuses_failed", "statuses_cancelled",
    "webhook_transaction_id", "webhook_reference",
  ],
  additionalProperties: false,
} as const;

type AiRequest = { method: "GET" | "POST"; path: string; body_format: "json" | "form" | "none"; body_json: string };
export type AiDefinition = {
  understood: boolean;
  name: string;
  notes: string;
  base_url_test: string;
  base_url_live: string;
  auth_type: CustomDefinition["auth"]["type"];
  auth_name: string;
  auth_secret_field: string;
  auth_password_field: string;
  headers_json: string;
  secret_fields: { key: string; label: string; hint: string }[];
  public_fields: { key: string; label: string; hint: string }[];
  amount_unit: "unit" | "cents";
  currency: string;
  create: AiRequest & { response_checkout_url: string; response_transaction_id: string; transaction_id_source: "response" | "reference" };
  verify: AiRequest & { response_status: string; response_amount: string; response_currency: string; response_reference: string; response_method: string };
  statuses_paid: string[];
  statuses_failed: string[];
  statuses_cancelled: string[];
  webhook_transaction_id: string;
  webhook_reference: string;
};

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Réponse de l'assistant → définition (non validée : le formulaire la montre, le serveur la valide). */
export function definitionFromAi(a: AiDefinition): CustomDefinition {
  const fields = (list: AiDefinition["secret_fields"]) => list.slice(0, 5).map((f) => ({ key: f.key, label: f.label, ...(f.hint ? { hint: f.hint } : {}), required: true }));
  return {
    version: 1,
    base_url: { test: a.base_url_test || a.base_url_live, live: a.base_url_live || a.base_url_test },
    auth: { type: a.auth_type, name: a.auth_name || undefined, secret_field: a.auth_secret_field || undefined, password_field: a.auth_password_field || undefined },
    headers: parseObject(a.headers_json) as Record<string, string> | undefined,
    secret_fields: fields(a.secret_fields),
    public_fields: fields(a.public_fields),
    amount_unit: a.amount_unit,
    currency: /^[A-Z]{3}$/.test(a.currency) ? a.currency : "XOF",
    create: {
      method: a.create.method,
      path: a.create.path,
      body_format: a.create.body_format,
      body: parseObject(a.create.body_json),
      response: { checkout_url: a.create.response_checkout_url, transaction_id: a.create.response_transaction_id },
      transaction_id_source: a.create.transaction_id_source,
    },
    verify: {
      method: a.verify.method,
      path: a.verify.path,
      body_format: a.verify.body_format,
      body: parseObject(a.verify.body_json),
      response: { status: a.verify.response_status, amount: a.verify.response_amount, currency: a.verify.response_currency, reference: a.verify.response_reference, method: a.verify.response_method },
    },
    statuses: { paid: a.statuses_paid, failed: a.statuses_failed, cancelled: a.statuses_cancelled },
    webhook: { transaction_id: a.webhook_transaction_id, reference: a.webhook_reference },
  };
}
