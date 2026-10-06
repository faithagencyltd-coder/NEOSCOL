/**
 * Fournisseurs de messagerie et d'anti-robot : appels HTTP officiels, sans
 * dépendance. Code pur (fetch injectable) : aucune clé n'est journalisée ni
 * renvoyée dans les messages d'erreur.
 *
 *   Brevo e-mail  POST https://api.brevo.com/v3/smtp/email            (en-tête api-key)
 *   Brevo SMS     POST https://api.brevo.com/v3/transactionalSMS/sms  (en-tête api-key)
 *   Twilio SMS    POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json (Basic)
 *   WhatsApp      POST https://graph.facebook.com/{version}/{phone_number_id}/messages (Bearer)
 *                 — WhatsApp Business Platform (API officielle Meta), modèles approuvés
 *   Turnstile     POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export type FetchImpl = (url: string, init: RequestInit) => Promise<{ status: number; text: () => Promise<string> }>;
export type ProviderResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

export const BREVO_API = "https://api.brevo.com/v3";
export const TWILIO_API = "https://api.twilio.com/2010-04-01";
export const GRAPH_API = "https://graph.facebook.com";
export const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const DEFAULT_GRAPH_VERSION = "v21.0";

export type IntegrationProvider = "brevo_email" | "brevo_sms" | "twilio_sms" | "whatsapp_meta" | "turnstile" | "anthropic" | "web_push";

type Field = { key: string; label: string; hint?: string; required?: boolean; pattern?: RegExp; placeholder?: string };
export type ProviderDefinition = {
  code: IntegrationProvider;
  label: string;
  channel: "email" | "sms" | "whatsapp" | "antibot" | "ai" | "push";
  description: string;
  docs: string;
  fields: Field[];
  secret: { label: string; hint: string };
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    code: "brevo_email",
    label: "Brevo — E-mail",
    channel: "email",
    description: "E-mails transactionnels : vérification d'adresse, mots de passe, notifications, rappels.",
    docs: "Brevo → SMTP & API → Clés API. Vérifiez l'expéditeur (domaine) dans Brevo.",
    fields: [
      { key: "sender_email", label: "Adresse d'expédition", required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, placeholder: "no-reply@votre-domaine.com" },
      { key: "sender_name", label: "Nom d'expéditeur", placeholder: "NeoScool" },
    ],
    secret: { label: "Clé API Brevo", hint: "Commence par « xkeysib- »." },
  },
  {
    code: "brevo_sms",
    label: "Brevo — SMS",
    channel: "sms",
    description: "SMS transactionnels (codes, alertes). Fournisseur SMS principal.",
    docs: "Brevo → SMS : achetez des crédits SMS et choisissez un nom d'expéditeur (11 caractères max).",
    fields: [{ key: "sender", label: "Nom d'expéditeur SMS", required: true, pattern: /^[A-Za-z0-9 ]{3,11}$/, placeholder: "NeoScool" }],
    secret: { label: "Clé API Brevo", hint: "Même type de clé que pour l'e-mail (peut être la même)." },
  },
  {
    code: "twilio_sms",
    label: "Twilio — SMS",
    channel: "sms",
    description: "SMS de secours : utilisé si Brevo SMS n'est pas actif.",
    docs: "Console Twilio → Account Info : Account SID et Auth Token ; numéro ou Messaging Service.",
    fields: [
      { key: "account_sid", label: "Account SID", required: true, pattern: /^AC[a-f0-9]{32}$/, placeholder: "AC…" },
      { key: "from", label: "Expéditeur (numéro E.164 ou Messaging Service SID)", required: true, pattern: /^(\+[1-9]\d{6,14}|MG[a-f0-9]{32})$/, placeholder: "+229… ou MG…" },
    ],
    secret: { label: "Auth Token Twilio", hint: "32 caractères." },
  },
  {
    code: "whatsapp_meta",
    label: "WhatsApp Business Platform (Meta)",
    channel: "whatsapp",
    description: "API officielle WhatsApp Cloud de Meta : messages basés sur des modèles approuvés. Aucune automatisation non officielle.",
    docs: "Meta for Developers → WhatsApp → Configuration de l'API : identifiant du numéro et jeton d'accès permanent (utilisateur système).",
    fields: [
      { key: "phone_number_id", label: "Identifiant du numéro (Phone number ID)", required: true, pattern: /^\d{5,30}$/ },
      { key: "business_account_id", label: "Identifiant du compte WhatsApp Business", pattern: /^\d{5,30}$/ },
      { key: "api_version", label: "Version de l'API Graph", pattern: /^v\d{1,2}\.\d$/, placeholder: DEFAULT_GRAPH_VERSION },
    ],
    secret: { label: "Jeton d'accès permanent", hint: "Jeton d'un utilisateur système Meta (ne pas utiliser un jeton temporaire de 24 h)." },
  },
  {
    code: "turnstile",
    label: "Cloudflare Turnstile — anti-robot",
    channel: "antibot",
    description: "Vérification anti-robot invisible pour l'inscription et la connexion, contrôlée côté serveur.",
    docs: "Cloudflare → Turnstile → Ajouter un site : clé de site (publique) et clé secrète.",
    fields: [
      { key: "site_key", label: "Clé de site (publique)", required: true, pattern: /^[0-9A-Za-z_-]{10,100}$/, placeholder: "0x4AAAAAA…" },
      { key: "mode", label: "Déclenchement", hint: "progressive : après des échecs ; always : à chaque inscription/connexion.", pattern: /^(progressive|always)$/, placeholder: "progressive" },
    ],
    secret: { label: "Clé secrète Turnstile", hint: "Jamais affichée dans le navigateur." },
  },
  {
    code: "anthropic",
    label: "Claude (Anthropic) — assistant IA",
    channel: "ai",
    description: "Réponses de l'assistant rédigées par Claude. Les données restent consultées avec les droits de chaque utilisateur ; sans clé, l'assistant répond localement.",
    docs: "Console Anthropic → API Keys → Create Key. Le quota mensuel de questions par établissement se règle plus bas.",
    fields: [],
    secret: { label: "Clé API Claude", hint: "Commence par « sk-ant- ». Jamais affichée dans le navigateur." },
  },
  {
    code: "web_push",
    label: "Notifications push (Web Push)",
    channel: "push",
    description: "Notifications sur les téléphones et ordinateurs des utilisateurs qui les activent (paiements, absences, notes, bulletins…), même application fermée.",
    docs: "Norme VAPID : utilisez « Générer des clés » (recommandé) ou collez une paire existante. Le contact est transmis aux services push (Google, Mozilla, Apple).",
    fields: [
      { key: "public_key", label: "Clé publique VAPID", required: true, pattern: /^[A-Za-z0-9_-]{80,100}$/, placeholder: "BNc…" },
      { key: "subject", label: "Contact (mailto: ou https:)", required: true, pattern: /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/\S+)$/, placeholder: "mailto:support@votre-domaine.com" },
    ],
    secret: { label: "Clé privée VAPID", hint: "43 caractères. Jamais affichée dans le navigateur." },
  },
];

export function providerDefinition(code: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.code === code);
}

/** Valide et nettoie la configuration non secrète d'un fournisseur. */
export function sanitizeConfig(code: IntegrationProvider, input: Record<string, string>): { ok: true; config: Record<string, string> } | { ok: false; error: string } {
  const def = providerDefinition(code);
  if (!def) return { ok: false, error: "Intégration inconnue." };
  const config: Record<string, string> = {};
  for (const field of def.fields) {
    const value = (input[field.key] ?? "").trim();
    if (!value) {
      if (field.required) return { ok: false, error: `${field.label} : champ obligatoire.` };
      continue;
    }
    if (value.length > 300 || (field.pattern && !field.pattern.test(value))) return { ok: false, error: `${field.label} : valeur invalide.` };
    config[field.key] = value;
  }
  return { ok: true, config };
}

/** Numéro au format international E.164 (+22997000000). Null si invalide. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s.()-]/g, "");
  const e164 = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/** Destinataire masqué pour le journal (jamais l'adresse ou le numéro complet). */
export function maskRecipient(value: string): string {
  const v = value.trim();
  const at = v.indexOf("@");
  if (at > 0) return `${v.slice(0, Math.min(2, at))}•••@${v.slice(at + 1)}`.slice(0, 120);
  return v.length > 6 ? `${v.slice(0, 4)}•••${v.slice(-2)}` : "•••";
}

async function call(fetchImpl: FetchImpl, url: string, init: RequestInit): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function failure(provider: string, status: number, json: Record<string, unknown> | null): ProviderResult {
  const error = json?.error as Record<string, unknown> | string | undefined;
  const detail =
    (typeof json?.message === "string" && json.message) ||
    (typeof error === "object" && typeof error?.message === "string" && error.message) ||
    (typeof error === "string" && error) ||
    `HTTP ${status}`;
  return { ok: false, error: `${provider} : ${String(detail).slice(0, 200)}` };
}

function network(provider: string, e: unknown): ProviderResult {
  const reason = e instanceof Error && e.name === "TimeoutError" ? "délai dépassé" : "service injoignable";
  return { ok: false, error: `${provider} : ${reason}.` };
}

// --------------------------------------------------------------------------
// Brevo
// --------------------------------------------------------------------------
export async function brevoSendEmail(
  args: { apiKey: string; senderEmail: string; senderName?: string; to: string; subject: string; html: string; text?: string },
  fetchImpl: FetchImpl = fetch,
): Promise<ProviderResult> {
  try {
    const { status, json } = await call(fetchImpl, `${BREVO_API}/smtp/email`, {
      method: "POST",
      headers: { "api-key": args.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: args.senderEmail, name: args.senderName || "NeoScool" },
        to: [{ email: args.to }],
        subject: args.subject,
        htmlContent: args.html,
        ...(args.text ? { textContent: args.text } : {}),
      }),
    });
    if (status >= 200 && status < 300) return { ok: true, id: typeof json?.messageId === "string" ? json.messageId : undefined };
    return failure("Brevo", status, json);
  } catch (e) {
    return network("Brevo", e);
  }
}

export async function brevoSendSms(args: { apiKey: string; sender: string; to: string; content: string }, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  try {
    const { status, json } = await call(fetchImpl, `${BREVO_API}/transactionalSMS/sms`, {
      method: "POST",
      headers: { "api-key": args.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: args.sender, recipient: args.to.replace(/^\+/, ""), content: args.content, type: "transactional" }),
    });
    if (status >= 200 && status < 300) return { ok: true, id: json?.messageId != null ? String(json.messageId) : undefined };
    return failure("Brevo SMS", status, json);
  } catch (e) {
    return network("Brevo SMS", e);
  }
}

/** Vérifie une clé Brevo sans rien envoyer. */
export async function brevoCheck(apiKey: string, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  try {
    const { status, json } = await call(fetchImpl, `${BREVO_API}/account`, { method: "GET", headers: { "api-key": apiKey, accept: "application/json" } });
    if (status === 200) return { ok: true, message: `Compte Brevo reconnu${typeof json?.companyName === "string" ? ` : ${json.companyName}` : ""}.` };
    return failure("Brevo", status, json);
  } catch (e) {
    return network("Brevo", e);
  }
}

// --------------------------------------------------------------------------
// Twilio
// --------------------------------------------------------------------------
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

export async function twilioSendSms(args: { accountSid: string; authToken: string; from: string; to: string; body: string }, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  const form = new URLSearchParams({ To: args.to, Body: args.body, ...(args.from.startsWith("MG") ? { MessagingServiceSid: args.from } : { From: args.from }) });
  try {
    const { status, json } = await call(fetchImpl, `${TWILIO_API}/Accounts/${encodeURIComponent(args.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { authorization: basic(args.accountSid, args.authToken), "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (status >= 200 && status < 300) return { ok: true, id: typeof json?.sid === "string" ? json.sid : undefined };
    return failure("Twilio", status, json);
  } catch (e) {
    return network("Twilio", e);
  }
}

export async function twilioCheck(accountSid: string, authToken: string, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  try {
    const { status, json } = await call(fetchImpl, `${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}.json`, {
      method: "GET",
      headers: { authorization: basic(accountSid, authToken) },
    });
    if (status === 200) return { ok: true, message: `Compte Twilio reconnu (${typeof json?.status === "string" ? json.status : "actif"}).` };
    return failure("Twilio", status, json);
  } catch (e) {
    return network("Twilio", e);
  }
}

// --------------------------------------------------------------------------
// WhatsApp Business Platform (Cloud API officielle)
// --------------------------------------------------------------------------
export async function whatsappSendTemplate(
  args: { accessToken: string; phoneNumberId: string; apiVersion?: string; to: string; template: string; language: string; variables?: string[] },
  fetchImpl: FetchImpl = fetch,
): Promise<ProviderResult> {
  const version = args.apiVersion || DEFAULT_GRAPH_VERSION;
  const body = {
    messaging_product: "whatsapp",
    to: args.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: args.template,
      language: { code: args.language },
      ...(args.variables?.length ? { components: [{ type: "body", parameters: args.variables.map((text) => ({ type: "text", text })) }] } : {}),
    },
  };
  try {
    const { status, json } = await call(fetchImpl, `${GRAPH_API}/${version}/${encodeURIComponent(args.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${args.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const messages = json?.messages as { id?: string }[] | undefined;
    if (status >= 200 && status < 300) return { ok: true, id: messages?.[0]?.id };
    return failure("WhatsApp", status, json);
  } catch (e) {
    return network("WhatsApp", e);
  }
}

/** Message texte libre : autorisé seulement dans les 24 h qui suivent le dernier message du contact (règle Meta). */
export async function whatsappSendText(
  args: { accessToken: string; phoneNumberId: string; apiVersion?: string; to: string; body: string },
  fetchImpl: FetchImpl = fetch,
): Promise<ProviderResult> {
  const version = args.apiVersion || DEFAULT_GRAPH_VERSION;
  try {
    const { status, json } = await call(fetchImpl, `${GRAPH_API}/${version}/${encodeURIComponent(args.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${args.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: args.to.replace(/^\+/, ""), type: "text", text: { body: args.body.slice(0, 4000), preview_url: false } }),
    });
    const messages = json?.messages as { id?: string }[] | undefined;
    if (status >= 200 && status < 300) return { ok: true, id: messages?.[0]?.id };
    return failure("WhatsApp", status, json);
  } catch (e) {
    return network("WhatsApp", e);
  }
}

export async function whatsappCheck(accessToken: string, phoneNumberId: string, apiVersion?: string, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  try {
    const { status, json } = await call(fetchImpl, `${GRAPH_API}/${apiVersion || DEFAULT_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (status === 200) return { ok: true, message: `Numéro WhatsApp reconnu : ${String(json?.display_phone_number ?? "")} ${String(json?.verified_name ?? "")}`.trim() };
    return failure("WhatsApp", status, json);
  } catch (e) {
    return network("WhatsApp", e);
  }
}

// --------------------------------------------------------------------------
// Cloudflare Turnstile
// --------------------------------------------------------------------------
export async function turnstileVerify(args: { secret: string; token: string; ip?: string }, fetchImpl: FetchImpl = fetch): Promise<{ success: boolean; codes: string[] }> {
  try {
    const form = new URLSearchParams({ secret: args.secret, response: args.token, ...(args.ip ? { remoteip: args.ip } : {}) });
    const { json } = await call(fetchImpl, TURNSTILE_VERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return { success: json?.success === true, codes: Array.isArray(json?.["error-codes"]) ? (json["error-codes"] as string[]) : [] };
  } catch {
    return { success: false, codes: ["network-error"] };
  }
}

/** Vérifie la clé secrète : un jeton factice doit être refusé pour « jeton invalide », pas pour « clé invalide ». */
export async function turnstileCheck(secret: string, fetchImpl: FetchImpl = fetch): Promise<ProviderResult> {
  const { codes } = await turnstileVerify({ secret, token: "neoscol-test" }, fetchImpl);
  if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) return { ok: false, error: "Turnstile : clé secrète refusée par Cloudflare." };
  if (codes.includes("network-error")) return { ok: false, error: "Turnstile : service injoignable." };
  return { ok: true, message: "Clé secrète Turnstile reconnue par Cloudflare." };
}
