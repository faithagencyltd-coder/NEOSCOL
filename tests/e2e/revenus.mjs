// REVENUS (Super Admin) : indicateurs, période, exports Excel/CSV cohérents
// avec le tableau de bord, accès refusé aux établissements, affichage mobile.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-revenus";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
async function login(identifier, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement/);
  return page;
}
const digits = (s) => Number((s ?? "").replace(/\D/g, "") || 0);

try {
  console.log("\n=== 1. Tableau de bord ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme`);
  await sa.getByRole("link", { name: "Revenus" }).click();
  await sa.waitForURL(/\/plateforme\/revenus/);
  await sa.getByTestId("kpi-revenue").waitFor({ timeout: 15000 });
  check(true, "onglet Revenus dans la console");
  for (const id of ["kpi-revenue", "kpi-recurring", "kpi-new", "kpi-trials", "kpi-unpaid", "kpi-churn", "monthly-chart"]) {
    check(await sa.getByTestId(id).isVisible(), `indicateur affiché : ${id}`);
  }
  check((await sa.getByTestId("monthly-chart").locator("li").count()) === 12, "graphique : 12 mois");
  await sa.getByRole("link", { name: "Cette année" }).click();
  await sa.waitForURL(/periode=annee/);
  const year = new Date().getFullYear();
  check((await sa.getByTestId("period-label").innerText()).includes(`01 janv. ${year}`), "raccourci « Cette année »");
  check((await sa.getByLabel("Du", { exact: true }).inputValue()) === `${year}-01-01`, "champs de dates mis à jour par le raccourci");
  await sa.screenshot({ path: `${out}/01-revenus.png`, fullPage: true });

  console.log("\n=== 2. Période libre ===");
  await sa.getByLabel("Du", { exact: true }).fill(`${year}-01-01`);
  await sa.getByLabel("Au", { exact: true }).fill(`${year}-12-31`);
  await sa.getByRole("button", { name: "Afficher" }).click();
  await sa.waitForURL(/du=/);
  check((await sa.getByTestId("period-label").innerText()).includes(`31 déc. ${year}`), "période libre appliquée");
  const shown = digits(await sa.getByTestId("kpi-revenue").locator("span.text-xl").innerText());

  console.log("\n=== 3. Exports ===");
  const [csvDl] = await Promise.all([sa.waitForEvent("download"), sa.getByTestId("export-csv").click()]);
  const csvPath = `${out}/encaissements.csv`;
  await csvDl.saveAs(csvPath);
  const csv = (await import("node:fs")).readFileSync(csvPath, "utf8").replace(/^﻿/, "").trim().split(/\r\n/);
  const header = csv[0].split(";");
  const col = header.indexOf("Montant encaissé");
  check(col > 0 && header.includes("Établissement") && header.includes("Moyen de paiement"), "CSV : colonnes comptables");
  const total = csv.slice(1).reduce((n, l) => n + Number(l.split(";")[col] || 0), 0);
  check(total === shown, `CSV cohérent avec le tableau de bord (${total} = ${shown})`);
  check(csv.slice(1).every((l) => l.split(";").at(-1) === "Réel"), "CSV : paiements de test exclus");
  const [xlsxDl] = await Promise.all([sa.waitForEvent("download"), sa.getByTestId("export-xlsx").click()]);
  const xlsxPath = `${out}/encaissements.xlsx`;
  await xlsxDl.saveAs(xlsxPath);
  const bytes = (await import("node:fs")).readFileSync(xlsxPath);
  check(bytes[0] === 0x50 && bytes[1] === 0x4b && xlsxDl.suggestedFilename().endsWith(".xlsx"), "Excel téléchargé (.xlsx)");
  const zip = bytes.toString("latin1");
  check(zip.includes("xl/worksheets/sheet1.xml") && zip.includes("xl/worksheets/sheet3.xml"), "Excel : feuilles encaissements, impayés, départs");

  console.log("\n=== 4. Accès refusé aux établissements ===");
  const dir = await login("admin@demo.neoscol.app");
  const page = await dir.goto(`${base}/plateforme/revenus`);
  check(page?.status() === 404, "établissement : page introuvable");
  const exp = await dir.request.get(`${base}/plateforme/revenus/export?format=csv`);
  check(exp.status() === 404 && !(await exp.text()).includes("Montant"), "établissement : export refusé");

  console.log("\n=== 5. Mobile ===");
  const mob = await login("superadmin@demo.neoscol.app", { width: 390, height: 844 });
  await mob.goto(`${base}/plateforme/revenus`);
  await mob.getByTestId("kpi-revenue").waitFor({ timeout: 15000 });
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `mobile : pas de défilement horizontal (${overflow}px)`);
  await mob.screenshot({ path: `${out}/02-revenus-mobile.png`, fullPage: true });
} catch (e) {
  problems.push(`exception: ${e.message}`);
  console.log("EXCEPTION", e);
} finally {
  await browser.close();
  writeFileSync(`${out}/problems.json`, JSON.stringify(problems, null, 2));
  if (problems.length) {
    console.log(`\nPROBLÈMES (${problems.length}):`);
    for (const p of problems) console.log("-", p);
    process.exit(1);
  }
  console.log("\nTout est OK.");
}
