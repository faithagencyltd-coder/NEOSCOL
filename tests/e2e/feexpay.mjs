// FEEXPAY — abonnements des établissements et des enseignants, avec un FAUX FeexPay local
// (aucun argent réel) : réglage Super Admin (clés chiffrées, test de la boutique), page de
// paiement NeoScool (réseau + numéro), refus puis nouvel essai, confirmation uniquement
// après vérification serveur, notification forgée sans effet.
//
// Le serveur NeoScool doit être lancé avec FEEXPAY_API_BASE=http://127.0.0.1:4599 et
// PAYMENT_ALLOW_SIMULATION=1 (sinon l'adresse du faux FeexPay est ignorée).
//   BASE_URL=http://localhost:3000 DATABASE_URL=… CHROMIUM_PATH=… node tests/e2e/feexpay.mjs
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-feexpay";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];

// ---- Faux FeexPay -----------------------------------------------------------
const API_KEY = "fp_live_E2E_SECRET_KEY";
const SHOP = "shop_e2e_01";
const fx = new Map();
const received = [];
let n = 0;
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.headers.authorization !== `Bearer ${API_KEY}`) return send(401, { message: "Unauthorized" });
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === `/api/shop/${SHOP}/get_shop`) return send(200, { name: "Boutique E2E", id: SHOP });
    if (req.method === "POST" && url.pathname === "/api/transactions/requesttopay/integration") {
      const body = JSON.parse(raw || "{}");
      received.push(body);
      if (body.shop !== SHOP) return send(400, { message: "Boutique inconnue", status: "FAILED" });
      const reference = `fx-e2e-${++n}-${Date.now()}`;
      fx.set(reference, { amount: body.amount, fail: String(body.phoneNumber).endsWith("0000"), polls: 0 });
      return send(200, { reference, status: "PENDING" });
    }
    const m = url.pathname.match(/^\/api\/transactions\/public\/single\/status\/(.+)$/);
    if (req.method === "GET" && m) {
      const t = fx.get(decodeURIComponent(m[1]));
      if (!t) return send(404, { message: "Not found" });
      t.polls += 1;
      return send(200, { reference: m[1], amount: t.amount, status: t.fail ? "FAILED" : t.polls >= 2 ? "SUCCESSFUL" : "PENDING", phoneNumber: "229xxxx" });
    }
    send(404, { message: "Not found" });
  });
});
await new Promise((r) => server.listen(4599, "127.0.0.1", r));

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}

async function payOnPage(page, phone, { expectFail = false } = {}) {
  await page.getByLabel("Pays").selectOption("BJ");
  await page.getByLabel("Réseau Mobile Money").selectOption("MTN");
  await page.getByLabel("Numéro Mobile Money").fill(phone);
  await page.getByRole("button", { name: /Payer avec FeexPay|Réessayer le paiement/ }).click();
  await page.getByTestId("feexpay-waiting").waitFor({ timeout: 30000 });
  if (expectFail) return page.getByTestId("feexpay-failed").waitFor({ timeout: 30000 }).then(() => true, () => false);
  return page.getByTestId("feexpay-paid").waitFor({ timeout: 40000 }).then(() => true, () => false);
}

const TEACHER_EMAIL = "enseignant@demo.neoscol.app";
const teacherId = (await q1("select id from profiles where email = $1", [TEACHER_EMAIL])).id;
const savedSub = await q1("select status, period_start, period_end from teacher_subscriptions where user_id = $1", [teacherId]);
const savedRule = await q1("select enabled, price, period_months from platform_teacher_access_settings");

try {
  console.log("\n=== 1. Super Admin : réglage FeexPay ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/paiements-en-ligne`);
  const card = sa.getByTestId("gateway-feexpay");
  check(await card.isVisible(), "FeexPay dans la liste des agrégateurs");
  check((await card.locator("input[readonly]").inputValue()).endsWith("/api/webhooks/payments/feexpay"), "adresse de notification FeexPay à copier");
  await card.getByLabel(/Identifiant de la boutique/).fill(SHOP);
  await card.getByLabel(/Clé API/).fill(API_KEY);
  await card.getByLabel("Mode").selectOption("live");
  await card.getByLabel("Proposer aux clients").check();
  await card.getByLabel("Passerelle par défaut").check();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await card.getByText("Proposé aux clients · réel").waitFor({ timeout: 15000 });
  const row = await q1("select secret_ciphertext, config, checkout_enabled from payment_gateway_settings where provider = 'feexpay'");
  check(row.secret_ciphertext?.startsWith("v1:") && !row.secret_ciphertext.includes("E2E_SECRET"), "clé FeexPay chiffrée (jamais en clair)");
  check(row.config.shop_id === SHOP && row.checkout_enabled, "boutique enregistrée, proposée aux clients");
  await card.getByRole("button", { name: "Tester" }).click();
  check(await card.getByText(/Boutique FeexPay « Boutique E2E » trouvée/).first().waitFor({ timeout: 15000 }).then(() => true, () => false), "test de la boutique réussi");
  check(!(await sa.content()).includes(API_KEY), "clé jamais renvoyée au navigateur");
  await sa.screenshot({ path: `${out}/01-super-admin.png`, fullPage: true });

  console.log("\n=== 2. Établissement : abonnement payé avec FeexPay ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/abonnement/souscrire`);
  for (let i = 0; i < 4; i++) await admin.getByRole("button", { name: "Continuer", exact: true }).click();
  await admin.getByRole("button", { name: /^Payer mon abonnement/ }).click();
  await admin.waitForURL(/paiement\/feexpay\/NEO-/, { timeout: 30000 });
  const reference = admin.url().split("/").pop();
  const tx = await q1("select amount, status from payment_transactions where internal_reference = $1", [reference]);
  check(["PENDING", "PROCESSING"].includes(tx.status), `page de paiement FeexPay (${reference})`);
  await admin.screenshot({ path: `${out}/02-page-paiement.png`, fullPage: true });

  // Notification forgée : jamais une preuve (aucune demande enregistrée par le serveur).
  await fetch(`${base}/api/webhooks/payments/feexpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: "fx-forged-000001", status: "SUCCESSFUL", amount: tx.amount, callback_info: { reference } }),
  });
  check((await q1("select status from payment_transactions where internal_reference = $1", [reference])).status === tx.status, "notification forgée sans effet");

  check(await payOnPage(admin, "97000000", { expectFail: true }), "paiement refusé sur le téléphone : message, nouvel essai possible");
  check((await q1("select status from payment_transactions where internal_reference = $1", [reference])).status === tx.status, "refus : le paiement reste ouvert");
  await admin.screenshot({ path: `${out}/03-refuse.png`, fullPage: true });
  check(await payOnPage(admin, "01 62 05 62 95"), "deuxième essai : paiement confirmé après vérification serveur");
  await admin.waitForURL(/abonnement\/retour/, { timeout: 20000 });
  const last = received.at(-1);
  check(last.amount === tx.amount && last.reseau === "MTN" && last.phoneNumber === "2290162056295", `montant lu en base (${tx.amount}), réseau et numéro transmis`);
  const after = await q1("select status from payment_transactions where internal_reference = $1", [reference]);
  const sub = await q1("select s.status from subscriptions s join organizations o on o.id = s.organization_id where o.slug = 'demo'");
  check(after.status === "SUCCESS" && sub.status === "ACTIVE", "facture payée, abonnement actif");
  const reqs = await q1("select count(*)::int as n, bool_and(phone_last4 ~ '^[0-9]{4}$') as masked from feexpay_requests where internal_reference = $1", [reference]);
  check(reqs.n === 2 && reqs.masked, "2 demandes enregistrées (4 derniers chiffres seulement)");
  await admin.screenshot({ path: `${out}/04-confirme.png`, fullPage: true });

  console.log("\n=== 3. Enseignant : abonnement multi-établissements payé avec FeexPay ===");
  await db.query("update platform_teacher_access_settings set enabled = true, price = 5000, period_months = 1");
  // Abonnement enseignant expiré : un nouveau paiement est demandé.
  await db.query("update teacher_subscriptions set status = 'active', period_start = current_date - 60, period_end = current_date - 30 where user_id = $1", [teacherId]);
  const teacher = await login(TEACHER_EMAIL);
  await teacher.goto(`${base}/mes-etablissements`);
  await teacher.getByTestId("subscription-card").getByRole("button", { name: /Payer l'abonnement/ }).click();
  await teacher.getByRole("dialog").getByRole("button", { name: "Continuer vers le paiement" }).click();
  await teacher.waitForURL(/paiement\/feexpay\/NEO-/, { timeout: 30000 });
  const tRef = teacher.url().split("/").pop();
  check((await teacher.getByTestId("feexpay-amount").innerText()).replace(/\D/g, "") === "5000", "page FeexPay de l'enseignant (5 000 F CFA)");
  // Un autre compte ne voit pas ce paiement.
  const other = await admin.goto(`${base}/paiement/feexpay/${tRef}`);
  check(other.status() === 404, "paiement de l'enseignant invisible pour un autre compte");
  check(await payOnPage(teacher, "0162056295"), "paiement de l'enseignant confirmé");
  await teacher.waitForURL(/mes-etablissements\/retour/, { timeout: 20000 });
  check(await teacher.getByRole("heading", { name: "Paiement confirmé" }).isVisible(), "retour : accès activé");
  const pay = await q1("select status, amount from teacher_access_payments where internal_reference = $1", [tRef]);
  check(pay.status === "SUCCESS" && pay.amount === 5000, "paiement enseignant enregistré (vérifié côté serveur)");
  await teacher.screenshot({ path: `${out}/05-enseignant-confirme.png`, fullPage: true });
} finally {
  await db.query("update payment_gateway_settings set checkout_enabled = false, is_default = false where provider = 'feexpay'");
  if (savedRule) await db.query("update platform_teacher_access_settings set enabled = $1, price = $2, period_months = $3", [savedRule.enabled, savedRule.price, savedRule.period_months]);
  if (savedSub) await db.query("update teacher_subscriptions set status = $2, period_start = $3, period_end = $4 where user_id = $1", [teacherId, savedSub.status, savedSub.period_start, savedSub.period_end]);
  server.close();
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est OK.");
process.exit(problems.length ? 1 : 0);
