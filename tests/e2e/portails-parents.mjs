// PORTAILS PARENTS — centre de formation et université, de bout en bout :
// parent de formation (portail existant) ; université : portail parent activable,
// informations visibles choisies par l'université (onglets et pages masqués,
// adresse directe refusée), désactivation = accès fermé ; menus du personnel
// (Parents et tuteurs, lien du portail parent). État restauré à la fin.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-portails-parents";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const DEMOU = "10000000-0000-4000-a000-000000000003";
const saved = (await db.query("select settings -> 'university' as u from organizations where id = $1", [DEMOU])).rows[0].u;

async function login(identifier, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/portail|tableau-de-bord|universite|formation/, { timeout: 30000 });
  return page;
}
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const tabs = async (page) => (await page.getByRole("navigation", { name: "Portail" }).last().innerText()).split("\n").map((s) => s.trim()).filter(Boolean);

try {
  console.log("\n=== 1. Centre de formation : portail parent ===");
  const pf = await login("parent.formation@demo.neoscol.app");
  await pf.goto(`${base}/portail`);
  await pf.locator("header p", { hasText: "Espace parent" }).waitFor({ timeout: 20000 });
  await pf.getByText("Aminata COULIBALY").first().waitFor({ timeout: 20000 }).catch(() => {});
  let t = await text(pf);
  check(t.includes("Aminata COULIBALY") && t.includes("Institut Démo de Formation Professionnelle"), "parent de formation : fiche de son enfant");
  check(JSON.stringify(await tabs(pf)) === JSON.stringify(["Accueil", "Présences", "Notes", "Finances", "Plus"]), `onglets parent (formation) : ${(await tabs(pf)).join(", ")}`);
  await pf.goto(`${base}/portail/finances`);
  await pf.getByText("Reste à payer").first().waitFor({ timeout: 20000 }).catch(() => {});
  check((await text(pf)).includes("Reste à payer"), "parent de formation : situation financière");
  await pf.goto(`${base}/portail/parcours`);
  await pf.getByText(/Parcours d/).first().waitFor({ timeout: 20000 }).catch(() => {});
  check((await text(pf)).includes("Parcours de Aminata") || (await text(pf)).includes("Parcours d"), "parent de formation : parcours de formation");
  await pf.screenshot({ path: `${out}/01-parent-formation.png`, fullPage: true });

  console.log("\n=== 2. Université : réglages du portail parent ===");
  const ua = await login("universite@demo.neoscol.app", { width: 1360, height: 900 });
  await ua.goto(`${base}/universite/parametres`);
  const parentToggle = ua.getByLabel(/^Portail parent/);
  check(await parentToggle.isChecked(), "portail parent activé (démonstration)");
  const sections = ua.getByTestId("parent-sections");
  check((await sections.innerText()).includes("Résultats, crédits et parcours"), "choix des informations visibles par les parents");
  await sections.getByLabel("Notes des évaluations").uncheck();
  await sections.getByLabel("Paiements et reliquats").uncheck();
  await ua.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await ua.getByText("Paramètres universitaires enregistrés").first().waitFor({ timeout: 20000 });
  const u = (await db.query("select app.org_university($1) as c", [DEMOU])).rows[0].c;
  check(u.parent_portal_sections.grades === false && u.parent_portal_sections.finances === false && u.parent_portal_sections.results === true, "informations visibles enregistrées en base");
  await ua.screenshot({ path: `${out}/02-parametres-universite.png`, fullPage: true });
  const nav = await ua.getByRole("navigation").first().innerText();
  check(nav.includes("Parents et tuteurs"), "menu université : Parents et tuteurs");
  await ua.goto(`${base}/parents`);
  check((await text(ua)).includes("KONAN"), "université : liste des parents (Brigitte KONAN)");
  await ua.goto(`${base}/parametres/portails`);
  check((await text(ua)).includes("Portail Parent"), "lien du portail parent proposé");

  console.log("\n=== 3. Université : portail du parent ===");
  const pu = await login("parent.universite@demo.neoscol.app");
  await pu.goto(`${base}/portail`);
  await pu.locator("header p", { hasText: "Espace parent" }).waitFor({ timeout: 20000 });
  await pu.getByText("Kouamé KONAN").first().waitFor({ timeout: 20000 }).catch(() => {});
  t = await text(pu);
  check(t.includes("Kouamé KONAN"), "parent d'université : son enfant");
  const uTabs = await tabs(pu);
  check(JSON.stringify(uTabs) === JSON.stringify(["Accueil", "Présences", "Résultats", "Plus"]), `onglets : ${uTabs.join(", ")} (Notes et Finances masqués)`);
  check(!t.includes("Dernières notes") && !t.includes("Reste à payer"), "accueil : notes et paiements masqués");
  await pu.goto(`${base}/portail/resultats`);
  await pu.getByText("Parcours universitaire de Kouamé").first().waitFor({ timeout: 20000 }).catch(() => {});
  t = await text(pu);
  check(t.includes("Résultats et crédits") && t.includes("Parcours universitaire de Kouamé"), "résultats publiés et parcours de l'étudiant");
  await pu.screenshot({ path: `${out}/03-parent-universite-resultats.png`, fullPage: true });
  // Page refusée : « introuvable » (le statut HTTP peut rester 200 quand la page est diffusée en continu).
  const refused = async (path) => {
    await pu.goto(`${base}${path}`);
    await pu.getByText(/introuvable/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    const body = await text(pu);
    return /introuvable/i.test(body) && !body.includes("Moyenne") && !body.includes("Reste à payer");
  };
  check(await refused("/portail/notes"), "notes masquées : adresse directe refusée (page introuvable)");
  check(await refused("/portail/finances"), "paiements masqués : adresse directe refusée (page introuvable)");
  await pu.goto(`${base}/portail/presences`);
  check((await pu.locator("main").innerText()).length > 20, "présences visibles");

  console.log("\n=== 4. Université : portail parent désactivé ===");
  await ua.goto(`${base}/universite/parametres`);
  await ua.getByLabel(/^Portail parent/).uncheck();
  await ua.getByRole("button", { name: "Enregistrer les paramètres" }).click();
  await ua.getByText("Paramètres universitaires enregistrés").first().waitFor({ timeout: 20000 });
  await ua.goto(`${base}/parametres/portails`);
  check(!(await text(ua)).includes("Portail Parent"), "lien du portail parent retiré");
  await pu.goto(`${base}/portail`);
  await pu.waitForLoadState("networkidle");
  check(pu.url().includes("acces-indisponible") && (await text(pu)).includes("Portail désactivé"), "parent : « Portail désactivé »");
  await pu.screenshot({ path: `${out}/04-portail-desactive.png` });
} catch (e) {
  problems.push(`Exception : ${e.message}`);
  console.log(e);
} finally {
  await db.query("update organizations set settings = jsonb_set(settings, '{university}', $2::jsonb) where id = $1", [DEMOU, JSON.stringify(saved)]);
  await db.end();
  await browser.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
