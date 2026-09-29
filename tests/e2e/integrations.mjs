// P3 — Super Admin → Intégrations : configuration, clé chiffrée jamais
// réaffichée, test du fournisseur, quotas, modèles WhatsApp, accès refusé aux
// établissements. Rejouable.
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… CHROMIUM_PATH=… node tests/e2e/integrations.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-integrations";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
async function login(identifier, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|universite|espaces/);
  return page;
}

// État initial propre (rejouable).
await db.query("update platform_integrations set enabled = false, config = '{}', secret_ciphertext = null, secret_hint = null, last_test_at = null, last_test_ok = null, last_test_message = null");
await db.query("delete from whatsapp_templates where name = 'rappel_paiement_e2e'");
await db.query("delete from messaging_quotas where organization_id = (select id from organizations where code = 'DEMO')");

console.log("\n=== 1. Console : 5 intégrations ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/integrations`);
let t = await text(sa);
check(["Brevo — E-mail", "Brevo — SMS", "Twilio — SMS", "WhatsApp Business Platform (Meta)", "Cloudflare Turnstile — anti-robot"].every((n) => t.includes(n)), "5 fournisseurs présentés");
check((t.match(/Non configuré/g) ?? []).length >= 5, "état initial : non configuré");
check(await sa.getByRole("link", { name: "Intégrations" }).isVisible(), "onglet « Intégrations » dans la console");
await shot(sa, "01-integrations");

console.log("\n=== 2. Enregistrement : clé chiffrée, jamais réaffichée ===");
const brevo = sa.locator("article").filter({ hasText: "Brevo — E-mail" });
await brevo.getByLabel(/Activer pour tous/).check();
await brevo.getByRole("button", { name: "Enregistrer" }).click();
check(await brevo.getByText(/champ obligatoire/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "adresse d'expédition obligatoire");
await brevo.getByLabel(/Adresse d'expédition/).fill("no-reply@neoscol.app");
await brevo.getByRole("button", { name: "Enregistrer" }).click();
check(await brevo.getByText(/clé secrète avant/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "activation refusée sans clé (contrôle en base)");
const SECRET = "xkeysib-e2e-TEST-SECRET-9876";
await brevo.getByLabel(/Clé API Brevo/).fill(SECRET);
await brevo.getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText(/configuration enregistrée \(clé chiffrée\)/).first().waitFor();
await sa.reload();
t = await text(sa);
check(t.includes("••9876") && !t.includes(SECRET), "seul l'indice « ••9876 » est affiché");
check(!(await sa.content()).includes(SECRET), "la clé n'est jamais renvoyée au navigateur (HTML)");
const row = await q1("select enabled, secret_ciphertext, config from platform_integrations where provider = 'brevo_email'");
check(row.enabled && row.secret_ciphertext.startsWith("v1:") && !row.secret_ciphertext.includes("SECRET"), "base : clé chiffrée (v1:…), intégration active");
check(row.config.sender_email === "no-reply@neoscol.app", "base : configuration non secrète enregistrée");
const audit = await q1("select count(*)::int n from audit_logs where action = 'platform.integration_updated' and metadata::text not like '%SECRET%' and summary not like '%SECRET%'");
check(audit.n >= 1, "journal d'audit sans la clé");

console.log("\n=== 3. Test du fournisseur (résultat enregistré, jamais la clé) ===");
await brevo.getByRole("button", { name: /Tester/ }).click();
await brevo.locator("[role=status]").filter({ hasNotText: "Jamais testé" }).first().waitFor({ timeout: 30000 });
const tested = await q1("select last_test_at is not null as done, last_test_ok, last_test_message from platform_integrations where provider = 'brevo_email'");
check(tested.done && typeof tested.last_test_ok === "boolean" && !tested.last_test_message.includes("SECRET"), `test effectué et enregistré (${tested.last_test_ok ? "réussi" : "échec : " + tested.last_test_message})`);
await shot(sa, "02-integrations-brevo");

console.log("\n=== 4. Turnstile : clé de site publique, clé secrète protégée ===");
const ts = sa.locator("article").filter({ hasText: "Cloudflare Turnstile" });
await ts.getByLabel(/Clé de site/).fill("bad key!");
await ts.getByRole("button", { name: "Enregistrer" }).click();
check(await ts.getByText(/valeur invalide/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "clé de site invalide refusée");

console.log("\n=== 5. Quotas et modèles WhatsApp ===");
const demoRow = sa.getByRole("row").filter({ hasText: "DEMO" }).first();
await demoRow.getByRole("button", { name: "Quota" }).click();
let dlg = sa.getByRole("dialog");
await dlg.getByLabel("SMS / mois").fill("42");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const quota = await q1("select q.sms_limit, q.email_limit from messaging_quotas q join organizations o on o.id = q.organization_id where o.code = 'DEMO'");
check(quota?.sms_limit === 42 && quota.email_limit === null, "quota SMS personnalisé (42), autres canaux par défaut");
await sa.getByRole("button", { name: /Ajouter un modèle/ }).click();
dlg = sa.getByRole("dialog");
await dlg.getByLabel(/Nom du modèle/).fill("rappel_paiement_e2e");
await dlg.getByLabel(/Nombre de variables/).fill("2");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
check((await text(sa)).includes("rappel_paiement_e2e"), "modèle WhatsApp enregistré et listé");
await shot(sa, "03-integrations-quotas");
const mobile = await login("superadmin@demo.neoscol.app", { width: 390, height: 844 });
await mobile.goto(`${base}/plateforme/integrations`);
await shot(mobile, "04-integrations-mobile");

console.log("\n=== 6. Établissement : accès refusé ===");
const admin = await login("admin@demo.neoscol.app");
check((await admin.goto(`${base}/plateforme/integrations`)).status() === 404, "administrateur d'établissement : console inaccessible");
const hook = await admin.request.post(`${base}/api/hooks/auth-email`, { data: { user: { email: "x@y.z" }, email_data: {} } });
check(hook.status() === 401, "Send Email Hook : requête non signée refusée (401)");

// Nettoyage : l'intégration de test est désactivée et sa clé supprimée.
await db.query("update platform_integrations set enabled = false, secret_ciphertext = null, secret_hint = null where provider = 'brevo_email'");
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nINTÉGRATIONS E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
