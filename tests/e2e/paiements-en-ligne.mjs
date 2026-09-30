// PAIEMENTS EN LIGNE — Super Admin : passerelles réglables sans code (clés chiffrées,
// test, adresse de notification) ; paiement par transfert : déclaration par
// l'établissement puis validation par le Super Admin → abonnement actif.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=… CHROMIUM_PATH=… node tests/e2e/paiements-en-ligne.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-paiements-en-ligne";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement/);
  return page;
}
const INSTRUCTIONS = "Orange Money : +229 01 02 03 04 (NeoScool)\nVirement : IBAN BJ00 1234 5678";

try {
  console.log("\n=== 1. Super Admin : passerelles ===");
  let sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/paiements-en-ligne`);
  for (const code of ["paydunya", "cinetpay", "fedapay", "flutterwave", "paystack", "stripe", "wave", "offline"]) {
    check(await sa.getByTestId(`gateway-${code}`).isVisible(), `fiche ${code}`);
  }
  const feda = sa.getByTestId("gateway-fedapay");
  check((await feda.locator("input[readonly]").inputValue()).endsWith("/api/webhooks/payments/fedapay"), "adresse de notification FedaPay à copier");
  await feda.getByLabel(/Clé secrète/).fill("sk_sandbox_E2E_SECRET_123");
  await feda.getByRole("button", { name: "Enregistrer" }).click();
  await feda.getByText("Configuré, non proposé").waitFor({ timeout: 15000 });
  const row = await q1("select secret_ciphertext, secret_hint, checkout_enabled from payment_gateway_settings where provider = 'fedapay'");
  check(row.secret_ciphertext?.startsWith("v1:") && !row.secret_ciphertext.includes("E2E_SECRET"), "clé FedaPay chiffrée (jamais en clair)");
  check(row.secret_hint === "••_123" && !row.checkout_enabled, "indice seul affiché, passerelle non proposée");
  await feda.getByRole("button", { name: "Tester" }).click();
  await feda.locator("[role=status]").filter({ hasNotText: "Jamais testé" }).waitFor({ timeout: 30000 });
  check(true, "test FedaPay effectué (résultat enregistré, sans planter)");

  const off = sa.getByTestId("gateway-offline");
  await off.getByLabel("Instructions affichées au client *").fill(INSTRUCTIONS);
  await off.getByLabel("Mode").selectOption("live");
  await off.getByLabel("Proposer aux clients").check();
  await off.getByLabel("Passerelle par défaut").check();
  await off.getByRole("button", { name: "Enregistrer" }).click();
  await off.getByText("Proposé aux clients · réel").waitFor({ timeout: 15000 });
  check(true, "paiement par transfert proposé aux clients (mode réel, par défaut)");
  await sa.screenshot({ path: `${out}/01-passerelles.png`, fullPage: true });

  console.log("\n=== 2. Établissement : paiement par transfert ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/abonnement/souscrire`);
  for (let i = 0; i < 4; i++) await admin.getByRole("button", { name: "Continuer", exact: true }).click();
  const options = admin.getByTestId("payment-options");
  check((await options.innerText()).includes("Paiement par transfert"), "moyen de paiement proposé au client");
  check((await options.innerText()).includes("Orange Money : +229 01 02 03 04"), "instructions visibles au choix");
  await admin.getByRole("button", { name: /^Payer mon abonnement/ }).click();
  await admin.waitForURL(/abonnement\/transfert\/NEO-/, { timeout: 30000 });
  const reference = admin.url().split("/").pop();
  check((await admin.getByTestId("offline-instructions").innerText()).includes("IBAN BJ00 1234 5678"), `page de transfert (${reference})`);
  await admin.getByLabel("Référence de votre paiement *").fill("MP260930.1200.E2E");
  await admin.getByRole("button", { name: "J'ai payé" }).click();
  await admin.getByText(/en attente de validation/).first().waitFor({ timeout: 15000 });
  check(true, "paiement déclaré, en attente de validation");
  await admin.screenshot({ path: `${out}/02-transfert.png`, fullPage: true });

  console.log("\n=== 3. Super Admin : validation ===");
  await sa.goto(`${base}/plateforme/paiements`);
  const table = sa.getByTestId("offline-transfers");
  const line = table.locator("tr", { hasText: reference });
  check((await line.innerText()).includes("MP260930.1200.E2E"), "déclaration visible par le Super Admin");
  await line.getByRole("button", { name: "Valider" }).click();
  await sa.getByRole("dialog").getByRole("button", { name: "Valider le paiement" }).click();
  await sa.getByText(/Paiement validé/).first().waitFor({ timeout: 15000 });
  const tx = await q1("select status from payment_transactions where internal_reference = $1", [reference]);
  const sub = await q1("select s.status from subscriptions s join organizations o on o.id = s.organization_id where o.slug = 'demo'");
  check(tx.status === "SUCCESS" && sub.status === "ACTIVE", "facture payée, abonnement actif");
  await admin.goto(`${base}/abonnement/transfert/${reference}`);
  check(await admin.getByText(/Paiement validé par NeoScool/).isVisible(), "l'établissement voit la validation");
} finally {
  // Remet la démonstration dans son état (paiement simulé des autres scénarios).
  await db.query("update payment_gateway_settings set checkout_enabled = false, is_default = false where provider in ('offline', 'fedapay')");
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est OK.");
process.exit(problems.length ? 1 : 0);
