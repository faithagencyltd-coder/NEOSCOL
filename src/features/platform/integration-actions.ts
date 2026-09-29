"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionContext } from "@/lib/auth/session";
import { encryptionKeyFrom, encryptSecret, secretHint } from "@/lib/messaging/crypto";
import {
  brevoCheck,
  brevoSendEmail,
  brevoSendSms,
  maskRecipient,
  normalizePhone,
  providerDefinition,
  sanitizeConfig,
  turnstileCheck,
  twilioCheck,
  twilioSendSms,
  whatsappCheck,
  whatsappSendTemplate,
  type IntegrationProvider,
  type ProviderResult,
} from "@/lib/messaging/providers";
import { loadIntegration } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

async function requirePlatformAdmin(): Promise<{ ok: true; userId: string; email: string | null } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true, userId: context.user.id, email: context.user.email ?? null } : { ok: false, message: "Réservé à l'administration de la plateforme NéoScol." };
}

const refresh = () => revalidatePath("/plateforme/integrations");

/**
 * Enregistre une intégration. La clé secrète est chiffrée ICI (serveur) avant
 * d'être transmise à la base ; elle n'est jamais renvoyée au navigateur.
 * Champ clé vide = clé inchangée.
 */
export async function saveIntegration(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const provider = String(formData.get("provider") ?? "") as IntegrationProvider;
  const def = providerDefinition(provider);
  if (!def) return { ok: false, message: "Intégration inconnue." };
  const input = Object.fromEntries(def.fields.map((f) => [f.key, String(formData.get(`config_${f.key}`) ?? "")]));
  const clean = sanitizeConfig(provider, input);
  if (!clean.ok) return { ok: false, message: clean.error };
  const secret = String(formData.get("secret") ?? "").trim();
  const clear = formData.get("clear_secret") === "on";
  if (secret && (secret.length < 8 || secret.length > 500 || /\s/.test(secret))) return { ok: false, message: `${def.secret.label} : valeur invalide.` };
  let ciphertext: string | null = null;
  if (secret && !clear) {
    const key = encryptionKeyFrom(process.env);
    if (!key) return { ok: false, message: "Chiffrement indisponible : la clé de service Supabase (ou INTEGRATIONS_ENCRYPTION_KEY) manque sur le serveur." };
    ciphertext = encryptSecret(secret, key);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_integration", {
    p_provider: provider,
    p_enabled: formData.get("enabled") === "on",
    p_config: clean.config,
    p_secret_ciphertext: ciphertext ?? undefined,
    p_secret_hint: ciphertext ? secretHint(secret) : undefined,
    p_clear_secret: clear,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `${def.label} : configuration enregistrée${ciphertext ? " (clé chiffrée)" : ""}.` };
}

async function logTest(channel: "email" | "sms" | "whatsapp", provider: string, recipient: string, userId: string, r: ProviderResult) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("message_deliveries").insert({
    organization_id: null,
    channel,
    provider,
    recipient_masked: maskRecipient(recipient),
    purpose: "test",
    status: r.ok ? "sent" : "failed",
    error: r.ok ? null : r.error.slice(0, 500),
    provider_message_id: r.ok ? (r.id ?? null) : null,
    created_by: userId,
  });
}

/**
 * Teste une intégration (même désactivée) : vérification des identifiants
 * auprès du fournisseur, puis, si un destinataire est donné, envoi réel d'un
 * message de test. Résultat enregistré et journalisé.
 */
export async function testIntegration(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const provider = String(formData.get("provider") ?? "") as IntegrationProvider;
  const def = providerDefinition(provider);
  if (!def) return { ok: false, message: "Intégration inconnue." };
  const integration = await loadIntegration(provider, { requireEnabled: false });
  if (!integration) return { ok: false, message: "Enregistrez d'abord la clé secrète de cette intégration." };
  const { config, secret } = integration;
  const recipient = String(formData.get("recipient") ?? "").trim();

  let result: ProviderResult;
  switch (provider) {
    case "brevo_email": {
      result = await brevoCheck(secret);
      const to = recipient || auth.email || "";
      if (result.ok && to) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: "Adresse e-mail de test invalide." };
        result = await brevoSendEmail({
          apiKey: secret,
          senderEmail: config.sender_email ?? "",
          senderName: config.sender_name,
          to,
          subject: "Test NéoScol — e-mail",
          html: "<p>Ceci est un e-mail de test envoyé depuis la console NéoScol. L'intégration Brevo fonctionne.</p>",
          text: "Ceci est un e-mail de test envoyé depuis la console NéoScol. L'intégration Brevo fonctionne.",
        });
        await logTest("email", provider, to, auth.userId, result);
        if (result.ok) result = { ok: true, message: `E-mail de test envoyé à ${maskRecipient(to)}.` };
      }
      break;
    }
    case "brevo_sms":
    case "twilio_sms": {
      result = provider === "brevo_sms" ? await brevoCheck(secret) : await twilioCheck(config.account_sid ?? "", secret);
      if (result.ok && recipient) {
        const to = normalizePhone(recipient);
        if (!to) return { ok: false, message: "Numéro de test invalide (format international : +229…)." };
        const text = "Test NeoScol : l'envoi de SMS fonctionne.";
        result =
          provider === "brevo_sms"
            ? await brevoSendSms({ apiKey: secret, sender: config.sender ?? "NeoScol", to, content: text })
            : await twilioSendSms({ accountSid: config.account_sid ?? "", authToken: secret, from: config.from ?? "", to, body: text });
        await logTest("sms", provider, to, auth.userId, result);
        if (result.ok) result = { ok: true, message: `SMS de test envoyé à ${maskRecipient(to)}.` };
      }
      break;
    }
    case "whatsapp_meta": {
      result = await whatsappCheck(secret, config.phone_number_id ?? "", config.api_version);
      if (result.ok && recipient) {
        const to = normalizePhone(recipient);
        if (!to) return { ok: false, message: "Numéro WhatsApp de test invalide (format international : +229…)." };
        // « hello_world » : modèle de test fourni par Meta sur tout compte WhatsApp Business.
        result = await whatsappSendTemplate({ accessToken: secret, phoneNumberId: config.phone_number_id ?? "", apiVersion: config.api_version, to, template: "hello_world", language: "en_US" });
        await logTest("whatsapp", provider, to, auth.userId, result);
        if (result.ok) result = { ok: true, message: `Message WhatsApp de test (modèle hello_world) envoyé à ${maskRecipient(to)}.` };
      }
      break;
    }
    case "turnstile":
      result = await turnstileCheck(secret);
      break;
    default:
      return { ok: false, message: "Intégration inconnue." };
  }

  const message = result.ok ? (result.message ?? "Connexion au fournisseur réussie.") : result.error;
  const supabase = await createClient();
  await supabase.rpc("platform_record_integration_test", { p_provider: provider, p_ok: result.ok, p_message: message });
  refresh();
  return result.ok ? { ok: true, message } : { ok: false, message };
}

const limit = z.coerce.number().int({ error: "Nombre entier attendu." }).min(0).max(1_000_000);

export async function saveMessagingDefaults(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = z.object({ email: limit, sms: limit, whatsapp: limit }).safeParse({ email: formData.get("email"), sms: formData.get("sms"), whatsapp: formData.get("whatsapp") });
  if (!parsed.success) return { ok: false, message: "Quotas invalides (nombres entiers positifs)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_messaging_settings", { p_email: parsed.data.email, p_sms: parsed.data.sms, p_whatsapp: parsed.data.whatsapp });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Quotas mensuels par défaut enregistrés." };
}

/** Quota d'un établissement ; champ vide = valeur par défaut de la plateforme. */
export async function saveOrganizationQuota(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const org = String(formData.get("organization_id") ?? "");
  if (!isUuid(org)) return { ok: false, message: "Établissement invalide." };
  const read = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return { ok: true as const, value: null };
    const v = limit.safeParse(raw);
    return v.success ? { ok: true as const, value: v.data } : { ok: false as const };
  };
  const email = read("email");
  const sms = read("sms");
  const whatsapp = read("whatsapp");
  if (!email.ok || !sms.ok || !whatsapp.ok) return { ok: false, message: "Quotas invalides (nombres entiers positifs ou vide)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_messaging_quota", {
    p_org: org,
    p_email: email.value as number,
    p_sms: sms.value as number,
    p_whatsapp: whatsapp.value as number,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Quota de l'établissement enregistré." };
}

export async function saveWhatsappTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = z
    .object({
      name: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{1,512}$/, { error: "Nom du modèle : minuscules, chiffres et « _ » (comme chez Meta)." }),
      language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, { error: "Langue : fr, en_US…" }),
      description: z.string().trim().max(300).optional(),
      variables: z.coerce.number().int().min(0).max(20),
    })
    .safeParse({ name: formData.get("name"), language: formData.get("language"), description: String(formData.get("description") ?? "") || undefined, variables: formData.get("variables") ?? 0 });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Modèle invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_upsert_whatsapp_template", {
    p_name: parsed.data.name,
    p_language: parsed.data.language,
    p_description: parsed.data.description ?? "",
    p_variables: parsed.data.variables,
    p_enabled: formData.get("enabled") !== "off",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Modèle WhatsApp enregistré. Il doit être approuvé chez Meta avec exactement ce nom et cette langue." };
}

// ---------------------------------------------------------------------------
// Centre de sécurité
// ---------------------------------------------------------------------------
export async function saveSecuritySettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const parsed = z
    .object({
      lockout_threshold: z.coerce.number().int().min(3).max(50),
      lockout_minutes: z.coerce.number().int().min(1).max(1440),
      captcha_after: z.coerce.number().int().min(1).max(50),
    })
    .safeParse({ lockout_threshold: formData.get("lockout_threshold"), lockout_minutes: formData.get("lockout_minutes"), captcha_after: formData.get("captcha_after") });
  if (!parsed.success) return { ok: false, message: "Valeurs invalides (verrouillage : 3 à 50 échecs, 1 à 1440 minutes)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_security_settings", {
    p_lockout_threshold: parsed.data.lockout_threshold,
    p_lockout_minutes: parsed.data.lockout_minutes,
    p_captcha_after: parsed.data.captcha_after,
    p_mfa_required: formData.get("mfa_required") === "on",
    p_email_verification: formData.get("email_verification") === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/securite");
  return { ok: true, message: "Réglages de sécurité enregistrés." };
}

export async function unlockAccount(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const hash = String(formData.get("identifier_hash") ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, message: "Compte introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_unlock_account", { p_identifier_hash: hash });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/securite");
  return { ok: true, message: "Compte déverrouillé." };
}

export async function revokeUserSessions(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const user = String(formData.get("user_id") ?? "");
  if (!isUuid(user)) return { ok: false, message: "Compte introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_revoke_user_sessions", { p_user: user });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/securite");
  return { ok: true, message: `${data ?? 0} session(s) fermée(s) : le compte devra se reconnecter.` };
}
