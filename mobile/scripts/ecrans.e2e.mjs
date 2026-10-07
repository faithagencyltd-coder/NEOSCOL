// Parcours des écrans locaux de l'application (navigateur au format téléphone) :
// accueil vide, saisie du lien, établissement trouvé, choix du portail, ouverture
// du portail sur le serveur, liste « Mes établissements », retrait.
//   APP_URL=http://localhost/index.html  SERVER_URL=http://192.168.x.x:3000  CHROMIUM_PATH=…  node scripts/ecrans.e2e.mjs
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright-core";

const app = process.env.APP_URL ?? "http://localhost/index.html";
const server = process.env.SERVER_URL ?? "http://localhost:3000";
const code = process.env.ORG_CODE ?? "DEMO";
const out = process.env.RESULTS_DIR ?? "test-results/mobile";
mkdirSync(out, { recursive: true });
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ ...devices["Pixel 7"], userAgent: `${devices["Pixel 7"].userAgent} NeoScoolApp/1.0.0` });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(e.message));
await page.goto(app);
check(await page.getByText("Bienvenue sur NeoScool").isVisible(), "accueil : premier lancement");
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/01-accueil.png` });

await page.getByRole("button", { name: "Saisir le lien ou le code" }).click();
await page.getByLabel("Lien de l'établissement ou code").fill("n'importe quoi");
await page.getByRole("button", { name: "Ajouter" }).click();
check(await page.locator("#add-error").isVisible(), "lien invalide : message clair");
await page.getByLabel("Lien de l'établissement ou code").fill(`${server}/acces/${code}?portail=parent`);
await page.getByRole("button", { name: "Ajouter" }).click();
await page.locator("#screen-org").waitFor({ state: "visible", timeout: 15000 });
const head = await page.locator("#org-head").innerText();
check(head.length > 3, `établissement trouvé : ${head.split("\n")[0]}`);
const portals = await page.locator("#org-portals button").allInnerTexts();
check(portals.length >= 3, `portails proposés (${portals.length})`);
check(await page.locator("#org-portals button.suggested").count() === 1, "portail du QR code mis en avant");
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/02-portails.png` });

await page.getByRole("button", { name: "Retour" }).click();
check((await page.locator("#home-list li").count()) === 1, "« Mes établissements » : établissement enregistré");
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/03-mes-etablissements.png` });
await page.reload();
check((await page.locator("#home-list li").count()) === 1, "liste conservée après redémarrage");

await page.locator("#home-list button").first().click();
await page.locator("#org-portals button").first().click();
await page.waitForURL((u) => u.href.startsWith(server), { timeout: 20000 });
check(new URL(page.url()).pathname.startsWith("/acces/") || new URL(page.url()).pathname.startsWith("/connexion"), `portail ouvert sur le serveur (${new URL(page.url()).pathname})`);
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/04-portail.png` });

await page.goto(`${app}#etablissements`);
await page.locator("#home-list button").first().click();
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: /Retirer cet établissement/ }).click();
check(await page.getByText("Bienvenue sur NeoScool").isVisible(), "établissement retiré");

await page.getByRole("button", { name: "Saisir le lien ou le code" }).click();
await page.getByLabel("Lien de l'établissement ou code").fill("http://10.255.255.1:3000/acces/DEMO");
await page.getByRole("button", { name: "Ajouter" }).click();
await page.locator("#screen-error").waitFor({ state: "visible", timeout: 20000 });
check((await page.locator("#error-title").innerText()).includes("injoignable"), "serveur injoignable : message et « Réessayer »");
await page.waitForTimeout(300); await page.screenshot({ path: `${out}/05-injoignable.png` });

await browser.close();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
