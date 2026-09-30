// Intégrations de messagerie : chiffrement des clés, appels officiels des
// fournisseurs (réseau simulé), masquage, signature du Send Email Hook.
import { register } from "node:module";
import { createHmac, randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith(".") && !/\\.[cm]?[jt]s$/.test(specifier)) {
          try { return await next(specifier + ".ts", context); } catch {}
        }
        return next(specifier, context);
      }`),
);

const crypto = await import("../../src/lib/messaging/crypto.ts");
const p = await import("../../src/lib/messaging/providers.ts");
const { verifyStandardWebhook } = await import("../../src/lib/messaging/webhook.ts");

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { status: next.status ?? 200, text: async () => JSON.stringify(next.body ?? {}) };
  };
  return { impl, calls };
}

describe("Chiffrement des clés", () => {
  test("AES-256-GCM : aller-retour, IV aléatoire, falsification détectée, mauvaise clé refusée", () => {
    const key = randomBytes(32);
    const a = crypto.encryptSecret("xkeysib-SECRET-1234", key);
    const b = crypto.encryptSecret("xkeysib-SECRET-1234", key);
    assert.match(a, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    assert.notEqual(a, b, "IV différent à chaque chiffrement");
    assert.ok(!a.includes("SECRET"), "le chiffré ne contient pas la clé");
    assert.equal(crypto.decryptSecret(a, key), "xkeysib-SECRET-1234");
    const parts = a.split(":");
    parts[3] = Buffer.from("autre chose").toString("base64");
    assert.throws(() => crypto.decryptSecret(parts.join(":"), key));
    assert.throws(() => crypto.decryptSecret(a, randomBytes(32)));
  });

  test("clé de chiffrement : dédiée (32 octets) ou dérivée de la clé de service ; aucune sinon", () => {
    const dedicated = randomBytes(32).toString("base64");
    assert.equal(crypto.encryptionKeyFrom({ INTEGRATIONS_ENCRYPTION_KEY: dedicated }).toString("base64"), dedicated);
    assert.throws(() => crypto.encryptionKeyFrom({ INTEGRATIONS_ENCRYPTION_KEY: "trop-court" }));
    const derived = crypto.encryptionKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: "service-key" });
    assert.equal(derived.length, 32);
    assert.ok(!derived.toString("utf8").includes("service-key"));
    assert.equal(crypto.encryptionKeyFrom({}), null);
  });

  test("indice : seuls les 4 derniers caractères", () => {
    assert.equal(crypto.secretHint("xkeysib-abcdefgh-9876"), "••9876");
    assert.equal(crypto.secretHint("court"), "••••");
  });
});

describe("Fournisseurs", () => {
  test("Brevo e-mail : endpoint officiel, en-tête api-key, expéditeur et destinataire", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { messageId: "<m1@brevo>" } }]);
    const r = await p.brevoSendEmail({ apiKey: "xkeysib-K", senderEmail: "no-reply@neoscol.app", senderName: "NEOSCOOL", to: "a@b.co", subject: "S", html: "<p>h</p>" }, impl);
    assert.deepEqual(r, { ok: true, id: "<m1@brevo>" });
    assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(calls[0].init.headers["api-key"], "xkeysib-K");
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual([body.sender.email, body.to[0].email, body.subject], ["no-reply@neoscol.app", "a@b.co", "S"]);
  });

  test("erreurs : message du fournisseur, jamais la clé ; réseau coupé géré", async () => {
    const { impl } = fakeFetch([{ status: 401, body: { code: "unauthorized", message: "Key not found" } }, new Error("ECONNREFUSED")]);
    const bad = await p.brevoSendEmail({ apiKey: "xkeysib-SECRET", senderEmail: "x@y.z", to: "a@b.co", subject: "S", html: "h" }, impl);
    assert.equal(bad.ok, false);
    assert.match(bad.error, /Key not found/);
    assert.ok(!bad.error.includes("SECRET"));
    const down = await p.brevoCheck("xkeysib-SECRET", impl);
    assert.deepEqual(down, { ok: false, error: "Brevo : service injoignable." });
  });

  test("Twilio : authentification Basic, From ou MessagingServiceSid", async () => {
    const sid = "AC" + "a".repeat(32);
    const { impl, calls } = fakeFetch([{ status: 201, body: { sid: "SM1" } }, { status: 201, body: { sid: "SM2" } }]);
    await p.twilioSendSms({ accountSid: sid, authToken: "tok", from: "+22990000000", to: "+22997000000", body: "Bonjour" }, impl);
    await p.twilioSendSms({ accountSid: sid, authToken: "tok", from: "MG" + "b".repeat(32), to: "+22997000000", body: "Bonjour" }, impl);
    assert.equal(calls[0].url, `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`);
    assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from(`${sid}:tok`).toString("base64")}`);
    assert.equal(new URLSearchParams(calls[0].init.body).get("From"), "+22990000000");
    assert.equal(new URLSearchParams(calls[1].init.body).get("MessagingServiceSid"), "MG" + "b".repeat(32));
  });

  test("WhatsApp : API Cloud officielle, message de modèle avec variables", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { messages: [{ id: "wamid.1" }] } }]);
    const r = await p.whatsappSendTemplate({ accessToken: "EAAG", phoneNumberId: "1234567", to: "+22997000000", template: "rappel_paiement", language: "fr", variables: ["Awa", "15 000 F"] }, impl);
    assert.deepEqual(r, { ok: true, id: "wamid.1" });
    assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/1234567/messages");
    assert.equal(calls[0].init.headers.authorization, "Bearer EAAG");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.messaging_product, "whatsapp");
    assert.equal(body.type, "template");
    assert.equal(body.to, "22997000000");
    assert.deepEqual(body.template.components[0].parameters.map((x) => x.text), ["Awa", "15 000 F"]);
  });

  test("Turnstile : vérification serveur ; test de clé (jeton factice refusé ≠ clé refusée)", async () => {
    const { impl, calls } = fakeFetch([
      { body: { success: true, "error-codes": [] } },
      { body: { success: false, "error-codes": ["invalid-input-response"] } },
      { body: { success: false, "error-codes": ["invalid-input-secret"] } },
    ]);
    assert.deepEqual(await p.turnstileVerify({ secret: "s", token: "t", ip: "1.2.3.4" }, impl), { success: true, codes: [] });
    assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(new URLSearchParams(calls[0].init.body).get("remoteip"), "1.2.3.4");
    assert.equal((await p.turnstileCheck("bonne", impl)).ok, true);
    assert.equal((await p.turnstileCheck("mauvaise", impl)).ok, false);
  });

  test("configuration validée ; numéros E.164 ; destinataires masqués", () => {
    assert.equal(p.sanitizeConfig("brevo_email", { sender_email: "pas-une-adresse" }).ok, false);
    assert.deepEqual(p.sanitizeConfig("brevo_email", { sender_email: " no-reply@neoscol.app ", sender_name: "" }), { ok: true, config: { sender_email: "no-reply@neoscol.app" } });
    assert.equal(p.sanitizeConfig("brevo_sms", { sender: "NomBeaucoupTropLong" }).ok, false);
    assert.equal(p.normalizePhone("00229 97 00 00 00"), "+22997000000");
    assert.equal(p.normalizePhone("97000000"), null);
    assert.equal(p.maskRecipient("direction@ecole.bj"), "di•••@ecole.bj");
    assert.equal(p.maskRecipient("+22997001234"), "+229•••34");
  });
});

describe("Send Email Hook (Standard Webhooks)", () => {
  const secretBytes = randomBytes(24);
  const secret = `v1,whsec_${secretBytes.toString("base64")}`;
  const body = JSON.stringify({ user: { email: "a@b.co" }, email_data: { token: "123456" } });
  const sign = (id, ts, b) => `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${b}`).digest("base64")}`;
  const now = 1_790_000_000;

  test("signature valide acceptée ; corps modifié, mauvais secret, horodatage périmé refusés", () => {
    const headers = { id: "msg_1", timestamp: String(now), signature: sign("msg_1", now, body) };
    assert.equal(verifyStandardWebhook(body, headers, secret, now), true);
    assert.equal(verifyStandardWebhook(body.replace("123456", "000000"), headers, secret, now), false);
    assert.equal(verifyStandardWebhook(body, headers, `v1,whsec_${randomBytes(24).toString("base64")}`, now), false);
    assert.equal(verifyStandardWebhook(body, headers, secret, now + 3600), false);
    assert.equal(verifyStandardWebhook(body, { ...headers, signature: null }, secret, now), false);
    assert.equal(verifyStandardWebhook(body, headers, "", now), false);
  });
});
