// AGRÉGATEUR PERSONNALISÉ — le Super Admin branche un fournisseur inconnu de
// NeoScool (« ZedPay », simulé ici par un petit serveur local qui se comporte
// comme une vraie API : clé exigée, lien de paiement, statut, notification).
// Définition saisie dans le formulaire, test obligatoire avant activation,
// paiement réel de bout en bout (lien → paiement → notification → vérification
// serveur → crédit ajouté), montant falsifié refusé, nouvelle définition =
// nouveau test, suppression = archivage quand il a déjà servi. Rejouable.
//
// Le serveur NeoScool doit tourner avec PAYMENT_CUSTOM_ALLOW_LOCAL=1 (adresse
// locale http autorisée pour ce test uniquement).
import { mkdirSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-agregateur-personnalise";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const CODE = "custom_zedpay_test";
const KEY = "zed_test_KEY_123456";
const PORT = 4555;
const MOCK = `http://127.0.0.1:${PORT}`;

// ---------- Faux agrégateur « ZedPay » ----------
const payments = new Map();
const calls = [];
let tamper = false;
const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, MOCK);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  if (url.pathname.startsWith("/v1/")) {
    calls.push({ method: req.method, path: url.pathname, key: req.headers["x-zed-key"], body: raw });
    if (req.headers["x-zed-key"] !== KEY) return send(401, { error: "bad key" });
  }
  if (req.method === "GET" && url.pathname === "/v1/me") return send(200, { merchant: "NeoScool" });
  if (req.method === "POST" && url.pathname === "/v1/checkout") {
    const b = JSON.parse(raw || "{}");
    if (!Number.isInteger(b.amount) || !b.merchant_ref || !b.return_url || b.merchant_id !== "M-777") return send(422, { error: "invalid" });
    const token = `ZED${payments.size + 1}${Date.now() % 100000}`;
    payments.set(token, { token, amount: b.amount, currency: b.currency, ref: b.merchant_ref, state: "PENDING", returnUrl: b.return_url, notifyUrl: b.notify_url });
    return send(201, { data: { token, pay_url: `${MOCK}/pay/${token}` } });
  }
  const status = url.pathname.match(/^\/v1\/checkout\/([A-Za-z0-9]+)$/);
  if (req.method === "GET" && status) {
    const p = payments.get(status[1]);
    if (!p) return send(404, { error: "not found" });
    return send(200, { data: { state: p.state, total: tamper ? p.amount - 1000 : p.amount, cur: p.currency, merchant_ref: p.ref, channel: "mobile_money" } });
  }
  const page = url.pathname.match(/^\/pay\/([A-Za-z0-9]+)$/);
  if (req.method === "GET" && page) {
    const p = payments.get(page[1]);
    return send(200, `<!doctype html><title>ZedPay</title><h1>ZedPay</h1><p>Montant : ${p?.amount} ${p?.currency}</p><form method="post" action="/pay/${page[1]}/confirm"><button>Payer avec ZedPay</button></form>`, "text/html");
  }
  const confirm = url.pathname.match(/^\/pay\/([A-Za-z0-9]+)\/confirm$/);
  if (req.method === "POST" && confirm) {
    const p = payments.get(confirm[1]);
    p.state = "SUCCESSFUL";
    await fetch(p.notifyUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "payment.updated", payment: { token: p.token, merchant_ref: p.ref, state: "SUCCESSFUL" } }) }).catch(() => {});
    res.writeHead(302, { Location: p.returnUrl });
    return res.end();
  }
  send(404, { error: "unknown" });
});
await new Promise((r) => mock.listen(PORT, "127.0.0.1", r));

// ---------- État initial (restauré à la fin) ----------
const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const savedGateways = (await db.query("select provider, checkout_enabled, is_default from payment_gateway_settings")).rows;
async function cleanup() {
  await db.query("delete from sms_wallet_movements where organization_id = $1", [DEMO]);
  await db.query("delete from sms_wallets where organization_id = $1", [DEMO]);
  await db.query("delete from sms_credit_purchases where organization_id = $1", [DEMO]);
  await db.query("delete from payment_provider_events where provider = $1", [CODE]);
  await db.query("delete from payment_webhooks where provider = $1", [CODE]);
  await db.query("delete from custom_payment_gateways where provider = $1", [CODE]);
  await db.query("delete from payment_gateway_settings where provider = $1", [CODE]);
  await db.query("delete from payment_providers where code = $1", [CODE]);
  await db.query("update platform_sms_pricing set billing_enabled = false, default_price = 25, min_purchase = 100 where id = 1");
}
await cleanup();
await db.query("update payment_gateway_settings set is_default = false, checkout_enabled = false");
await db.query("update platform_sms_pricing set billing_enabled = true, default_price = 25, min_purchase = 100 where id = 1");

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme/);
  return page;
}
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);

try {
  console.log("\n=== 1. Super Admin : ajouter un agrégateur inconnu ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/paiements-en-ligne`);
  await sa.getByRole("link", { name: "Ajouter un agrégateur" }).click();
  await sa.waitForURL(/agregateur$/);
  const ai = sa.getByTestId("custom-gateway-ai");
  check(await ai.isVisible(), "assistant IA proposé pour lire la documentation");
  await ai.getByLabel("Documentation de l'agrégateur").fill("ZedPay API. ".repeat(30));
  await ai.getByRole("button", { name: "Analyser la documentation" }).click();
  await ai.getByRole("status").or(ai.getByRole("alert")).first().waitFor({ timeout: 90000 });
  check((await ai.innerText()).length > 0, `assistant : réponse affichée (${(await ai.getByRole("status").first().innerText().catch(() => "")).slice(0, 90)})`);

  const form = sa.getByTestId("custom-gateway-form");
  await form.getByLabel("Nom de l'agrégateur *").fill("ZedPay Test");
  await form.getByLabel("Description (moyens de paiement, pays)").fill("Mobile Money (test local)");
  await form.getByLabel("Adresse en mode test (sandbox)").fill(`${MOCK}/v1`);
  await form.getByLabel("Adresse en mode réel").fill(`${MOCK}/v1`);
  await form.getByLabel("Clés secrètes 1 : clé").fill("api_key");
  await form.getByLabel("Clés secrètes 1 : libellé").fill("Clé API ZedPay");
  await form.locator("#cg-add-public").click();
  await form.getByLabel("Identifiants non secrets 1 : clé").fill("merchant_id");
  await form.getByLabel("Identifiants non secrets 1 : libellé").fill("Identifiant marchand");
  await form.getByLabel("Type").selectOption("header");
  await form.getByLabel("Nom de l'en-tête").fill("X-ZED-KEY");
  await form.getByLabel("Clé utilisée").selectOption("api_key");
  await form.locator("#cg-create-path").fill("/checkout");
  await form.getByLabel("Corps de la requête (JSON)").fill(JSON.stringify({ amount: "{{amount}}", currency: "{{currency}}", merchant_ref: "{{reference}}", merchant_id: "{{config.merchant_id}}", return_url: "{{return_url}}", notify_url: "{{callback_url}}", customer: { email: "{{customer_email}}" } }, null, 2));
  await form.getByLabel("Chemin du lien de paiement dans la réponse").fill("data.pay_url");
  await form.getByLabel("Chemin de l'identifiant dans la réponse").fill("data.token");
  await form.locator("#cg-verify-method").selectOption("GET");
  await form.locator("#cg-verify-path").fill("/checkout/{{transaction_id}}");
  await form.locator("#cg-verify-format").selectOption("none");
  await form.getByLabel("Chemin du statut *").fill("data.state");
  await form.getByLabel("Chemin du montant").fill("data.total");
  await form.getByLabel("Chemin de la devise").fill("data.cur");
  await form.locator("#cg-verify-res-reference").fill("data.merchant_ref");
  await form.getByLabel("Chemin du moyen de paiement").fill("data.channel");
  await form.getByLabel("Payé *").fill("SUCCESSFUL");
  await form.getByLabel("Échoué").fill("FAILED");
  await form.getByLabel("Annulé / expiré").fill("CANCELLED, EXPIRED");
  await form.getByLabel("Chemin de l'identifiant du paiement").fill("payment.token");
  await form.locator("#cg-hook-ref").fill("payment.merchant_ref");
  await form.getByLabel("Définir un appel de vérification").check();
  await form.locator("#cg-check-path").fill("/me");
  await form.locator("#cg-check-format").selectOption("none");
  await sa.screenshot({ path: `${out}/01-formulaire.png`, fullPage: true });
  await form.getByRole("button", { name: "Enregistrer l'agrégateur" }).click();
  await sa.waitForURL(/paiements-en-ligne\?agregateur=custom_zedpay_test/, { timeout: 20000 });
  const def = await q1("select c.definition, p.name, p.is_active from custom_payment_gateways c join payment_providers p on p.code = c.provider where c.provider = $1", [CODE]);
  check(def?.name === "ZedPay Test" && def.definition.auth.name === "X-ZED-KEY" && def.definition.verify.response.status === "data.state", "définition enregistrée en base (code custom_zedpay_test)");
  check(!JSON.stringify(def?.definition).includes(KEY), "aucune clé dans la définition");

  console.log("\n=== 2. Clés, test obligatoire, activation ===");
  const card = sa.getByTestId(`gateway-${CODE}`);
  check(await card.getByText("Ajouté par vous").isVisible(), "fiche de l'agrégateur dans la liste");
  check((await card.locator("input[readonly]").inputValue()).endsWith(`/api/webhooks/payments/${CODE}`), "adresse de notification à copier chez l'agrégateur");
  await card.getByLabel(/Identifiant marchand/).fill("M-777");
  await card.getByLabel(/Clé API ZedPay/).fill(KEY);
  await card.getByLabel("Proposer aux clients").check();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  check(await toast(sa, /Testez d'abord cet agrégateur/), "activation refusée tant que le test n'a pas réussi");
  await card.getByLabel("Proposer aux clients").uncheck();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await card.getByText("Configuré, non proposé").waitFor({ timeout: 20000 });
  const stored = await q1("select secret_ciphertext, config from payment_gateway_settings where provider = $1", [CODE]);
  check(stored.secret_ciphertext?.startsWith("v1:") && !stored.secret_ciphertext.includes(KEY) && stored.config.merchant_id === "M-777", "clé chiffrée, identifiant marchand enregistré");
  await card.getByRole("button", { name: "Tester" }).click();
  await card.getByText(/Test réussi/).waitFor({ timeout: 30000 });
  check(calls.some((c) => c.path === "/v1/me") && calls.some((c) => c.path === "/v1/checkout" && c.method === "POST") && calls.some((c) => c.path.startsWith("/v1/checkout/")), "test : clés vérifiées, paiement d'essai créé puis vérifié");
  check(calls.every((c) => c.key === KEY), "clé transmise dans l'en-tête X-ZED-KEY");
  await card.getByLabel("Proposer aux clients").check();
  await card.getByLabel("Passerelle par défaut").check();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await card.getByText("Proposé aux clients · test").waitFor({ timeout: 20000 });
  check(true, "agrégateur proposé aux clients après test réussi (par défaut)");
  await sa.screenshot({ path: `${out}/02-fiche-agregateur.png`, fullPage: true });

  console.log("\n=== 3. Établissement : paiement réel par ZedPay ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/communication/credit-sms`);
  await admin.getByLabel("Nombre de SMS").fill("200");
  await admin.getByRole("button", { name: /Payer et ajouter 200 SMS/ }).click();
  await admin.waitForURL(/127\.0\.0\.1:4555\/pay\//, { timeout: 30000 });
  check((await admin.locator("body").innerText()).includes("5000 XOF"), "page de paiement ZedPay : 200 × 25 = 5000 XOF");
  await admin.screenshot({ path: `${out}/03-page-zedpay.png` });
  await admin.getByRole("button", { name: "Payer avec ZedPay" }).click();
  await admin.getByTestId("sms-payment-result").waitFor({ timeout: 30000 });
  check((await admin.getByTestId("sms-payment-result").innerText()).includes("200 SMS ajoutés"), "retour : crédit ajouté après vérification serveur");
  const purchase = await q1("select status, provider, amount, currency from sms_credit_purchases where organization_id = $1 order by created_at desc limit 1", [DEMO]);
  check(purchase?.status === "SUCCESS" && purchase.provider === CODE && purchase.amount === 5000, "achat payé via l'agrégateur personnalisé (5 000 F)");
  check((await q1("select balance from sms_wallets where organization_id = $1", [DEMO]))?.balance === 200, "crédit de 200 SMS");
  const hook = await q1("select processing_status from payment_webhooks where provider = $1 order by received_at desc limit 1", [CODE]);
  check(["processed", "duplicate"].includes(hook?.processing_status), `notification reçue et traitée (${hook?.processing_status})`);

  console.log("\n=== 4. Montant falsifié par le fournisseur : refusé ===");
  tamper = true;
  await admin.goto(`${base}/communication/credit-sms`);
  await admin.getByLabel("Nombre de SMS").fill("100");
  await admin.getByRole("button", { name: /Payer et ajouter 100 SMS/ }).click();
  await admin.waitForURL(/127\.0\.0\.1:4555\/pay\//, { timeout: 30000 });
  await admin.getByRole("button", { name: "Payer avec ZedPay" }).click();
  await admin.getByTestId("sms-payment-result").waitFor({ timeout: 30000 });
  tamper = false;
  const second = await q1("select status from sms_credit_purchases where organization_id = $1 and sms_count = 100 order by created_at desc limit 1", [DEMO]);
  check(second?.status !== "SUCCESS", `montant différent : aucun crédit (${second?.status})`);
  check((await q1("select balance from sms_wallets where organization_id = $1", [DEMO]))?.balance === 200, "crédit inchangé (200 SMS)");

  console.log("\n=== 5. Définition modifiée : nouveau test obligatoire ===");
  await sa.goto(`${base}/plateforme/paiements-en-ligne/agregateur/${CODE}`);
  await sa.getByLabel("Annulé / expiré").fill("CANCELLED, EXPIRED, ABANDONED");
  await sa.getByRole("button", { name: "Enregistrer l'agrégateur" }).click();
  await sa.waitForURL(/paiements-en-ligne\?agregateur=/, { timeout: 20000 });
  const after = await q1("select checkout_enabled, is_default, last_test_ok from payment_gateway_settings where provider = $1", [CODE]);
  check(!after.checkout_enabled && !after.is_default && after.last_test_ok === null, "retiré des moyens proposés jusqu'au prochain test");

  console.log("\n=== 6. Suppression : archivé (paiements conservés) ===");
  await sa.getByTestId(`gateway-${CODE}`).getByRole("button", { name: "Supprimer" }).click();
  check(await toast(sa, "Agrégateur archivé"), "déjà utilisé : archivé plutôt que supprimé");
  const archived = await q1("select is_active from payment_providers where code = $1", [CODE]);
  check(archived?.is_active === false && Number((await q1("select count(*) n from sms_credit_purchases where provider = $1", [CODE])).n) >= 1, "historique des paiements conservé");
  await sa.reload();
  check(await sa.getByTestId(`gateway-${CODE}`).getByText("Archivé").isVisible(), "fiche marquée « Archivé »");
  await sa.screenshot({ path: `${out}/04-archive.png`, fullPage: true });
} catch (e) {
  problems.push(`Exception : ${e.message}`);
  console.log(e);
} finally {
  await cleanup();
  for (const g of savedGateways) await db.query("update payment_gateway_settings set checkout_enabled = $2, is_default = $3 where provider = $1", [g.provider, g.checkout_enabled, g.is_default]);
  await db.end();
  await browser.close();
  mock.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
