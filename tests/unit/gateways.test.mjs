// Connecteurs de paiement (CinetPay, FedaPay, Flutterwave, Paystack, Stripe, Wave,
// transfert) : requêtes envoyées, lecture des statuts, notifications, secrets jamais exposés.
import { register } from "node:module";
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

const { CinetPayProvider } = await import("../../src/lib/payments/cinetpay.ts");
const { FedaPayProvider } = await import("../../src/lib/payments/fedapay.ts");
const { FlutterwaveProvider } = await import("../../src/lib/payments/flutterwave.ts");
const { PaystackProvider } = await import("../../src/lib/payments/paystack.ts");
const { StripeProvider } = await import("../../src/lib/payments/stripe.ts");
const { WaveProvider } = await import("../../src/lib/payments/wave.ts");
const { OfflineProvider } = await import("../../src/lib/payments/offline.ts");

function fake(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const [status, body] = Array.isArray(next) ? next : [200, next];
    return { status, text: async () => JSON.stringify(body) };
  };
  return { impl, calls };
}
const req = {
  reference: "NEO-2026-000042",
  amount: 15000,
  currency: "XOF",
  description: "Abonnement NeoScool Module scolaire — mensuel",
  itemName: "NeoScool Module scolaire (1 mois)",
  storeName: "NeoScool",
  returnUrl: "https://app.test/abonnement/retour?ref=NEO-2026-000042",
  cancelUrl: "https://app.test/abonnement/retour?ref=NEO-2026-000042&annule=1",
  callbackUrl: "https://app.test/api/webhooks/payments/x",
  customData: { organization_id: "o" },
  customer: { email: "direction@ecole.test", name: "École Test", phone: "+22900000000" },
};
const secretAbsent = (calls, secret) => calls.every((c) => !String(c.url).includes(secret));

describe("CinetPay", () => {
  test("création, vérification ACCEPTED, notification cpm_trans_id", async () => {
    const f = fake([{ code: "201", message: "CREATED", data: { payment_token: "tok", payment_url: "https://checkout.cinetpay.com/p/tok" } }, { code: "00", message: "SUCCES", data: { status: "ACCEPTED", amount: "15000", currency: "XOF", payment_method: "OMCIV2" } }]);
    const p = new CinetPayProvider({ mode: "live", apiKey: "API-SECRET-1", siteId: "123456", fetchImpl: f.impl });
    const s = await p.createCheckout(req);
    assert.equal(s.checkoutUrl, "https://checkout.cinetpay.com/p/tok");
    assert.equal(s.providerTransactionId, req.reference);
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.transaction_id, req.reference);
    assert.equal(body.amount, 15000);
    assert.equal(body.site_id, "123456");
    const v = await p.verifyPayment(req.reference);
    assert.deepEqual([v.state, v.amount, v.currency], ["paid", 15000, "XOF"]);
    assert.equal(p.handleWebhook({ cpm_trans_id: req.reference, cpm_site_id: "123456" }).providerTransactionId, req.reference);
    assert.ok(secretAbsent(f.calls, "API-SECRET-1"), "clé jamais dans l'URL");
    await assert.rejects(p.createCheckout({ ...req, amount: 15001 }), /multiple de 5/);
  });
});

describe("FedaPay", () => {
  test("transaction + jeton, statut approved, mode test = sandbox", async () => {
    const f = fake([{ "v1/transaction": { id: 987 } }, { token: "t", url: "https://sandbox-process.fedapay.com/t" }, { "v1/transaction": { id: 987, status: "approved", amount: 15000, merchant_reference: req.reference, mode: "mtn" } }]);
    const p = new FedaPayProvider({ mode: "test", secretKey: "sk_sandbox_SECRET", fetchImpl: f.impl });
    const s = await p.createCheckout(req);
    assert.equal(s.providerTransactionId, "987");
    assert.ok(f.calls[0].url.startsWith("https://sandbox-api.fedapay.com/v1/transactions"));
    assert.equal(f.calls[0].init.headers.Authorization, "Bearer sk_sandbox_SECRET");
    const v = await p.verifyPayment("987");
    assert.deepEqual([v.state, v.amount, v.reference], ["paid", 15000, req.reference]);
    assert.equal(p.handleWebhook({ name: "transaction.approved", entity: { id: 987 } }).providerTransactionId, "987");
  });
});

describe("Flutterwave, Paystack", () => {
  test("Flutterwave : lien hébergé, vérification par référence, e-mail exigé", async () => {
    const f = fake([{ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/x" } }, { status: "success", data: { status: "successful", amount: 15000, currency: "XOF", tx_ref: req.reference, payment_type: "mobilemoneyfranco" } }]);
    const p = new FlutterwaveProvider({ mode: "test", secretKey: "FLWSECK_TEST-x", fetchImpl: f.impl });
    await p.createCheckout(req);
    assert.equal(JSON.parse(f.calls[0].init.body).tx_ref, req.reference);
    const v = await p.verifyPayment(req.reference);
    assert.equal(v.state, "paid");
    assert.ok(f.calls[1].url.includes("verify_by_reference?tx_ref=NEO-2026-000042"));
    await assert.rejects(p.createCheckout({ ...req, customer: {} }), /e-mail/);
  });
  test("Paystack : montant en sous-unités, statut success ramené en F CFA", async () => {
    const f = fake([{ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "abc" } }, { status: true, data: { status: "success", amount: 1500000, currency: "XOF", reference: req.reference, channel: "mobile_money" } }]);
    const p = new PaystackProvider({ mode: "test", secretKey: "sk_test_x", fetchImpl: f.impl });
    await p.createCheckout(req);
    assert.equal(JSON.parse(f.calls[0].init.body).amount, 1500000);
    const v = await p.verifyPayment(req.reference);
    assert.deepEqual([v.state, v.amount], ["paid", 15000]);
    assert.equal(p.handleWebhook({ event: "charge.success", data: { reference: req.reference } }).providerTransactionId, req.reference);
  });
});

describe("Stripe, Wave, transfert", () => {
  test("Stripe : XOF sans décimales, session payée", async () => {
    const f = fake([{ id: "cs_test_abcdefgh12", url: "https://checkout.stripe.com/c/pay/cs_test_abcdefgh12" }, { id: "cs_test_abcdefgh12", payment_status: "paid", status: "complete", amount_total: 15000, currency: "xof", metadata: { reference: req.reference } }]);
    const p = new StripeProvider({ mode: "test", secretKey: "sk_test_x", fetchImpl: f.impl });
    const s = await p.createCheckout(req);
    const form = new URLSearchParams(f.calls[0].init.body);
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "15000");
    assert.equal(form.get("line_items[0][price_data][currency]"), "xof");
    const v = await p.verifyPayment(s.providerTransactionId);
    assert.deepEqual([v.state, v.amount, v.currency, v.reference], ["paid", 15000, "XOF", req.reference]);
  });
  test("Wave : session, paiement réussi", async () => {
    const f = fake([{ id: "cos-1abc", wave_launch_url: "https://pay.wave.com/c/cos-1abc" }, { id: "cos-1abc", payment_status: "succeeded", checkout_status: "complete", amount: "15000", currency: "XOF", client_reference: req.reference }]);
    const p = new WaveProvider({ mode: "live", apiKey: "wave_sn_prod_x", fetchImpl: f.impl });
    const s = await p.createCheckout(req);
    assert.equal(JSON.parse(f.calls[0].init.body).amount, "15000");
    const v = await p.verifyPayment(s.providerTransactionId);
    assert.deepEqual([v.state, v.amount, v.reference], ["paid", 15000, req.reference]);
  });
  test("transfert : jamais confirmé automatiquement", async () => {
    const p = new OfflineProvider("live", "https://app.test");
    const s = await p.createCheckout(req);
    assert.equal(s.checkoutUrl, "https://app.test/abonnement/transfert/NEO-2026-000042");
    assert.equal((await p.verifyPayment(s.providerTransactionId)).state, "pending");
    assert.equal(p.handleWebhook({ anything: 1 }).providerTransactionId, null);
  });
  test("statuts refusés / annulés et identifiants malformés", async () => {
    const f = fake([{ code: "00", data: { status: "REFUSED" } }]);
    const p = new CinetPayProvider({ mode: "live", apiKey: "k", siteId: "1", fetchImpl: f.impl });
    assert.equal((await p.verifyPayment(req.reference)).state, "failed");
    const s = new StripeProvider({ mode: "test", secretKey: "sk_test_x", fetchImpl: fake([]).impl });
    await assert.rejects(s.verifyPayment("../../balance"), /invalide/);
  });
});
