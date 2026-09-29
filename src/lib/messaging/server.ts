import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { decryptSecret, encryptionKeyFrom } from "./crypto";
import {
  brevoSendEmail,
  brevoSendSms,
  maskRecipient,
  normalizePhone,
  turnstileVerify,
  twilioSendSms,
  whatsappSendTemplate,
  type IntegrationProvider,
} from "./providers";

/**
 * Envois de la plateforme (e-mail, SMS, WhatsApp) avec les intégrations
 * configurées par le Super Admin. Pour chaque envoi : intégration active ?
 * quota mensuel de l'établissement respecté ? puis envoi et journal (destinataire
 * masqué, jamais le contenu ni la clé). Sans intégration : aucun envoi, résultat
 * explicite (repli propre), jamais d'erreur bloquante pour l'appelant.
 */
export type LoadedIntegration = { provider: IntegrationProvider; config: Record<string, string>; secret: string };
export type SendResult = { ok: true; id?: string } | { ok: false; status: "failed" | "blocked_quota" | "not_configured"; error: string };

export async function loadIntegration(provider: IntegrationProvider, { requireEnabled = true } = {}): Promise<LoadedIntegration | null> {
  const admin = createAdminClient();
  const key = encryptionKeyFrom(process.env);
  if (!admin || !key) return null;
  const { data } = await admin.from("platform_integrations").select("enabled, config, secret_ciphertext").eq("provider", provider).maybeSingle();
  if (!data?.secret_ciphertext || (requireEnabled && !data.enabled)) return null;
  try {
    return { provider, config: (data.config ?? {}) as Record<string, string>, secret: decryptSecret(data.secret_ciphertext, key) };
  } catch {
    return null; // clé de chiffrement changée : l'intégration doit être ressaisie
  }
}

type Channel = "email" | "sms" | "whatsapp";
type Context = { organizationId?: string | null; purpose?: string; userId?: string | null };

async function log(channel: Channel, provider: string | null, recipient: string, ctx: Context, result: SendResult) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("message_deliveries").insert({
    organization_id: ctx.organizationId ?? null,
    channel,
    provider,
    recipient_masked: maskRecipient(recipient),
    purpose: ctx.purpose ?? "notification",
    status: result.ok ? "sent" : result.status,
    error: result.ok ? null : result.error.slice(0, 500),
    provider_message_id: result.ok ? (result.id ?? null) : null,
    created_by: ctx.userId ?? null,
  });
}

async function quotaAllows(channel: Channel, ctx: Context): Promise<boolean> {
  if (!ctx.organizationId) return true; // envois de la plateforme (authentification, tests)
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.rpc("messaging_quota_state", { p_org: ctx.organizationId, p_channel: channel });
  const state = data as { used: number; limit: number } | null;
  return Boolean(state) && state!.used < state!.limit;
}

async function guarded(channel: Channel, recipient: string, ctx: Context, run: () => Promise<{ provider: string | null; result: SendResult }>): Promise<SendResult> {
  if (!(await quotaAllows(channel, ctx))) {
    const result: SendResult = { ok: false, status: "blocked_quota", error: "Quota mensuel de l'établissement atteint." };
    await log(channel, null, recipient, ctx, result);
    return result;
  }
  const { provider, result } = await run();
  await log(channel, provider, recipient, ctx, result);
  return result;
}

const notConfigured = (what: string): SendResult => ({ ok: false, status: "not_configured", error: `${what} n'est pas configuré par la plateforme.` });
const failed = (error: string): SendResult => ({ ok: false, status: "failed", error });

export async function sendEmail(message: { to: string; subject: string; html: string; text?: string }, ctx: Context = {}): Promise<SendResult> {
  return guarded("email", message.to, ctx, async () => {
    const brevo = await loadIntegration("brevo_email");
    if (!brevo) return { provider: null, result: notConfigured("L'envoi d'e-mails") };
    const r = await brevoSendEmail({ apiKey: brevo.secret, senderEmail: brevo.config.sender_email ?? "", senderName: brevo.config.sender_name, ...message });
    return { provider: "brevo_email", result: r.ok ? { ok: true, id: r.id } : failed(r.error) };
  });
}

/** SMS : Brevo en priorité, Twilio en secours. */
export async function sendSms(message: { to: string; text: string }, ctx: Context = {}): Promise<SendResult> {
  const to = normalizePhone(message.to);
  if (!to) return { ok: false, status: "failed", error: "Numéro de téléphone invalide (format international attendu)." };
  return guarded("sms", to, ctx, async () => {
    const brevo = await loadIntegration("brevo_sms");
    let brevoError: string | null = null;
    if (brevo) {
      const r = await brevoSendSms({ apiKey: brevo.secret, sender: brevo.config.sender ?? "NeoScol", to, content: message.text });
      if (r.ok) return { provider: "brevo_sms", result: { ok: true, id: r.id } };
      brevoError = r.error;
    }
    const twilio = await loadIntegration("twilio_sms");
    if (!twilio) return brevoError ? { provider: "brevo_sms", result: failed(brevoError) } : { provider: null, result: notConfigured("L'envoi de SMS") };
    const r = await twilioSendSms({ accountSid: twilio.config.account_sid ?? "", authToken: twilio.secret, from: twilio.config.from ?? "", to, body: message.text });
    return { provider: "twilio_sms", result: r.ok ? { ok: true, id: r.id } : failed(r.error) };
  });
}

/** WhatsApp : uniquement des modèles approuvés et enregistrés dans la console. */
export async function sendWhatsApp(message: { to: string; template: string; language: string; variables?: string[] }, ctx: Context = {}): Promise<SendResult> {
  const to = normalizePhone(message.to);
  if (!to) return { ok: false, status: "failed", error: "Numéro WhatsApp invalide (format international attendu)." };
  return guarded("whatsapp", to, ctx, async () => {
    const wa = await loadIntegration("whatsapp_meta");
    if (!wa) return { provider: null, result: notConfigured("WhatsApp") };
    const admin = createAdminClient();
    const { data: template } = admin
      ? await admin.from("whatsapp_templates").select("variables_count, enabled").eq("name", message.template).eq("language", message.language).maybeSingle()
      : { data: null };
    if (!template?.enabled) return { provider: "whatsapp_meta", result: failed("Modèle WhatsApp non enregistré ou désactivé.") };
    if ((message.variables?.length ?? 0) !== template.variables_count) return { provider: "whatsapp_meta", result: failed("Nombre de variables du modèle incorrect.") };
    const r = await whatsappSendTemplate({
      accessToken: wa.secret,
      phoneNumberId: wa.config.phone_number_id ?? "",
      apiVersion: wa.config.api_version,
      to,
      template: message.template,
      language: message.language,
      variables: message.variables,
    });
    return { provider: "whatsapp_meta", result: r.ok ? { ok: true, id: r.id } : failed(r.error) };
  });
}

/** Configuration publique de Turnstile (clé de site) ; null si inactif. */
export async function turnstileSettings(): Promise<{ siteKey: string; mode: "progressive" | "always" } | null> {
  const t = await loadIntegration("turnstile");
  if (!t?.config.site_key) return null;
  return { siteKey: t.config.site_key, mode: t.config.mode === "always" ? "always" : "progressive" };
}

/** Vérification serveur d'un jeton Turnstile. Inactif : toujours accepté (repli). */
export async function verifyTurnstileToken(token: string | null | undefined, ip?: string): Promise<{ required: boolean; ok: boolean }> {
  const t = await loadIntegration("turnstile");
  if (!t) return { required: false, ok: true };
  if (!token) return { required: true, ok: false };
  const r = await turnstileVerify({ secret: t.secret, token, ip });
  return { required: true, ok: r.success };
}
