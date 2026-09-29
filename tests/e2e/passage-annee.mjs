// P7e — Passage d'année, de bout en bout : préparer 2027-2028, propositions
// selon les décisions annuelles, réinscriptions groupées (en attente),
// archive CSV, clôture (périodes verrouillées, année suivante en cours, fin de
// cycle → ancien élève), droits. L'état de démonstration est restauré.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-passage-annee";
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
const done = (page) => dialog(page).waitFor({ state: "detached", timeout: 20000 });

// Sauvegarde de l'état de démonstration.
const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const cur = await q1("select id, name from academic_years where organization_id = $1 and is_current", [DEMO]);
const lockedBefore = (await db.query("select id from academic_periods where academic_year_id = $1 and is_locked", [cur.id])).rows.map((r) => r.id);
const statusBefore = (await db.query("select id, status from students where organization_id = $1", [DEMO])).rows;
const restore = async () => {
  const later = (await db.query("select id from academic_years where organization_id = $1 and starts_on > (select starts_on from academic_years where id = $2)", [DEMO, cur.id])).rows.map((r) => r.id);
  if (later.length) {
    await db.query("delete from enrollments where academic_year_id = any($1)", [later]);
    await db.query("delete from fee_rates where academic_year_id = any($1)", [later]);
    await db.query("delete from class_subjects where class_id in (select id from classes where academic_year_id = any($1))", [later]);
    await db.query("delete from classes where academic_year_id = any($1)", [later]);
    await db.query("delete from academic_periods where academic_year_id = any($1)", [later]);
    await db.query("update academic_years set is_current = false where id = any($1)", [later]);
    await db.query("delete from academic_years where id = any($1)", [later]);
  }
  await db.query("update academic_years set is_current = true, status = 'active' where id = $1", [cur.id]);
  await db.query("update academic_periods set is_locked = false, locked_at = null, locked_by = null where academic_year_id = $1 and not (id = any($2))", [cur.id, lockedBefore]);
  for (const s of statusBefore) await db.query("update students set status = $2 where id = $1 and status <> $2", [s.id, s.status]);
  await db.query("alter table annual_results disable trigger annual_results_guard");
  await db.query("delete from annual_results where organization_id = $1 and rules_snapshot = '{\"e2e\": true}'", [DEMO]);
  await db.query("alter table annual_results enable trigger annual_results_guard");
};
await restore();

// Décisions de fin d'année (comme après le conseil de classe) : 6e A admis, 3e A admis (fin de cycle).
const pick = async (className, code) => {
  const row = await q1(
    `select e.student_id, c.id as class_id from enrollments e join classes c on c.id = e.class_id
      where c.academic_year_id = $1 and c.name = $2 and e.status = 'validated' order by e.student_id limit 1`,
    [cur.id, className],
  );
  await db.query(
    `insert into annual_results (organization_id, student_id, class_id, academic_year_id, rules_snapshot, inputs, average, decision_code, decision_label, status)
     values ($1, $2, $3, $4, '{"e2e": true}', '{}', 13.5, $5, $5, 'validated') on conflict (student_id, class_id) do nothing`,
    [DEMO, row.student_id, row.class_id, cur.id, code],
  );
  return row.student_id;
};
const promoted = await pick("6e A", "promoted");
const graduate = await pick("3e A", "promoted");

try {
  console.log("\n=== 1. Préparer l'année suivante ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/passage-annee`);
  let t = await text(admin);
  check(t.includes("Passage d'année") && t.includes("À préparer"), "page : année suivante à préparer");
  check(t.includes("Préparez d'abord l'année suivante"), "réinscriptions bloquées tant que N+1 n'existe pas");
  await admin.getByRole("button", { name: /Préparer l'année suivante/ }).click();
  await dialog(admin).getByRole("button", { name: "Préparer" }).click();
  await done(admin);
  const next = await q1("select id, name, status from academic_years where organization_id = $1 and starts_on > (select starts_on from academic_years where id = $2)", [DEMO, cur.id]);
  check(next?.name === "2027-2028" && next.status === "planned", "année 2027-2028 créée (à venir)");
  const classes = (await q1("select count(*)::int as n from classes where academic_year_id = $1", [next.id])).n;
  check(classes === 4, "classes copiées dans 2027-2028");
  await admin.waitForLoadState("networkidle");
  await admin.reload();

  console.log("\n=== 2. Réinscriptions groupées selon les décisions ===");
  t = await text(admin);
  check(t.includes("Passage") && t.includes("Fin de cycle") && t.includes("À décider"), "décisions affichées (passage, fin de cycle, à décider)");
  const row = admin.locator('tr[data-action="promote"]').first();
  check((await row.getByRole("combobox").locator("option:checked").innerText()) === "5e A", "admis en 6e A → 5e A proposée");
  check(await row.getByRole("checkbox").isChecked(), "élève admis coché d'office");
  check(!(await admin.locator('tr[data-action="undecided"]').first().getByRole("checkbox").isChecked()), "élève sans décision non coché");
  // Réinscrire aussi un élève à décider, en choisissant la classe.
  const undecided = admin.locator('tr[data-action="undecided"]').filter({ has: admin.locator("td:nth-child(3)", { hasText: /^6e B$/ }) }).first();
  await undecided.getByRole("checkbox").check();
  await shot(admin, "01-propositions");
  await admin.getByRole("button", { name: /Créer 2 réinscription/ }).click();
  await admin.getByText(/2 réinscription\(s\) créée\(s\) pour 2027-2028/).first().waitFor({ timeout: 15000 });
  const created = await db.query("select student_id, type, status, (select name from classes where id = class_id) as cls from enrollments where academic_year_id = $1", [next.id]);
  check(created.rows.length === 2 && created.rows.every((e) => e.type === "reenrollment" && e.status === "pending"), "2 réinscriptions « en attente » (validation par le circuit habituel)");
  check(created.rows.some((e) => e.student_id === promoted && e.cls === "5e A"), "élève admis réinscrit en 5e A");
  await admin.reload();
  check((await admin.locator('[aria-label="Déjà réinscrit(e)"]').count()) === 2, "élèves réinscrits signalés, non resélectionnables");

  console.log("\n=== 3. Archive de l'année ===");
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("row", { name: new RegExp(cur.name) }).getByRole("link", { name: "Exporter" }).click()]);
  await download.saveAs(`${out}/archive.csv`);
  const lines = readFileSync(`${out}/archive.csv`, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  check(lines[0].startsWith("Matricule;Nom;Prénom;Date de naissance;Classe;Moyenne annuelle"), "archive : colonnes");
  check(lines.some((l) => l.includes("13,5") && l.includes("Validé")), "archive : moyenne et décision validée");

  console.log("\n=== 4. Clôture ===");
  await admin.getByRole("button", { name: `Clôturer ${cur.name}` }).click();
  check(await dialog(admin).getByText(/élève\(s\) en fin de cycle non réinscrits au statut « ancien élève »/).isVisible(), "option fin de cycle proposée");
  await dialog(admin).getByRole("button", { name: "Clôturer l'année" }).click();
  await done(admin);
  const years = (await db.query("select name, status, is_current from academic_years where id = any($1) order by starts_on", [[cur.id, next.id]])).rows;
  check(years[0].status === "closed" && !years[0].is_current && years[1].is_current && years[1].status === "active", `${cur.name} clôturée, 2027-2028 en cours`);
  check((await q1("select count(*)::int as n from academic_periods where academic_year_id = $1 and not is_locked", [cur.id])).n === 0, "périodes de l'année close verrouillées");
  check((await q1("select status from students where id = $1", [graduate])).status === "alumni", "fin de cycle → ancien élève");
  check((await q1("select count(*)::int as n from enrollments where academic_year_id = $1 and status = 'validated'", [cur.id])).n > 0, "inscriptions de l'année close conservées");
  await admin.goto(`${base}/passage-annee`);
  t = await text(admin);
  check(t.includes("Clôturée") && /Année en cours\s*2027-2028/.test(t), "page : nouvelle année en cours, ancienne clôturée");
  await shot(admin, "02-apres-cloture");
  const mobile = await login("admin@demo.neoscol.app", { width: 390, height: 844 });
  await mobile.goto(`${base}/passage-annee`);
  await shot(mobile, "03-mobile");

  console.log("\n=== 5. Droits ===");
  const teacher = await login("enseignant@demo.neoscol.app");
  check((await teacher.goto(`${base}/passage-annee`)).status() === 404, "enseignant : passage d'année inaccessible");
  check((await teacher.goto(`${base}/api/archives/annee/${cur.id}`)).status() === 403, "enseignant : archive refusée");
} finally {
  await restore();
}
check((await q1("select is_current from academic_years where id = $1", [cur.id])).is_current, "état de démonstration restauré");
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nPASSAGE D'ANNÉE E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
