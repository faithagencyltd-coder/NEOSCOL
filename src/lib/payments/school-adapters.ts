import type { CustomDefinition } from "./custom-definition";
import { GATEWAYS, type GatewayField } from "./gateways";

/**
 * Fournisseurs de paiement qu'un établissement peut ajouter pour encaisser les
 * frais des familles (aucun secret ici : uniquement la description des champs).
 *
 * Il n'y a pas de liste fermée : chaque fournisseur ajouté est une ligne
 * (adapter + configuration + clés chiffrées). L'« adapter » désigne le code qui
 * sait parler à l'API : agrégateurs intégrés, agrégateurs ajoutés par NeoScool
 * (custom_…), API décrite par l'établissement (« custom ») ou fournisseur de
 * test (« mock », mode TEST uniquement, aucun argent réel).
 */
export type SchoolMethod = "mobile_money" | "card" | "bank_transfer" | "other";

export const SCHOOL_METHODS: { value: SchoolMethod; label: string }[] = [
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Carte bancaire" },
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "other", label: "Autre moyen" },
];

export const methodLabel = (m: string) => SCHOOL_METHODS.find((x) => x.value === m)?.label ?? m;

export type SchoolAdapter = {
  code: string;
  name: string;
  description: string;
  where: string;
  publicFields: GatewayField[];
  secretFields: GatewayField[];
  testNote: string;
  defaultMethods: SchoolMethod[];
  /** Remboursement déclenché depuis NeoScool (sinon : procédure manuelle tracée). */
  refunds: "automatic" | "manual";
  kind: "builtin" | "platform_custom" | "custom" | "mock";
};

const METHODS_BY_CODE: Record<string, SchoolMethod[]> = {
  paydunya: ["mobile_money", "card"],
  cinetpay: ["mobile_money", "card"],
  fedapay: ["mobile_money", "card"],
  flutterwave: ["card", "mobile_money", "bank_transfer"],
  paystack: ["card", "mobile_money", "bank_transfer"],
  stripe: ["card"],
  wave: ["mobile_money"],
};

/** Champs standards proposés pour une API décrite par l'établissement (tous facultatifs). */
export const STANDARD_SECRET_FIELDS: GatewayField[] = [
  { key: "api_key", label: "API Key" },
  { key: "secret_key", label: "Secret Key" },
  { key: "client_secret", label: "Client Secret" },
];
export const STANDARD_PUBLIC_FIELDS: GatewayField[] = [
  { key: "merchant_id", label: "Merchant ID" },
  { key: "client_id", label: "Client ID" },
  { key: "account_id", label: "Account ID" },
];

// FeexPay : abonnements (établissements, enseignants) seulement pour l'instant.
export const BUILTIN_SCHOOL_ADAPTERS: SchoolAdapter[] = GATEWAYS.filter((g) => g.code !== "offline" && g.code !== "feexpay").map((g) => ({
  code: g.code,
  name: g.name,
  description: g.description,
  where: g.where,
  publicFields: g.publicFields,
  secretFields: g.secretFields,
  testNote: g.testNote,
  defaultMethods: METHODS_BY_CODE[g.code] ?? ["mobile_money"],
  refunds: "manual",
  kind: "builtin",
}));

export const CUSTOM_SCHOOL_ADAPTER: SchoolAdapter = {
  code: "custom",
  name: "Autre fournisseur (API à décrire)",
  description: "N'importe quel agrégateur ou banque disposant d'une API : adresse, clés et correspondance des réponses sont décrites ici, sans développement.",
  where: "Tableau de bord développeur du fournisseur : adresse de l'API, clés, identifiants marchand.",
  publicFields: STANDARD_PUBLIC_FIELDS,
  secretFields: STANDARD_SECRET_FIELDS,
  testNote: "Test de connexion réussi obligatoire avant activation : un paiement d'essai est créé puis vérifié, sans être payé.",
  defaultMethods: ["mobile_money"],
  refunds: "manual",
  kind: "custom",
};

export const MOCK_SCHOOL_ADAPTER: SchoolAdapter = {
  code: "mock",
  name: "Fournisseur de test NeoScool",
  description: "Pour essayer tout le parcours (paiement, confirmation, comptabilité, reçu, remboursement) sans argent réel. Mode TEST uniquement.",
  where: "Aucune clé : rien n'est envoyé à l'extérieur.",
  publicFields: [],
  secretFields: [],
  testNote: "Mode TEST uniquement : chaque paiement est marqué « MODE TEST » dans la comptabilité.",
  defaultMethods: ["mobile_money", "card"],
  refunds: "automatic",
  kind: "mock",
};

/** Agrégateur ajouté par NeoScool (Super Admin), réutilisable avec les clés de l'établissement. */
export function platformCustomAdapter(code: string, name: string, description: string | null, d: CustomDefinition): SchoolAdapter {
  return {
    code,
    name,
    description: description || "Agrégateur ajouté par NeoScool.",
    where: "Clés fournies par l'agrégateur (tableau de bord développeur).",
    publicFields: d.public_fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint, required: f.required ?? true })),
    secretFields: d.secret_fields.map((f) => ({ key: f.key, label: f.label, hint: f.hint, required: f.required ?? true })),
    testNote: "Test de connexion réussi obligatoire avant activation.",
    defaultMethods: ["mobile_money"],
    refunds: "manual",
    kind: "platform_custom",
  };
}

/** Description d'API proposée au départ pour un fournisseur « custom » (à adapter à la documentation). */
export const SCHOOL_CUSTOM_TEMPLATE: CustomDefinition = {
  version: 1,
  base_url: { test: "https://sandbox.fournisseur.com/v1", live: "https://api.fournisseur.com/v1" },
  auth: { type: "bearer", secret_field: "secret_key" },
  headers: {},
  secret_fields: STANDARD_SECRET_FIELDS.map((f) => ({ key: f.key, label: f.label, required: false })),
  public_fields: STANDARD_PUBLIC_FIELDS.map((f) => ({ key: f.key, label: f.label, required: false })),
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
      merchant_id: "{{config.merchant_id}}",
      return_url: "{{return_url}}",
      cancel_url: "{{cancel_url}}",
      notify_url: "{{callback_url}}",
    },
    response: { checkout_url: "data.payment_url", transaction_id: "data.id" },
    transaction_id_source: "response",
  },
  verify: { method: "GET", path: "/payments/{{transaction_id}}", body_format: "none", response: { status: "data.status", amount: "data.amount", currency: "data.currency", reference: "data.reference", method: "data.channel" } },
  statuses: { paid: ["success", "paid", "completed"], failed: ["failed", "refused"], cancelled: ["cancelled", "expired"] },
  webhook: { transaction_id: "data.id", reference: "data.reference" },
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  PROCESSING: "En cours",
  SUCCESS: "Réussi",
  FAILED: "Échoué",
  CANCELLED: "Annulé",
  EXPIRED: "Expiré",
  REFUNDED: "Remboursé",
  PARTIALLY_REFUNDED: "Remboursé en partie",
};

export const PAYMENT_STATUS_TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PENDING: "info",
  PROCESSING: "info",
  SUCCESS: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUNDED: "warning",
  PARTIALLY_REFUNDED: "warning",
};

export const SCHOOL_CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GNF", "CDF", "MAD", "NGN", "GHS", "KES"];

export const GLOBAL_OFF_MESSAGE = "Les paiements en ligne sont actuellement désactivés au niveau global.";
