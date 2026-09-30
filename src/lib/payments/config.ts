import "server-only";

import { decryptSecret, encryptionKeyFrom } from "@/lib/messaging/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

import { CinetPayProvider } from "./cinetpay";
import { CustomHttpProvider } from "./custom";
import { customDefinitionSchema, type CustomDefinition } from "./custom-definition";
import { FedaPayProvider } from "./fedapay";
import { FlutterwaveProvider } from "./flutterwave";
import { gatewayDefinition } from "./gateways";
import { OfflineProvider } from "./offline";
import { PayDunyaProvider } from "./paydunya";
import { PaystackProvider } from "./paystack";
import { SimulationProvider } from "./simulation";
import { StripeProvider } from "./stripe";
import { PaymentProviderError, type PaymentMode, type PaymentProvider } from "./types";
import { WaveProvider } from "./wave";

/**
 * Configuration des paiements, lue UNIQUEMENT côté serveur.
 *
 * Source principale : les passerelles réglées par le Super Admin
 * (table payment_gateway_settings, clés chiffrées AES-256-GCM, jamais
 * envoyées au navigateur). Plusieurs passerelles peuvent être proposées ;
 * le client choisit au moment de payer (sinon la passerelle par défaut).
 *
 * Compatibilité : tant qu'aucune passerelle n'est activée dans le Super Admin,
 * les variables d'environnement historiques restent utilisées :
 *   PAYMENT_PROVIDER (paydunya | simulation), PAYDUNYA_MODE, PAYDUNYA_MASTER_KEY,
 *   PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN ; PAYMENT_ALLOW_SIMULATION=1 (démo locale).
 * PAYMENT_WEBHOOK_SECRET : secret ajouté à l'adresse de notification (recommandé).
 */
export type PaymentSetup =
  | { enabled: true; provider: PaymentProvider; code: string; mode: PaymentMode; label: string }
  | { enabled: false; reason: string };

export type PaymentOption = { code: string; label: string; mode: PaymentMode; isDefault: boolean; instructions: string | null };

export function paydunyaMode(): PaymentMode {
  return ["live", "production", "prod"].includes((process.env.PAYDUNYA_MODE ?? "test").toLowerCase()) ? "live" : "test";
}

export function simulationAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENT_ALLOW_SIMULATION === "1";
}

const simulationStore = {
  async getOutcome(reference: string) {
    const admin = createAdminClient();
    if (!admin) return null;
    const { data } = await admin.from("payment_simulations").select("outcome, amount").eq("reference", reference).maybeSingle();
    return data ? { outcome: data.outcome as "completed" | "cancelled" | "failed", amount: data.amount } : null;
  },
};

type GatewayRow = { provider: string; checkout_enabled: boolean; mode: string; config: unknown; secret_ciphertext: string | null };

async function gatewayRow(code: string): Promise<GatewayRow | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("payment_gateway_settings").select("provider, checkout_enabled, mode, config, secret_ciphertext").eq("provider", code).maybeSingle();
  return (data as GatewayRow | null) ?? null;
}

/** Clés d'une passerelle (JSON chiffré) ; {} si absentes ou illisibles. */
export function readGatewaySecrets(ciphertext: string | null): Record<string, string> {
  const key = encryptionKeyFrom(process.env);
  if (!ciphertext || !key) return {};
  try {
    const parsed = JSON.parse(decryptSecret(ciphertext, key)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export type CustomGateway = { code: string; name: string; description: string | null; isActive: boolean; definition: CustomDefinition };

/** Agrégateur ajouté par le Super Admin (définition revalidée à chaque lecture). */
export async function loadCustomGateway(code: string): Promise<CustomGateway | null> {
  if (!code.startsWith("custom_")) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("custom_payment_gateways").select("provider, definition, payment_providers(name, description, is_active)").eq("provider", code).maybeSingle();
  if (!data) return null;
  const parsed = customDefinitionSchema.safeParse(data.definition);
  if (!parsed.success) return null;
  const p = data.payment_providers as unknown as { name: string; description: string | null; is_active: boolean } | null;
  return { code, name: p?.name ?? code, description: p?.description ?? null, isActive: p?.is_active ?? false, definition: parsed.data };
}

/** Construit le fournisseur d'une passerelle à partir de sa configuration. */
export function buildProvider(code: string, mode: PaymentMode, config: Record<string, string>, secrets: Record<string, string>, baseUrl: string, custom?: CustomGateway | null): PaymentProvider {
  if (code.startsWith("custom_")) {
    if (!custom) throw new PaymentProviderError("Agrégateur personnalisé introuvable ou définition invalide.");
    return new CustomHttpProvider({ code, name: custom.name, mode, definition: custom.definition, config, secrets });
  }
  switch (code) {
    case "paydunya":
      return new PayDunyaProvider({ mode, masterKey: secrets.master_key ?? "", privateKey: secrets.private_key ?? "", token: secrets.token ?? "" });
    case "cinetpay":
      return new CinetPayProvider({ mode, apiKey: secrets.api_key ?? "", siteId: config.site_id ?? "" });
    case "fedapay":
      return new FedaPayProvider({ mode, secretKey: secrets.secret_key ?? "" });
    case "flutterwave":
      return new FlutterwaveProvider({ mode, secretKey: secrets.secret_key ?? "" });
    case "paystack":
      return new PaystackProvider({ mode, secretKey: secrets.secret_key ?? "" });
    case "stripe":
      return new StripeProvider({ mode, secretKey: secrets.secret_key ?? "" });
    case "wave":
      return new WaveProvider({ mode, apiKey: secrets.api_key ?? "" });
    case "offline":
      return new OfflineProvider(mode, baseUrl);
    default:
      throw new PaymentProviderError("Passerelle de paiement inconnue.");
  }
}

function labelFor(code: string, mode: PaymentMode, customName?: string) {
  const name = customName ?? gatewayDefinition(code)?.name ?? code;
  return mode === "test" ? `${name} (mode test)` : name;
}

/** Fournisseur d'un code donné (paiements en cours, notifications, retours). */
export async function providerFor(code: string, baseUrl: string): Promise<PaymentSetup> {
  if (code === "simulation") {
    if (!simulationAllowed()) return { enabled: false, reason: "Le paiement simulé est désactivé en production." };
    return { enabled: true, provider: new SimulationProvider(baseUrl, simulationStore), code, mode: "test", label: "Paiement simulé (mode test, aucun argent réel)" };
  }
  const row = await gatewayRow(code);
  // Passerelle réglée dans le Super Admin : utilisée même si elle n'est plus proposée
  // (les paiements déjà commencés doivent pouvoir être vérifiés).
  if (row && (row.secret_ciphertext || code === "offline")) {
    const mode: PaymentMode = row.mode === "live" ? "live" : "test";
    try {
      const custom = await loadCustomGateway(code);
      const provider = buildProvider(code, mode, (row.config ?? {}) as Record<string, string>, readGatewaySecrets(row.secret_ciphertext), baseUrl, custom);
      return { enabled: true, provider, code, mode, label: labelFor(code, mode, custom?.name) };
    } catch (e) {
      return { enabled: false, reason: e instanceof PaymentProviderError ? e.message : "Passerelle mal configurée." };
    }
  }
  if (code === "paydunya") {
    try {
      const provider = new PayDunyaProvider({
        mode: paydunyaMode(),
        masterKey: process.env.PAYDUNYA_MASTER_KEY ?? "",
        privateKey: process.env.PAYDUNYA_PRIVATE_KEY ?? "",
        token: process.env.PAYDUNYA_TOKEN ?? "",
      });
      return { enabled: true, provider, code, mode: provider.mode, label: labelFor(code, provider.mode) };
    } catch {
      return { enabled: false, reason: "PayDunya n'est pas configuré (Super Admin › Paiements en ligne)." };
    }
  }
  return { enabled: false, reason: "Passerelle de paiement non configurée (Super Admin › Paiements en ligne)." };
}

/** Moyens de paiement proposés au client (ordre : par défaut, puis ordre choisi). */
export async function paymentOptions({ includeOffline = true } = {}): Promise<PaymentOption[]> {
  const admin = createAdminClient();
  const list: PaymentOption[] = [];
  if (admin) {
    const { data } = await admin.rpc("available_payment_gateways");
    for (const g of (data ?? []) as { provider: string; label: string; mode: string; is_default: boolean; instructions: string | null }[]) {
      if (!includeOffline && g.provider === "offline") continue;
      list.push({ code: g.provider, label: g.label, mode: g.mode === "live" ? "live" : "test", isDefault: g.is_default, instructions: g.instructions });
    }
  }
  if (list.length === 0) {
    // Compatibilité : configuration historique par variables d'environnement.
    const code = (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
    if (code === "simulation" && simulationAllowed()) list.push({ code, label: "Paiement simulé (mode test, aucun argent réel)", mode: "test", isDefault: true, instructions: null });
    if (code === "paydunya" && process.env.PAYDUNYA_MASTER_KEY) list.push({ code, label: labelFor(code, paydunyaMode()), mode: paydunyaMode(), isDefault: true, instructions: null });
  }
  return list;
}

/** Passerelle retenue pour un nouveau paiement : choix du client s'il est proposé, sinon celle par défaut. */
export async function activePaymentSetup(baseUrl: string, chosen?: string | null, opts: { includeOffline?: boolean } = {}): Promise<PaymentSetup> {
  const options = await paymentOptions(opts);
  if (options.length === 0) return { enabled: false, reason: "Aucun moyen de paiement en ligne n'est encore activé. Contactez NeoScool." };
  const pickOption = options.find((o) => o.code === chosen) ?? options.find((o) => o.isDefault) ?? options[0]!;
  return providerFor(pickOption.code, baseUrl);
}
