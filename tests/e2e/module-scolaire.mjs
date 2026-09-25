// MODULE 1 — SCOLAIRE : parcours navigateur (niveaux, séries du lycée, matières, classes, menus).
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/module-scolaire.mjs
// La configuration de DEMO est remise au parcours complet à la fin.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-module-scolaire";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
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
  await page.waitForURL(/tableau-de-bord|pointage/);
  return page;
}
const nav = async (page) => (await page.locator("nav").allInnerTexts()).join(" ");
async function saveLevels(page, wanted, tracks = ["Lycée général"]) {
  await page.goto(`${base}/parametres/etablissement`);
  for (const label of ["Maternelle", "Primaire", "Collège", "Lycée"]) {
    const box = page.locator(`input[name="level_${{ Maternelle: "maternelle", Primaire: "primaire", Collège: "college", Lycée: "lycee" }[label]}"]`);
    if ((await box.isChecked()) !== wanted.includes(label)) await box.locator("xpath=..").click();
  }
  if (wanted.includes("Lycée")) {
    for (const [label, name] of [["Lycée général", "track_general"], ["Lycée technique", "track_technical"]]) {
      const box = page.locator(`input[name="${name}"]`);
      if ((await box.isChecked()) !== tracks.includes(label)) await box.click();
    }
  }
  await page.getByRole("button", { name: "Enregistrer les niveaux" }).click();
  await page.getByText(/Niveaux enregistrés/).first().waitFor({ timeout: 15000 });
}
const schoolLevels = async () => (await q1("select settings->'school' s from organizations where code = 'DEMO'")).s;

// Test rejouable : suppression des seules données créées par un passage précédent de ce test.
await db.query("delete from subjects where code in ('RDM', 'EVEIL') and organization_id = (select id from organizations where code = 'DEMO')");
await db.query("delete from programs where track_type is not null and organization_id = (select id from organizations where code = 'DEMO')");
const admin = await login("admin@demo.neoscol.app");

console.log("\n=== Configuration par défaut (établissement existant) ===");
await admin.goto(`${base}/parametres/etablissement`);
check(await admin.getByText("Module scolaire").first().isVisible(), "carte « Module scolaire » dans Établissement");
check((await admin.locator('input[name^="level_"]:checked').count()) === 4, "groupe scolaire existant : 4 niveaux cochés par défaut");
await shot(admin, "01-niveaux-parcours-complet");

for (const [n, wanted] of [
  [1, ["Maternelle"]],
  [2, ["Primaire"]],
  [3, ["Collège"]],
  [4, ["Lycée"]],
  [5, ["Collège", "Lycée"]],
  [6, ["Maternelle", "Primaire"]],
]) {
  console.log(`\n=== TEST ${n} — ${wanted.join(" + ")} ===`);
  await saveLevels(admin, wanted);
  const cfg = await schoolLevels();
  check(cfg.levels.length === wanted.length, `base : ${cfg.levels.join(", ")}`);
  await admin.goto(`${base}/tableau-de-bord`);
  const menu = await nav(admin);
  check(menu.includes("Séries et filières") === wanted.includes("Lycée"), `menu « Séries et filières » ${wanted.includes("Lycée") ? "affiché" : "masqué"}`);
  await admin.goto(`${base}/structure?onglet=niveaux`);
  await admin.getByRole("button", { name: "Ajouter", exact: true }).click();
  const options = await admin.getByRole("dialog").getByLabel(/Niveau scolaire/).locator("option").allInnerTexts();
  check(options.filter((o) => o.trim()).join(",") === wanted.join(","), `nouveau niveau : choix limités à ${wanted.join(", ")}`);
  await admin.keyboard.press("Escape");
  const tabs = await admin.getByRole("navigation", { name: "Rubriques de la structure" }).innerText();
  check(tabs.includes("Séries et filières") === wanted.includes("Lycée"), "onglet des séries selon le lycée");
  await admin.goto(`${base}/classes`);
  const classes = await admin.locator("main").innerText();
  if (wanted.length > 1) check(wanted.every((w) => classes.includes(w)) && !["Maternelle", "Primaire", "Collège", "Lycée"].filter((l) => !wanted.includes(l)).some((l) => classes.includes(`${l}\n`)), "filtres de classes : niveaux activés uniquement");
  // Les classes du collège existantes restent présentes (rien n'est supprimé).
  check((await q1("select count(*)::int n from classes c join organizations o on o.id = c.organization_id where o.code = 'DEMO'")).n >= 3, "classes existantes conservées");
  if (n === 4) await shot(admin, "02-lycee-seul-structure");
}

console.log("\n=== TEST 7 — parcours complet + TEST 8 — lycée technique ===");
await saveLevels(admin, ["Maternelle", "Primaire", "Collège", "Lycée"], ["Lycée général", "Lycée technique"]);
check((await schoolLevels()).lycee_tracks.length === 2, "lycée général et technique activés");
await admin.goto(`${base}/structure?onglet=filieres`);
await admin.getByRole("button", { name: /Séries courantes \(technique\)/ }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Ajouter" }).click();
await admin.getByText(/série\(s\) ajoutée\(s\)/).first().waitFor({ timeout: 15000 });
const series = (await db.query("select p.code from programs p join organizations o on o.id = p.organization_id where o.code = 'DEMO' and track_type = 'technical' order by p.code")).rows.map((r) => r.code);
check(["EAA", "F1", "F2", "F3", "F4", "G1", "G2", "G3"].every((c) => series.includes(c)), `séries techniques ajoutées : ${series.join(", ")}`);
const f4 = admin.getByRole("row", { name: /F4/ });
await f4.getByRole("button", { name: "Modifier" }).click();
await admin.getByRole("dialog").getByLabel("Nom").fill("F4 — Génie civil (BTP)");
await admin.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await admin.getByRole("dialog").waitFor({ state: "detached" });
check((await q1("select p.name from programs p join organizations o on o.id = p.organization_id where o.code = 'DEMO' and p.code = 'F4'")).name === "F4 — Génie civil (BTP)", "série renommée");
await admin.getByRole("row", { name: /EAA/ }).getByRole("button", { name: "Désactiver" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Désactiver" }).click();
await admin.getByRole("dialog").waitFor({ state: "detached" });
check((await q1("select p.is_active from programs p join organizations o on o.id = p.organization_id where o.code = 'DEMO' and p.code = 'EAA'")).is_active === false, "série désactivée (conservée)");
await admin.getByRole("button", { name: "Nouvelle série ou filière" }).click();
let dlg = admin.getByRole("dialog");
await dlg.getByLabel("Nom").fill("Électrotechnique industrielle");
await dlg.getByLabel("Code").fill("ETI");
await dlg.getByLabel("Enseignement").selectOption("technical");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
check(Boolean(await q1("select 1 from programs p join organizations o on o.id = p.organization_id where o.code = 'DEMO' and p.code = 'ETI' and track_type = 'technical'")), "nouvelle filière créée");
await shot(admin, "03-series-lycee-technique");

// Matière propre à F4 + lycée ; matière du primaire.
await admin.goto(`${base}/structure?onglet=matieres`);
await admin.getByRole("button", { name: "Nouvelle matière" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Nom").fill("Résistance des matériaux");
await dlg.getByLabel("Code").fill("RDM");
await dlg.getByLabel(/Série \/ filière/).selectOption({ label: "F4 — F4 — Génie civil (BTP)" });
await dlg.getByLabel("Niveau : Lycée").check();
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
await admin.getByRole("button", { name: "Nouvelle matière" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Nom").fill("Éveil scientifique");
await dlg.getByLabel("Code").fill("EVEIL");
await dlg.getByLabel("Niveau : Primaire").check();
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const rdm = await q1("select s.school_cycles, p.code from subjects s join organizations o on o.id = s.organization_id left join programs p on p.id = s.program_id where o.code = 'DEMO' and s.code = 'RDM'");
check(rdm?.school_cycles?.join() === "lycee" && rdm.code === "F4", "RDM : lycée + série F4");
await admin.goto(`${base}/structure?onglet=matieres&niveau=primaire`);
let t = await admin.locator("main").innerText();
check(t.includes("Éveil scientifique") && !t.includes("Résistance des matériaux"), "filtre Primaire : pas de matière de F4");
await shot(admin, "04-matieres-par-niveau");
// Classe de 6e : la matière de F4 n'est pas proposée.
const sixieme = await q1("select c.id from classes c join organizations o on o.id = c.organization_id join levels l on l.id = c.level_id where o.code = 'DEMO' and l.school_cycle = 'college' limit 1");
await admin.goto(`${base}/classes/${sixieme.id}`);
await admin.getByRole("button", { name: "Matière", exact: true }).click();
const subjects = await admin.getByRole("dialog").locator("select[name=subject_id] option").allTextContents();

check(!subjects.includes("Résistance des matériaux") && !subjects.includes("Éveil scientifique") && subjects.includes("Mathématiques"), "classe de collège : ni matière de F4 ni du primaire, matières communes présentes");
await admin.keyboard.press("Escape");

console.log("\n=== TEST 9 — autre établissement, autre configuration (inscription) ===");
const signup = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${Date.now() % 250}` } })).newPage();
await signup.goto(`${base}/inscription`);
await signup.getByLabel("Type *").selectOption("high_school");
const checked = await signup.locator('input[name^="level_"]:checked').evaluateAll((els) => els.map((e) => e.getAttribute("name")));
check(checked.join() === "level_lycee", "inscription d'un lycée : Lycée coché par défaut");
await signup.locator('input[name="track_technical"]').check();
await signup.locator('input[name="track_general"]').uncheck();
const stamp = Date.now();
await signup.getByLabel("Nom de l'établissement *").fill(`Lycée Technique ${stamp}`);
await signup.getByLabel("Prénom *").fill("Aïcha");
await signup.getByLabel("Nom *", { exact: true }).fill("DOSSOU");
await signup.getByLabel("Adresse e-mail *").fill(`proviseur.${stamp}@lycee.neoscol.app`);
await signup.getByLabel("Mot de passe *").fill("Lycee-Technique-2026");
await signup.getByLabel("Confirmation *").fill("Lycee-Technique-2026");
await signup.getByLabel(/J'accepte les conditions/).check();
await signup.getByRole("button", { name: /Commencer mon essai gratuit/i }).click();
await signup.waitForURL(/abonnement/, { timeout: 60000 });
const other = await q1("select settings->'school' s from organizations where name = $1", [`Lycée Technique ${stamp}`]);
check(other.s.levels.join() === "lycee" && other.s.lycee_tracks.join() === "technical", "nouvel établissement : Lycée technique uniquement");
check((await schoolLevels()).levels.length === 4, "configuration de DEMO inchangée (isolation)");
await signup.goto(`${base}/structure?onglet=filieres`);
t = await signup.locator("main").innerText();
check(!t.includes("F4 — Génie civil (BTP)") && !t.includes("ETI"), "le nouvel établissement ne voit pas les séries de DEMO");
check((await nav(signup)).includes("Séries et filières"), "menu du lycée technique : « Séries et filières »");

console.log("\n=== TEST 12 — permissions ===");
const teacher = await login("enseignant@demo.neoscol.app");
const r = await teacher.goto(`${base}/parametres/etablissement`);
check(r.status() === 404, "enseignant : paramètres des niveaux inaccessibles");
check(!(await nav(teacher)).includes("Séries et filières"), "enseignant : pas de gestion des séries dans le menu");

console.log("\n=== Centre de formation et université inchangés ===");
const formation = await login("formation@demo.neoscol.app");
await formation.goto(`${base}/structure?onglet=filieres`);
t = await formation.locator("main").innerText();
check(t.includes("Filières et formations") && !t.includes("Séries et filières du lycée"), "centre de formation : écran des formations inchangé");
await formation.goto(`${base}/parametres/etablissement`);
check(!(await formation.getByText("Module scolaire").count()), "centre de formation : pas de carte Module scolaire");

// Remise au parcours complet (général) pour les autres tests.
await saveLevels(admin, ["Maternelle", "Primaire", "Collège", "Lycée"], ["Lycée général"]);
const mobile = await login("admin@demo.neoscol.app", { width: 390, height: 844 });
await mobile.goto(`${base}/parametres/etablissement`);
await shot(mobile, "05-niveaux-mobile");

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nMODULE SCOLAIRE E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
