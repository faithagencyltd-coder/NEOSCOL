// P7c — Country Connect, de bout en bout : le Super Admin règle le format de
// l'identifiant national du pays et publie un modèle de fichier ; l'établissement
// crée son format d'export, vérifie puis applique un import (seul l'identifiant
// est écrit), saisit un identifiant à la main, exporte, consulte l'historique.
// Rejouable (état remis à zéro au début, restauré à la fin).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-country-connect";
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
  const context = await browser.newContext({ viewport, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme/);
  return page;
}
const dialog = (page) => page.getByRole("dialog");
const done = (page) => dialog(page).waitFor({ state: "detached", timeout: 15000 });

// État initial.
const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const ciSettings = (await q1("select settings from countries where code = 'CI'")).settings;
const reset = async () => {
  await db.query("delete from country_connect_jobs where organization_id = $1", [DEMO]);
  await db.query("delete from country_connect_mappings where organization_id = $1 or country_code = 'CI'", [DEMO]);
  await db.query("update students set national_id = null where organization_id = $1", [DEMO]);
  await db.query("update countries set settings = $1 where code = 'CI'", [ciSettings]);
};
await reset();
const pupils = (
  await db.query("select id, matricule, last_name, first_name from students where organization_id = $1 and status = 'active' and archived_at is null order by last_name, first_name limit 4", [DEMO])
).rows;

console.log("\n=== 1. Super Admin : format de l'identifiant national et modèle de fichier du pays ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/pays`);
await sa.getByRole("button", { name: "Modifier Côte d'Ivoire" }).click();
await dialog(sa).getByLabel(/Libellé de l'identifiant national/).fill("INE");
await dialog(sa).getByLabel(/Format de l'identifiant national/).fill("^CI[0-9]{8}$");
await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
await done(sa);
const ci = await q1("select settings from countries where code = 'CI'");
check(ci.settings.national_id_pattern === "^CI[0-9]{8}$" && ci.settings.national_id_label === "INE", "format et libellé de l'identifiant national enregistrés pour la Côte d'Ivoire");
check(ci.settings.grading_scale === (ciSettings.grading_scale ?? 20), "autres réglages du pays conservés");

await sa.goto(`${base}/plateforme/country-connect?pays=CI`);
check((await text(sa)).includes("Aucun modèle pour ce pays"), "console : aucun modèle au départ");
await sa.getByRole("button", { name: "Nouveau modèle" }).click();
await dialog(sa).getByLabel(/^Nom/).fill("Liste officielle des INE");
await dialog(sa).getByLabel(/^Colonnes/).fill("MATRICULE = matricule\nINE = national_id\nNOM = last_name\nPRENOMS = first_name");
await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
await done(sa);
await sa.waitForLoadState("networkidle");
check((await text(sa)).includes("Liste officielle des INE"), "modèle national « Liste officielle des INE » créé");
await sa.getByRole("button", { name: "Nouveau modèle" }).click();
await dialog(sa).getByLabel(/^Nom/).fill("Modèle invalide");
await dialog(sa).getByLabel(/^Colonnes/).fill("NOM = last_name");
await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
check(await dialog(sa).getByText(/identifiant national/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "import sans colonne d'identifiant : refusé par la base");
await sa.keyboard.press("Escape");
await shot(sa, "01-console-modeles");

console.log("\n=== 2. Établissement : modèle du pays, format d'export propre ===");
const admin = await login("admin@demo.neoscol.app");
await admin.goto(`${base}/parametres/country-connect`);
let t = await text(admin);
check(t.includes("Liste officielle des INE") && t.includes("Modèle CI"), "modèle du pays visible par l'établissement");
check(/Élèves sans INE/.test(t) && /élèves avec ine/i.test(t), "libellé du pays utilisé (INE)");
await admin.getByRole("button", { name: "Nouvelle correspondance" }).click();
await dialog(admin).getByLabel(/^Nom/).fill("Export examens DECO");
await dialog(admin).getByLabel(/^Sens/).selectOption("export");
await dialog(admin).getByLabel(/^Colonnes/).fill("INE = national_id\nNOM = last_name\nPRENOMS = first_name\nNE LE = birth_date\nCLASSE = class_name");
await dialog(admin).getByLabel(/^Séparateur/).selectOption(",");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
await done(admin);
await admin.waitForLoadState("networkidle");
check((await text(admin)).includes("Export examens DECO"), "format d'export de l'établissement créé");

console.log("\n=== 3. Import : vérification (rien d'écrit) puis application ===");
const csv = [
  "MATRICULE;INE;NOM;PRENOMS",
  `${pupils[0].matricule};CI 0000 0001;${pupils[0].last_name};${pupils[0].first_name}`,
  `${pupils[1].matricule};CI00000002;NOM DIFFERENT;${pupils[1].first_name}`,
  `${pupils[2].matricule};MAUVAIS;${pupils[2].last_name};${pupils[2].first_name}`,
  "INCONNU-999;CI00000009;X;Y",
].join("\r\n");
writeFileSync(`${out}/liste-ine.csv`, csv);
await admin.getByLabel("Fichier reçu (Excel ou CSV)").setInputFiles(`${out}/liste-ine.csv`);
await admin.getByRole("button", { name: "Vérifier le fichier" }).click();
await admin.getByText("Vérification terminée").waitFor({ timeout: 15000 });
t = await text(admin);
check(t.includes("4 ligne(s) lue(s) : 2 valide(s), 2 en erreur"), "vérification : 2 valides, 2 erreurs");
check(t.includes("format non conforme") && t.includes("introuvable"), "erreurs expliquées (format, élève introuvable)");
check(t.includes("identité NéoScol conservée"), "nom différent signalé, identité conservée");
check((await q1("select count(national_id)::int as n from students where organization_id = $1", [DEMO])).n === 0, "vérification : aucune écriture en base");
await shot(admin, "02-verification");
await admin.getByRole("button", { name: /Enregistrer les 2 identifiant/ }).click();
await admin.getByText("Import appliqué").waitFor({ timeout: 15000 });
const s0 = await q1("select national_id, last_name from students where id = $1", [pupils[0].id]);
const s1 = await q1("select national_id, last_name from students where id = $1", [pupils[1].id]);
check(s0.national_id === "CI00000001" && s1.national_id === "CI00000002", "application : identifiants enregistrés (espaces retirés)");
check(s1.last_name === pupils[1].last_name, "application : le nom de l'élève n'est pas écrasé");
check((await q1("select national_id from students where id = $1", [pupils[2].id])).national_id === null, "ligne en erreur ignorée");

console.log("\n=== 4. Saisie manuelle (format contrôlé) ===");
await admin.reload();
const row = admin.getByRole("row", { name: new RegExp(pupils[2].matricule) });
await row.getByRole("button", { name: "Saisir" }).click();
await dialog(admin).getByLabel(/^INE/).fill("12345");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await dialog(admin).getByText(/format non conforme/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "saisie manuelle : format refusé par la base");
await dialog(admin).getByLabel(/^INE/).fill("CI00000001");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await dialog(admin).getByText(/existe déjà|déjà|doublon|unique/i).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "saisie manuelle : identifiant déjà attribué refusé");
await dialog(admin).getByLabel(/^INE/).fill("ci00000003");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
await done(admin);
check((await q1("select national_id from students where id = $1", [pupils[2].id])).national_id === "CI00000003", "saisie manuelle enregistrée");

console.log("\n=== 5. Export au format de l'établissement + historique ===");
await admin.reload();
const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("row", { name: /Export examens DECO/ }).getByRole("link", { name: "Exporter" }).click()]);
const path = `${out}/export.csv`;
await download.saveAs(path);
const content = (await import("node:fs")).readFileSync(path, "utf8").replace(/^﻿/, "");
const lines = content.trim().split(/\r?\n/);
check(lines[0] === "INE,NOM,PRENOMS,NE LE,CLASSE", "export : colonnes et séparateur de la correspondance");
const active = (await q1("select count(*)::int as n from students where organization_id = $1 and status = 'active' and archived_at is null", [DEMO])).n;
check(lines.length === active + 1, `export : ${active} élève(s) actif(s)`);
check(lines.some((l) => l.startsWith("CI00000001,") && /\d{2}\/\d{2}\/\d{4}/.test(l)), "export : identifiant et date au format jj/mm/aaaa");
await admin.reload();
t = await text(admin);
check(t.includes("Exporté") && t.includes("Appliqué") && t.includes("Vérifié") && t.includes("liste-ine.csv"), "historique : vérification, import et export conservés");
const audit = await q1("select count(*)::int as n from audit_logs where organization_id = $1 and (action like 'country_connect.%' or action = 'student.national_id_set')", [DEMO]);
check(audit.n >= 5, "journal d'audit : échanges et saisie tracés");
await shot(admin, "03-page-etablissement");
const mobile = await login("admin@demo.neoscol.app", { width: 390, height: 844 });
await mobile.goto(`${base}/parametres/country-connect`);
await shot(mobile, "04-mobile");

console.log("\n=== 6. Sécurité ===");
const teacher = await login("enseignant@demo.neoscol.app");
check((await teacher.goto(`${base}/parametres/country-connect`)).status() === 404, "enseignant : Country Connect inaccessible");
const mapping = await q1("select id from country_connect_mappings where organization_id = $1 and direction = 'export'", [DEMO]);
check((await teacher.goto(`${base}/api/country-connect/export/${mapping.id}`)).status() !== 200, "enseignant : export refusé");
check((await admin.goto(`${base}/plateforme/country-connect`)).status() === 404, "administrateur d'établissement : modèles nationaux inaccessibles");

await reset();
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nCOUNTRY CONNECT E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
