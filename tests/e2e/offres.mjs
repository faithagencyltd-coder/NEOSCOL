// OFFRES (Super Admin) : durée d'essai, code promo, offre automatique limitée,
// tarif négocié ; application au paiement de l'établissement (montant calculé en base).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-offres";
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
async function fill(page, dialog, values) {
  for (const [label, value] of Object.entries(values)) {
    const field = dialog.getByLabel(label, { exact: false }).first();
    const tag = await field.evaluate((el) => el.tagName.toLowerCase() + (el.getAttribute("type") ?? ""));
    if (tag === "select") await field.selectOption(value);
    else if (tag === "inputcheckbox") await (value ? field.check() : field.uncheck());
    else await field.fill(String(value));
  }
}
const run = String(Date.now()).slice(-5);
const CODE = `RENTREE${run}`;
const AUTO = `SEPT${run}`;
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

try {
  await db.query("update subscriptions set is_demo = false, status = 'TRIALING', trial_start = now(), trial_end = now() + interval '10 days' where organization_id = (select id from organizations where slug = 'demo')");
  console.log("\n=== 1. Super Admin ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/formules`);
  await sa.getByRole("button", { name: /Essai : \d+ j/ }).first().click();
  let dialog = sa.getByRole("dialog");
  await dialog.getByLabel("Durée de l'essai (jours)").fill("30");
  await dialog.getByRole("button", { name: "Enregistrer la durée" }).click();
  await sa.getByRole("button", { name: "Essai : 30 j" }).first().waitFor({ timeout: 15000 });
  check(true, "durée d'essai modifiée (30 jours)");

  await sa.goto(`${base}/plateforme/offres`);
  await sa.getByRole("button", { name: "Nouvelle offre" }).click();
  dialog = sa.getByRole("dialog");
  await fill(sa, dialog, { "Code (ce que le client saisit)": CODE, "Nom de l'offre": "Offre de rentrée", Valeur: "20", "Formule concernée": "MODULE_SCOLAIRE" });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await sa.getByTestId("promo-list").getByText(CODE, { exact: true }).waitFor({ timeout: 15000 });
  await sa.getByRole("button", { name: "Nouvelle offre" }).click();
  dialog = sa.getByRole("dialog");
  await fill(sa, dialog, { "Code (ce que le client saisit)": AUTO, "Nom de l'offre": "Spécial septembre", "Type de réduction": "amount", Valeur: "1000", "Fin (facultatif)": inDays(5), "Appliquer automatiquement": true });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await sa.getByTestId("promo-list").getByText(AUTO, { exact: true }).waitFor({ timeout: 15000 });
  check((await sa.getByTestId("promo-list").innerText()).includes("Automatique"), "offre automatique créée");
  await sa.screenshot({ path: `${out}/01-offres.png`, fullPage: true });

  const anon = await (await browser.newContext({ locale: "fr-FR" })).newPage();
  await anon.goto(`${base}/tarifs`);
  check((await anon.getByTestId("active-offers").innerText()).includes("Spécial septembre"), "offre affichée sur la page publique des tarifs");

  console.log("\n=== 2. Établissement : code promo au paiement ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=MONTHLY`);
  for (let i = 0; i < 3; i++) await admin.getByRole("button", { name: "Continuer", exact: true }).click();
  await admin.getByTestId("promo-line").waitFor({ timeout: 15000 });
  check((await admin.getByTestId("promo-line").innerText()).includes("Spécial septembre"), "offre automatique appliquée sans code");
  await admin.getByLabel("Code promo").fill(CODE.toLowerCase());
  await admin.getByRole("button", { name: "Appliquer" }).click();
  await admin.getByText(`Code ${CODE} appliqué.`).waitFor({ timeout: 15000 });
  const summary = await admin.locator("body").innerText();
  check(summary.replace(/\s/g, "").includes("12000"), "total avec -20 % : 12 000 F CFA");
  await admin.getByRole("button", { name: "Continuer", exact: true }).click();
  await admin.getByRole("button", { name: /^Payer mon abonnement/ }).click();
  await admin.waitForURL(/paiement-simule/, { timeout: 30000 });
  const inv = await q1("select amount, promo_code, promo_discount from subscription_invoices where organization_id = (select id from organizations where slug = 'demo') order by issued_at desc limit 1");
  check(inv.amount === 12000 && inv.promo_code === CODE && inv.promo_discount === 3000, "facture calculée en base avec le code promo");

  console.log("\n=== 3. Tarif négocié ===");
  await sa.goto(`${base}/plateforme/offres`);
  await sa.getByRole("button", { name: "Nouveau tarif négocié" }).click();
  dialog = sa.getByRole("dialog");
  const orgId = (await q1("select id from organizations where slug = 'demo'")).id;
  await dialog.getByLabel("Établissement").selectOption(orgId);
  await fill(sa, dialog, { Formule: "MODULE_SCOLAIRE", "Prix mensuel négocié": "9000", "Prix annuel négocié": "90000", "Note interne": "Partenaire" });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await sa.getByTestId("negotiated-list").getByText("En vigueur").waitFor({ timeout: 15000 });
  check(true, "tarif négocié enregistré");
  await db.query("update subscription_invoices set status = 'CANCELLED' where status = 'PENDING' and organization_id = $1", [orgId]);
  await admin.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
  for (let i = 0; i < 3; i++) await admin.getByRole("button", { name: "Continuer", exact: true }).click();
  await admin.getByText("Tarif négocié").waitFor({ timeout: 15000 });
  check((await admin.locator("body").innerText()).replace(/\s/g, "").includes("90000"), "tarif négocié affiché au récapitulatif");
} finally {
  await db.query("update subscription_plans set trial_days = 20");
  await db.query("update promo_codes set is_active = false");
  await db.query("update negotiated_prices set is_active = false");
  // Abonnement de démonstration remis dans son état d'origine.
  await db.query("update subscriptions set is_demo = true, status = 'ACTIVE', trial_start = null, trial_end = null, current_period_end = now() + interval '1 year' where organization_id = (select id from organizations where slug = 'demo')");
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est OK.");
process.exit(problems.length ? 1 : 0);
