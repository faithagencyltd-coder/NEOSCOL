// NEOSCOOL — Calcul paramétrable des bulletins : réglages (mode par type d'évaluation,
// groupes, décimales, arrondi, exemple chiffré), enregistrement, recalcul et détail
// du calcul dans l'aperçu du bulletin. La configuration initiale est restaurée.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-calcul-bulletins";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const ORG = "10000000-0000-4000-a000-000000000001";
const initial = (await db.query("select config from report_card_settings where organization_id = $1", [ORG])).rows[0].config;

const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fr-FR" });
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));

try {
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill("admin@demo.neoscol.app");
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });

  console.log("\n=== 1. Réglages : règle par défaut ===");
  await page.goto(`${base}/bulletins/configuration`);
  check((await page.getByLabel("Règle de calcul de la moyenne par matière").inputValue()) === "groups", "mode « par type d'évaluation » sélectionné");
  const groups = page.getByTestId("rc-groups");
  check(await groups.isVisible(), "groupes d'évaluations affichés");
  const example = await page.getByTestId("rc-formula-example").innerText();
  check(/\(moy\. interro 12 \+ 13 \+ 15 \+ 14 \+ 16\) ÷ 5 = 14,00/.test(example), `exemple chiffré conforme (${example.split("\n").pop()})`);
  await page.screenshot({ path: `${out}/01-reglages.png`, fullPage: true });

  console.log("\n=== 2. Poids des devoirs = 2, une décimale ===");
  await page.getByLabel("Poids").nth(1).fill("2");
  check(/÷ 9 = 14,22/.test(await page.getByTestId("rc-formula-example").innerText()), "exemple recalculé en direct (÷ 9 = 14,22)");
  await page.getByLabel("Nombre de décimales").selectOption("1");
  check(/= 14,2$/.test((await page.getByTestId("rc-formula-example").innerText()).trim()), "exemple à une décimale");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await page.getByText(/Configuration enregistrée/).first().waitFor({ timeout: 15000 });
  const saved = (await db.query("select config from report_card_settings where organization_id = $1", [ORG])).rows[0].config;
  check(saved.groups[1].weight === 2 && saved.decimals === 1, "règles enregistrées en base (poids 2, 1 décimale)");

  console.log("\n=== 3. Bulletins recalculés et détail du calcul ===");
  await page.goto(`${base}/bulletins`);
  await page.getByRole("button", { name: /^(Re)?[Cc]alculer/ }).first().click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Calculer" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${base}/bulletins/apercu`);
  const detail = page.getByTestId("calcul-detail");
  await detail.waitFor({ timeout: 15000 });
  await detail.locator("summary").click();
  const text = await detail.innerText();
  check(/÷/.test(text) && /notes retenues/.test(text), "détail du calcul affiché (formule + notes retenues)");
  check(/× 2/.test(text), "pondération des devoirs visible dans la formule");
  const average = await page.getByText(/Moyenne générale :/).innerText();
  check(/\d+,\d \/ 20/.test(average), `moyenne générale à une décimale (${average.trim()})`);
  await page.screenshot({ path: `${out}/02-apercu-detail.png`, fullPage: true });
} finally {
  await db.query("update report_card_settings set config = $2 where organization_id = $1", [ORG, initial]);
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
