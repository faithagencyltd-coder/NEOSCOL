// P6 — « NeoScool Console » installable : manifeste propre (portée /plateforme,
// icône, raccourcis), distinct de l'application des établissements, accessible
// sans session (exigence des navigateurs), réservé au Super Admin, alerte de
// double authentification, aucune page mise en cache.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-console";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme/);
  return page;
}

console.log("\n=== 1. Manifeste « NeoScool Console » ===");
const anon = await (await browser.newContext()).newPage();
const res = await anon.request.get(`${base}/console.webmanifest`, { maxRedirects: 0 });
const manifest = await res.json().catch(() => ({}));
check(res.status() === 200 && res.headers()["content-type"].includes("manifest+json"), "manifeste accessible sans session (téléchargé par le navigateur)");
check(manifest.id === "/plateforme" && manifest.scope === "/plateforme" && manifest.start_url === "/plateforme", "application distincte : id, portée et démarrage /plateforme");
check(manifest.short_name === "NeoScool Console" && manifest.display === "standalone", "nom et fenêtre propres");
check(manifest.icons?.length === 3 && manifest.shortcuts?.length === 4, "icônes (dont maskable) et raccourcis");
for (const icon of manifest.icons ?? []) {
  const r = await anon.request.get(`${base}${icon.src}`);
  check(r.status() === 200 && r.headers()["content-type"] === "image/png", `icône ${icon.src}`);
}
const noData = await anon.request.get(`${base}/plateforme`, { maxRedirects: 0 });
check([302, 303, 307, 308].includes(noData.status()), "console elle-même : connexion exigée");

console.log("\n=== 2. Console du Super Admin ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme`);
check((await sa.locator('link[rel="manifest"]').getAttribute("href")) === "/console.webmanifest", "la console déclare son propre manifeste");
check((await sa.title()).includes("NeoScool Console"), "titre de fenêtre « NeoScool Console »");
check(await sa.getByText(/Console non protégée par la double authentification/).isVisible(), "alerte : double authentification non activée");
check(await sa.getByText(/NeoScool Console s'installe|Installer NeoScool Console/).first().isVisible(), "installation proposée");
await sa.screenshot({ path: `${out}/01-console.png`, fullPage: false });

console.log("\n=== 3. Application des établissements inchangée ; console refusée ===");
const admin = await login("admin@demo.neoscol.app");
check((await admin.locator('link[rel="manifest"]').getAttribute("href"))?.includes("manifest.webmanifest"), "application des établissements : manifeste NeoScool habituel");
check((await admin.goto(`${base}/plateforme`)).status() === 404, "administrateur d'établissement : console introuvable");
const sw = await (await anon.request.get(`${base}/sw.js`)).text();
check(sw.includes('request.mode === "navigate"') && sw.includes("fetch(request)"), "service worker : pages toujours chargées depuis le serveur (rien de sensible en cache)");

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nCONSOLE E2E : TOUT EST OK");
await browser.close();
process.exit(problems.length ? 1 : 0);
