// Fournisseurs de paiement (PayDunya, simulation) et protection des secrets.
// Exécution : node --test tests/unit/*.test.mjs (Node ≥ 22.18 : TypeScript natif).
import { register } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Résolution des imports relatifs sans extension (« ./types » → « ./types.ts »).
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

const { PayDunyaProvider, PAYDUNYA_BASE_URLS } = await import("../../src/lib/payments/paydunya.ts");
const { SimulationProvider } = await import("../../src/lib/payments/simulation.ts");

const KEYS = { masterKey: "MASTER-secret-1", privateKey: "PRIVATE-secret-2", token: "TOKEN-secret-3" };
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { status: 200, text: async () => JSON.stringify(next) };
  };
  return { impl, calls };
}
const request = {
  reference: "NEO-2026-000042",
  amount: 126000,
  currency: "XOF",
  description: "Abonnement NéoScol Collège & Lycée — annuel",
  itemName: "NéoScol Collège & Lycée (12 mois)",
  storeName: "NéoScol",
  returnUrl: "https://app.test/abonnement/retour?ref=NEO-2026-000042",
  cancelUrl: "https://app.test/abonnement/retour?ref=NEO-2026-000042&annule=1",
  callbackUrl: "https://app.test/api/webhooks/payments/paydunya",
  customData: { organization_id: "org-1", invoice_number: "NSC-2026-000007" },
};

describe("PayDunya", () => {
  test("mode test → bac à sable ; en-têtes officiels ; corps de la facture ; URL de paiement et jeton", async () => {
    const { impl, calls } = fakeFetch([{ response_code: "00", response_text: "https://paydunya.com/sandbox-checkout/invoice/test_abc", token: "test_abc" }]);
    const provider = new PayDunyaProvider({ mode: "test", ...KEYS, fetchImpl: impl });
    const session = await provider.createCheckout(request);
    assert.equal(calls[0].url, `${PAYDUNYA_BASE_URLS.test}/checkout-invoice/create`);
    assert.equal(PAYDUNYA_BASE_URLS.test, "https://app.paydunya.com/sandbox-api/v1");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(
      [calls[0].init.headers["PAYDUNYA-MASTER-KEY"], calls[0].init.headers["PAYDUNYA-PRIVATE-KEY"], calls[0].init.headers["PAYDUNYA-TOKEN"]],
      [KEYS.masterKey, KEYS.privateKey, KEYS.token],
    );
    assert.equal(calls[0].body.invoice.total_amount, 126000);
    assert.equal(calls[0].body.store.name, "NéoScol");
    assert.equal(calls[0].body.actions.callback_url, request.callbackUrl);
    assert.equal(calls[0].body.custom_data.reference, "NEO-2026-000042");
    assert.deepEqual(session, { providerTransactionId: "test_abc", checkoutUrl: "https://paydunya.com/sandbox-checkout/invoice/test_abc", raw: { response_code: "00", token: "test_abc", description: null } });
  });

  test("mode live → API de production", async () => {
    const { impl, calls } = fakeFetch([{ response_code: "00", response_text: "https://paydunya.com/checkout/invoice/x", token: "live_x" }]);
    await new PayDunyaProvider({ mode: "live", ...KEYS, fetchImpl: impl }).createCheckout(request);
    assert.equal(calls[0].url, "https://app.paydunya.com/api/v1/checkout-invoice/create");
  });

  test("statut vérifié par confirm/{token} : completed / pending / cancelled / fail", async () => {
    const { impl, calls } = fakeFetch([
      { response_code: "00", status: "completed", invoice: { total_amount: "126000" }, custom_data: { reference: "NEO-2026-000042" }, receipt_url: "https://r" },
      { response_code: "00", status: "pending", invoice: { total_amount: 126000 } },
      { response_code: "00", status: "cancelled", invoice: { total_amount: 126000 } },
      { response_code: "00", status: "fail", invoice: { total_amount: 126000 } },
    ]);
    const provider = new PayDunyaProvider({ mode: "test", ...KEYS, fetchImpl: impl });
    const paid = await provider.verifyPayment("test_abc");
    assert.equal(calls[0].url, `${PAYDUNYA_BASE_URLS.test}/checkout-invoice/confirm/test_abc`);
    assert.equal(calls[0].init.method, "GET");
    assert.deepEqual([paid.state, paid.amount, paid.currency, paid.reference], ["paid", 126000, "XOF", "NEO-2026-000042"]);
    assert.equal((await provider.verifyPayment("test_abc")).state, "pending");
    assert.equal((await provider.verifyPayment("test_abc")).state, "cancelled");
    assert.equal((await provider.verifyPayment("test_abc")).state, "failed");
  });

  test("webhook : seul l'identifiant est extrait (JSON ou formulaire) ; le statut du corps est ignoré", () => {
    const provider = new PayDunyaProvider({ mode: "test", ...KEYS });
    assert.equal(provider.handleWebhook({ data: { invoice: { token: "tok_123" }, status: "completed" } }).providerTransactionId, "tok_123");
    assert.equal(provider.handleWebhook({ "data[invoice][token]": "tok_456", "data[status]": "completed" }).providerTransactionId, "tok_456");
    assert.equal(provider.handleWebhook({ data: { invoice: { token: "../../x" } } }).providerTransactionId, null);
    assert.equal(provider.handleWebhook({ status: "completed" }).providerTransactionId, null);
    assert.equal("state" in provider.handleWebhook({ data: { invoice: { token: "tok_1" } } }), false, "aucun statut déduit du webhook");
  });

  test("erreurs : clés absentes refusées ; aucune clé dans les messages ; remboursement non documenté", async () => {
    assert.throws(() => new PayDunyaProvider({ mode: "test", masterKey: "", privateKey: "", token: "" }), /incomplète/);
    const { impl } = fakeFetch([new Error("ECONNRESET"), { response_code: "1001", response_text: "Invalid Masterkey Specified" }]);
    const provider = new PayDunyaProvider({ mode: "test", ...KEYS, fetchImpl: impl });
    for (let i = 0; i < 2; i++) {
      const error = await provider.createCheckout(request).then(() => null, (e) => e);
      assert.ok(error, "erreur attendue");
      const dump = JSON.stringify({ message: error.message, details: error.details });
      for (const secret of Object.values(KEYS)) assert.ok(!dump.includes(secret), "aucun secret exposé");
    }
    assert.equal((await provider.refundPayment()).supported, false);
    await assert.rejects(provider.createCheckout({ ...request, amount: 100.5 }), /Montant invalide/);
  });
});

describe("Paiement simulé (mode test)", () => {
  test("l'état « fournisseur » vient du stockage serveur ; en attente tant qu'aucune issue n'est enregistrée", async () => {
    const store = new Map();
    const provider = new SimulationProvider("http://localhost:3000/", { getOutcome: async (ref) => store.get(ref) ?? null });
    const session = await provider.createCheckout(request);
    assert.equal(session.checkoutUrl, "http://localhost:3000/abonnement/paiement-simule/NEO-2026-000042");
    assert.equal((await provider.verifyPayment(session.providerTransactionId)).state, "pending");
    store.set("NEO-2026-000042", { outcome: "completed", amount: 126000 });
    const v = await provider.verifyPayment(session.providerTransactionId);
    assert.deepEqual([v.state, v.amount, v.currency], ["paid", 126000, "XOF"]);
    assert.equal(provider.mode, "test");
  });
});

describe("Protection des secrets", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(path);
    }
  };
  walk("src");

  test("aucune clé de paiement exposée au navigateur (NEXT_PUBLIC_) ni écrite en dur", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.ok(!/NEXT_PUBLIC_(PAYDUNYA|PAYMENT)/.test(source), `${file} : variable de paiement publique interdite`);
      assert.ok(!/PAYDUNYA-(MASTER|PRIVATE)-KEY["']?\s*:\s*["'][^"']+["']/.test(source), `${file} : clé écrite en dur`);
    }
  });

  test("la configuration des paiements est « server-only » et n'est importée par aucun composant client", () => {
    assert.match(readFileSync("src/lib/payments/config.ts", "utf8"), /^import "server-only";/);
    assert.match(readFileSync("src/features/billing/server.ts", "utf8"), /^import "server-only";/);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/^["']use client["']/.test(source)) {
        assert.ok(!/@\/lib\/payments\/(config|paydunya)|@\/features\/billing\/server/.test(source), `${file} : import serveur dans un composant client`);
      }
    }
  });

  test(".env.example ne contient aucune valeur de clé ; .env.local est ignoré par Git", () => {
    const example = readFileSync(".env.example", "utf8");
    for (const key of ["PAYDUNYA_MASTER_KEY", "PAYDUNYA_PRIVATE_KEY", "PAYDUNYA_PUBLIC_KEY", "PAYDUNYA_TOKEN", "PAYMENT_WEBHOOK_SECRET"]) {
      assert.match(example, new RegExp(`^${key}=$`, "m"), `${key} doit rester vide`);
    }
    assert.match(readFileSync(".gitignore", "utf8"), /\.env\*?\.local|\.env\*/);
  });
});
