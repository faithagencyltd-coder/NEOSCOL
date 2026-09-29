// P7g — Assistant IA, de bout en bout : clé Claude comme intégration de la
// console (Super Admin), quota IA par défaut et par établissement, nouveaux
// outils (fiche élève, passage d'année), réponses dans la limite des droits,
// consommation journalisée sans contenu. Sans clé : moteur local. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-assistant-ia";
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
async function login(identifier, viewport = { width: 1280, height: 860 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
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
async function ask(page, question) {
  const before = await page.locator('[data-role="assistant"]').count().catch(() => 0);
  await page.getByPlaceholder(/Ex\. : qui a des impayés/).fill(question);
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-role="assistant"]').length > n, before, { timeout: 30000 });
  return (await page.locator('[data-role="assistant"]').last().innerText()).replace(/[  ]/g, " ");
}

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const reset = async () => {
  await db.query("delete from assistant_usage where organization_id = $1", [DEMO]);
  await db.query("update messaging_settings set default_ai_limit = 300 where id = 1");
  await db.query("update messaging_quotas set ai_limit = null where organization_id = $1", [DEMO]);
};
await reset();
const pupil = await q1("select matricule, last_name, first_name from students where organization_id = $1 and status = 'active' order by matricule limit 1", [DEMO]);

console.log("\n=== 1. Console : clé Claude et quota IA ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/integrations`);
let t = await text(sa);
check(t.includes("Claude (Anthropic) — assistant IA") && t.includes("Clé API Claude"), "intégration Claude dans la console (clé saisie ici, chiffrée)");
check(t.includes("Assistant IA — consommation du mois"), "consommation IA par établissement affichée");
await sa.getByRole("button", { name: "Quota par défaut" }).click();
await dialog(sa).getByLabel(/Questions Claude par établissement/).fill("250");
await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
await dialog(sa).waitFor({ state: "detached" });
check((await q1("select default_ai_limit from messaging_settings where id = 1")).default_ai_limit === 250, "quota IA par défaut : 250 questions / mois");
await sa.getByRole("button", { name: /Quota IA de Groupe Scolaire Démo/ }).click();
await dialog(sa).getByLabel(/Questions Claude par mois/).fill("40");
await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
await dialog(sa).waitFor({ state: "detached" });
check((await q1("select ai_limit from messaging_quotas where organization_id = $1", [DEMO])).ai_limit === 40, "dérogation pour l'établissement démo : 40");
await sa.reload();
check((await text(sa)).includes("Dérogation"), "dérogation signalée dans le tableau");
await shot(sa, "01-console-ia");

console.log("\n=== 2. Assistant (moteur local sans clé) : nouveaux outils ===");
const admin = await login("admin@demo.neoscol.app");
await admin.goto(`${base}/assistant`);
check((await text(admin)).includes("administration de la plateforme configure Claude"), "sans clé : moteur local annoncé, aucune variable d'environnement à régler");
let answer = await ask(admin, `fiche ${pupil.matricule}`);
check(answer.includes(`${pupil.last_name} ${pupil.first_name} (${pupil.matricule})`) && answer.includes("Absences"), "fiche élève : identité, classe, absences");
answer = await ask(admin, "Où en est le passage à l'année suivante ?");
check(/élève\(s\) inscrit\(s\) cette année/.test(answer) && answer.includes("À décider"), "passage d'année : décisions et réinscriptions résumées");
answer = await ask(admin, "Derniers envois SMS ?");
check(/envoi groupé|envoyé\(s\)/.test(answer), "envois groupés consultables");
await shot(admin, "02-assistant");
const usage = await q1("select count(*)::int as n, bool_and(provider = 'local') as local from assistant_usage where organization_id = $1", [DEMO]);
check(usage.n >= 3 && usage.local, "consommation journalisée (réponses locales, hors quota Claude)");
const audit = await q1("select count(*)::int as n from audit_logs where organization_id = $1 and action = 'assistant.question'", [DEMO]);
check(audit.n >= 3, "questions tracées dans le journal d'audit");

console.log("\n=== 3. Droits : l'assistant ne voit jamais plus que l'utilisateur ===");
const secretary = await login("secretariat@demo.neoscol.app");
const res = await secretary.goto(`${base}/assistant`);
if (res.status() === 404) {
  check(true, "secrétariat sans l'assistant : page inaccessible");
} else {
  answer = await ask(secretary, "Où en est le passage à l'année suivante ?");
  check(answer.includes("Accès refusé"), "secrétariat : passage d'année refusé (réservé à la direction)");
}
const teacher = await login("enseignant@demo.neoscol.app");
const tres = await teacher.goto(`${base}/assistant`);
check(tres.status() === 404 || (await ask(teacher, "Liste les impayés")).match(/Aucune facture|indisponibles|refusé/) !== null, "enseignant : pas d'accès aux impayés via l'assistant");

await reset();
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nASSISTANT IA E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
