"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/session";
import { encryptionKeyFrom, encryptSecret, secretHint } from "@/lib/messaging/crypto";
import { buildProvider, readGatewaySecrets } from "@/lib/payments/config";
import { gatewayDefinition } from "@/lib/payments/gateways";
import { PaymentProviderError } from "@/lib/payments/types";
import { publicBaseUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

async function requirePlatformAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true } : { ok: false, message: "Réservé à l'administration de la plateforme NeoScool." };
}

const refresh = () => {
  revalidatePath("/plateforme/paiements-en-ligne");
  revalidatePath("/plateforme/paiements");
};

async function storedSecrets(code: string) {
  const admin = createAdminClient();
  if (!admin) return {};
  const { data } = await admin.from("payment_gateway_settings").select("secret_ciphertext").eq("provider", code).maybeSingle();
  return readGatewaySecrets(data?.secret_ciphertext ?? null);
}

/**
 * Réglage d'une passerelle. Les clés sont chiffrées ICI (serveur) avant d'être
 * envoyées à la base ; un champ de clé laissé vide conserve la clé actuelle.
 */
export async function saveGateway(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const code = String(formData.get("provider") ?? "");
  const def = gatewayDefinition(code);
  if (!def) return { ok: false, message: "Passerelle inconnue." };
  const clear = formData.get("clear_secret") === "on";

  const config: Record<string, string> = {};
  for (const f of def.publicFields) {
    const value = String(formData.get(`config_${f.key}`) ?? "").trim();
    if (value.length > 200 || /\s/.test(value)) return { ok: false, message: `${f.label} : valeur invalide.` };
    if (value) config[f.key] = value;
  }
  const typed: Record<string, string> = {};
  for (const f of def.secretFields) {
    const value = String(formData.get(`secret_${f.key}`) ?? "").trim();
    if (value && (value.length < 6 || value.length > 500 || /\s/.test(value))) return { ok: false, message: `${f.label} : valeur invalide.` };
    if (value) typed[f.key] = value;
  }
  const enabled = formData.get("checkout_enabled") === "on";
  let ciphertext: string | undefined;
  let hint: string | undefined;
  if (Object.keys(typed).length && !clear) {
    const key = encryptionKeyFrom(process.env);
    if (!key) return { ok: false, message: "Chiffrement indisponible : la clé de service Supabase (ou INTEGRATIONS_ENCRYPTION_KEY) manque sur le serveur." };
    const merged = { ...(await storedSecrets(code)), ...typed };
    const missing = def.secretFields.filter((f) => f.required && !merged[f.key]);
    if (missing.length && enabled) return { ok: false, message: `Champ manquant : ${missing.map((f) => f.label).join(", ")}.` };
    ciphertext = encryptSecret(JSON.stringify(merged), key);
    hint = secretHint(merged[def.secretFields[0]!.key] ?? "");
  }
  if (enabled && def.secretFields.length && !clear && !ciphertext) {
    const current = await storedSecrets(code);
    const missing = def.secretFields.filter((f) => f.required && !current[f.key]);
    if (missing.length) return { ok: false, message: `Renseignez d'abord : ${missing.map((f) => f.label).join(", ")}.` };
  }
  if (enabled && def.publicFields.some((f) => f.required && !config[f.key])) return { ok: false, message: `Renseignez : ${def.publicFields.filter((f) => f.required).map((f) => f.label).join(", ")}.` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_payment_gateway", {
    p_provider: code,
    p_checkout_enabled: enabled,
    p_mode: formData.get("mode") === "live" ? "live" : "test",
    p_is_default: formData.get("is_default") === "on",
    p_public_label: String(formData.get("public_label") ?? "").slice(0, 80),
    p_instructions: String(formData.get("instructions") ?? "").slice(0, 2000),
    p_config: config,
    p_secret_ciphertext: ciphertext,
    p_secret_hint: hint,
    p_clear_secret: clear,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `${def.name} : réglages enregistrés${ciphertext ? " (clés chiffrées)" : ""}.` };
}

/** Vérifie les clés auprès du fournisseur (sans paiement quand son API le permet). */
export async function testGateway(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const code = String(formData.get("provider") ?? "");
  const def = gatewayDefinition(code);
  const admin = createAdminClient();
  if (!def || !admin) return { ok: false, message: "Passerelle inconnue." };
  const { data: row } = await admin.from("payment_gateway_settings").select("mode, config, secret_ciphertext, instructions").eq("provider", code).maybeSingle();
  let ok: boolean;
  let message: string;
  if (code === "offline") {
    ok = Boolean(row?.instructions && row.instructions.length >= 10);
    message = ok ? "Instructions prêtes : le client les verra au moment de payer." : "Écrivez d'abord les instructions de paiement.";
  } else if (!row?.secret_ciphertext) {
    ok = false;
    message = "Enregistrez d'abord les clés de cette passerelle.";
  } else {
    try {
      const provider = buildProvider(code, row.mode === "live" ? "live" : "test", (row.config ?? {}) as Record<string, string>, readGatewaySecrets(row.secret_ciphertext), await publicBaseUrl());
      if (provider.checkCredentials) {
        const r = await provider.checkCredentials();
        ok = r.ok;
        message = r.ok ? r.message : r.error;
      } else {
        ok = true;
        message = `Clés enregistrées. ${def.name} ne permet pas de vérifier les clés sans paiement : faites un petit paiement pour confirmer.`;
      }
    } catch (e) {
      ok = false;
      message = e instanceof PaymentProviderError ? e.message : "Vérification impossible.";
    }
  }
  const supabase = await createClient();
  await supabase.rpc("platform_record_gateway_test", { p_provider: code, p_ok: ok, p_message: message });
  refresh();
  return ok ? { ok: true, message } : { ok: false, message };
}

/** Validation ou refus d'un paiement par transfert déclaré par un établissement. */
export async function decideOfflinePayment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const id = String(formData.get("transaction_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Paiement invalide." };
  const accept = formData.get("decision") === "accept";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_decide_offline_payment", { p_transaction: id, p_accept: accept, p_reason: String(formData.get("reason") ?? "") || undefined });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const result = (data ?? {}) as { result?: string; reason?: string };
  refresh();
  if (accept && result.result !== "confirmed" && result.result !== "duplicate") return { ok: false, message: `Validation refusée par le contrôle : ${result.reason ?? result.result ?? "inconnu"}.` };
  return { ok: true, message: accept ? "Paiement validé : facture payée et abonnement activé." : "Paiement refusé : l'établissement voit le motif." };
}
