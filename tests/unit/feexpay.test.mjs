// Connecteur FeexPay (abonnements) : page NeoScool, demande au téléphone, vérification
// serveur des seules références enregistrées, secret jamais exposé, notifications = signal.
// Exécution : node --test tests/unit/*.test.mjs (Node ≥ 22.18 : TypeScript natif).
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

const { FeexPayProvider, FEEXPAY_BASE_URL } = await import("../../src/lib/payments/feexpay.ts");
const { feexpayNetwork, feexpayPhone } = await import("../../src/lib/payments/feexpay-networks.ts");

const KEY = "fp_live_SECRET_123";
function fake(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const [status, json] = Array.isArray(next) ? next : [200, next];
    return { status, text: async () => JSON.stringify(json) };
  };
  return { impl, calls };
}
const store = (map) => ({ requestsFor: async (ref) => map[ref] ?? [] });
const provider = (f, map = {}) => new FeexPayProvider({ mode: "live", shopId: "shop_123", apiKey: KEY, siteUrl: "https://app.test", store: store(map), fetchImpl: f.impl });
const req = {
  reference: "NEO-2026-000042",
  amount: 15000,
  currency: "XOF",
  description: "Abonnement",
  itemName: "x",
  storeName: "NeoScool",
  returnUrl: "https://app.test/r",
  cancelUrl: "https://app.test/c",
  callbackUrl: "https://app.test/api/webhooks/payments/feexpay",
  customData: {},
};

describe("FeexPay", () => {
  test("paiement commencé sur une page NeoScool (aucun appel à FeexPay, suivi par la référence NeoScool)", async () => {
    const f = fake([]);
    const session = await provider(f).createCheckout(req);
    assert.equal(session.checkoutUrl, "https://app.test/paiement/feexpay/NEO-2026-000042");
    assert.equal(session.providerTransactionId, "NEO-2026-000042");
    assert.equal(f.calls.length, 0);
  });

  test("demande au téléphone : URL v2, clé dans l'en-tête seulement, réseau et numéro transmis", async () => {
    const f = fake([{ reference: "fx-ref-0001", status: "PENDING" }]);
    const r = await provider(f).requestToPay({ reference: req.reference, amount: 15000, phone: "2290162056295", network: "MTN", name: "Awa", email: "a@b.c", description: "NeoScool abonnement" });
    assert.deepEqual(r, { feexpayReference: "fx-ref-0001", state: "pending" });
    const call = f.calls[0];
    assert.equal(call.url, `${FEEXPAY_BASE_URL}/api/transactions/requesttopay/integration`);
    assert.equal(call.init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(call.body.shop, "shop_123");
    assert.equal(call.body.reseau, "MTN");
    assert.equal(call.body.phoneNumber, "2290162056295");
    assert.equal(call.body.amount, 15000);
    assert.deepEqual(call.body.callback_info, { reference: req.reference });
    assert.ok(!JSON.stringify(call.body).includes(KEY), "la clé n'est jamais dans le corps");
  });

  test("demande refusée : message clair, aucune clé dans l'erreur", async () => {
    const f = fake([[400, { message: "Solde insuffisant", status: "FAILED" }]]);
    await assert.rejects(
      () => provider(f).requestToPay({ reference: req.reference, amount: 15000, phone: "22997000000", network: "MOOV", name: "A", email: "", description: "x" }),
      (e) => e.message === "Solde insuffisant" && !JSON.stringify(e).includes(KEY),
    );
  });

  test("vérification : aucune demande enregistrée → en attente (rien n'est confirmé)", async () => {
    const f = fake([]);
    const v = await provider(f).verifyPayment(req.reference);
    assert.equal(v.state, "pending");
    assert.equal(f.calls.length, 0);
  });

  test("vérification : une demande réussie parmi plusieurs → payé, montant FeexPay", async () => {
    const f = fake([{ status: "FAILED", amount: 15000, reference: "fx-ref-a" }, { status: "SUCCESSFUL", amount: 15000, reference: "fx-ref-b" }]);
    const v = await provider(f, { [req.reference]: ["fx-ref-a", "fx-ref-b"] }).verifyPayment(req.reference);
    assert.equal(v.state, "paid");
    assert.equal(v.amount, 15000);
    assert.equal(v.currency, "XOF");
    assert.ok(f.calls.every((c) => c.url.startsWith(`${FEEXPAY_BASE_URL}/api/transactions/public/single/status/fx-`)));
  });

  test("demande refusée : le paiement reste ouvert (le payeur peut réessayer)", async () => {
    const f = fake([{ status: "FAILED", amount: 15000 }, { status: "FAILED", amount: 15000 }]);
    const p = provider(f, { [req.reference]: ["fx-ref-a"] });
    assert.equal((await p.verifyPayment(req.reference)).state, "pending");
    assert.equal(await p.latestAttempt(req.reference), "failed");
  });

  test("notification : seulement un signal (référence NeoScool), jamais un statut", () => {
    const p = provider(fake([]));
    assert.deepEqual(p.handleWebhook({ reference: "fx-1", status: "SUCCESSFUL", callback_info: { reference: req.reference } }), { providerTransactionId: req.reference, reference: req.reference });
    assert.deepEqual(p.handleWebhook({ reference: "fx-1", status: "SUCCESSFUL" }), { providerTransactionId: null, reference: null });
  });

  test("clés : boutique vérifiée, refus 401 explicite", async () => {
    assert.equal((await provider(fake([{ name: "NeoScool" }])).checkCredentials()).ok, true);
    assert.deepEqual(await provider(fake([[401, {}]])).checkCredentials(), { ok: false, error: "FeexPay refuse la clé API." });
  });

  test("configuration : identifiant de boutique sûr exigé", () => {
    assert.throws(() => new FeexPayProvider({ mode: "live", shopId: "../x", apiKey: KEY, siteUrl: "", store: store({}) }));
    assert.throws(() => new FeexPayProvider({ mode: "live", shopId: "shop", apiKey: "", siteUrl: "", store: store({}) }));
  });

  test("réseaux et numéros", () => {
    assert.equal(feexpayNetwork("BJ", "CELTIIS BJ")?.network.label, "Celtiis Cash");
    assert.equal(feexpayNetwork("BJ", "ORANGE CI"), null);
    assert.equal(feexpayPhone("229", "01 62 05 62 95"), "2290162056295");
    assert.equal(feexpayPhone("229", "+229 97 00 00 00"), "22997000000");
    assert.equal(feexpayPhone("229", "12"), null);
  });
});
