// P5 — « Mon badge » : carte 3D (recto / verso), QR tournant, plein écran,
// scan à la tablette (accepté une fois, capture réutilisée refusée), portail
// étudiant, aperçu 3D côté administration, mouvement réduit respecté.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-mon-badge";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
async function login(identifier, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", ...options });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|pointage|portail|universite/);
  return page;
}
const codeOf = (page) => page.locator("img[data-badge-code]").first().getAttribute("data-badge-code");

console.log("\n=== 1. Mon badge (enseignant) : carte 3D, QR tournant ===");
const teacher = await login("enseignant@demo.neoscol.app", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await teacher.goto(`${base}/mon-badge`);
let t = await text(teacher);
check(t.includes("ENSEIGNANT") && t.includes("Mon badge"), "carte 3D : rôle et identité affichés");
await teacher.locator("img[data-badge-code]").first().waitFor({ state: "attached" });
const code1 = await codeOf(teacher);
check(/^NEOSCOL-DYN:S:[0-9a-f-]{36}:\d+:[0-9a-f]{20}$/.test(code1 ?? ""), "QR tournant signé (jeton secret absent)");
await shot(teacher, "01-mon-badge-recto");
await teacher.getByRole("button", { name: /Voir le verso du badge/ }).click({ force: true });
await teacher.waitForTimeout(800);
await shot(teacher, "02-mon-badge-verso-qr");
check(await teacher.getByRole("button", { name: /Voir le recto du badge/ }).isVisible(), "recto / verso (touché)");
await teacher.getByRole("button", { name: /plein écran/ }).click();
const dialog = teacher.getByRole("dialog", { name: "Badge en plein écran" });
await dialog.waitFor();
check((await dialog.innerText()).includes("Nouveau code dans"), "plein écran : QR + compte à rebours");
await shot(teacher, "03-plein-ecran");

console.log("\n=== 2. Tablette : code accepté une fois, capture réutilisée refusée ===");
const kiosk = await login("pointage@demo.neoscol.app", { viewport: { width: 1180, height: 820 } });
await kiosk.waitForURL("**/pointage");
const code = await dialog.locator("img[data-badge-code]").getAttribute("data-badge-code");
await kiosk.getByLabel("Code du badge").fill(code);
await kiosk.keyboard.press("Enter");
await kiosk.waitForTimeout(1500);
t = await text(kiosk);
check(!/Badge non reconnu|expiré|déjà été utilisé/.test(t), "1er scan du QR tournant : pris en compte par le pointage");
await shot(kiosk, "04-tablette-scan");
await kiosk.waitForTimeout(3500);
await kiosk.getByLabel("Code du badge").fill(code);
await kiosk.keyboard.press("Enter");
check(await kiosk.getByText(/déjà été utilisé/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "même code réutilisé (capture d'écran) : refusé");
await shot(kiosk, "05-tablette-capture-refusee");

console.log("\n=== 3. Le code change toutes les 30 s ===");
await teacher.waitForTimeout(31000);
const code2 = await dialog.locator("img[data-badge-code]").getAttribute("data-badge-code");
check(code2 && code2 !== code, "nouveau code après 30 s");
await dialog.getByRole("button", { name: "Fermer" }).click();

console.log("\n=== 4. Portail étudiant ===");
const student = await login("etudiant@demo.neoscol.app", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await student.goto(`${base}/portail/plus`);
await student.getByRole("link", { name: /Mon badge/ }).click();
await student.waitForURL(/portail\/badge/);
await student.locator("img[data-badge-code]").first().waitFor({ state: "attached" });
t = await text(student);
check(t.includes("ÉTUDIANT") && t.includes("KONAN"), "badge étudiant 3D (Kouamé KONAN)");
check(/^NEOSCOL-DYN:E:/.test((await codeOf(student)) ?? ""), "QR tournant étudiant");
await shot(student, "06-portail-badge-etudiant");

console.log("\n=== 5. Administration : aperçu 3D ; mouvement réduit ===");
const admin = await login("admin@demo.neoscol.app", { reducedMotion: "reduce" });
await admin.goto(`${base}/personnel/badges`);
await admin.getByRole("button", { name: /Aperçu du badge/ }).first().click();
const preview = admin.getByRole("dialog");
await preview.waitFor();
check((await preview.innerText()).includes("touchez la carte"), "aperçu 3D dans la gestion des badges");
const floating = await preview.locator(".badge3d-float").count();
check(floating === 0, "mouvement réduit : pas de lévitation ni d'inclinaison");
await shot(admin, "07-apercu-3d-admin");
const pdf = await admin.request.get(`${base}/api/documents/badges`);
check(pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "badges PDF premium générés");

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nMON BADGE E2E : TOUT EST OK");
await browser.close();
process.exit(problems.length ? 1 : 0);
