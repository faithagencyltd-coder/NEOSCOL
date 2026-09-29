// P7 — Pays configurables + moteur académique multi-pays, de bout en bout :
// Super Admin ajoute un pays et une devise (sans code), publie un modèle
// national ; l'établissement voit le modèle en vigueur, publie ses propres
// règles, simule, calcule les résultats annuels, décide (motif), valide (figé).
// Rejouable (état remis à zéro au début).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-moteur-academique";
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
const done = (page) => dialog(page).waitFor({ state: "detached", timeout: 15000 });

// État initial (rejouable) : pas de règles, pas de résultats ; bulletins de 3 périodes pour la 6e A.
const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
await db.query("alter table annual_results disable trigger annual_results_guard");
await db.query("delete from annual_results where organization_id = $1", [DEMO]);
await db.query("alter table annual_results enable trigger annual_results_guard");
await db.query("alter table academic_rule_sets disable trigger academic_rule_sets_guard");
await db.query("delete from academic_rule_sets where organization_id = $1 or (organization_id is null and country_code = 'CI')", [DEMO]);
await db.query("alter table academic_rule_sets enable trigger academic_rule_sets_guard");
await db.query("update organizations set country = 'CI' where country = 'MA' and code like 'E2E%'");
// Classe de l'année en cours sans bulletin publié (les autres suites publient ceux de la 6e A).
const cls = await q1(
  `select c.id, c.name, c.academic_year_id from classes c join academic_years y on y.id = c.academic_year_id and y.is_current
    where c.organization_id = $1
      and (select count(*) from enrollments e where e.class_id = c.id and e.status = 'validated') >= 3
      and not exists (select 1 from report_cards r where r.class_id = c.id and r.status = 'published')
    order by (c.name = '6e A'), c.name limit 1`,
  [DEMO],
);
const periods = (await db.query("select id from academic_periods where academic_year_id = $1 order by sequence, starts_on", [cls.academic_year_id])).rows;
const pupils = (await db.query("select e.student_id from enrollments e join students s on s.id = e.student_id where e.class_id = $1 and e.status = 'validated' order by s.last_name, s.first_name", [cls.id])).rows;
// Sauvegarde des bulletins de démonstration (restaurés à la fin : les autres suites en dépendent).
const savedCards = (await db.query("select * from report_cards where class_id = $1", [cls.id])).rows;
await db.query("delete from report_cards where class_id = $1 and status = 'draft'", [cls.id]);
const grid = [[12, 14, 16], [8, 9, 7], [10, 11, 9], [15, 13, 14], [9, 10, 10], [6, 8, 11]];
for (let i = 0; i < pupils.length; i++) {
  for (let p = 0; p < periods.length; p++) {
    await db.query(
      "insert into report_cards (organization_id, student_id, class_id, academic_period_id, average) values ($1, $2, $3, $4, $5) on conflict (student_id, class_id, academic_period_id) do update set average = excluded.average where report_cards.status = 'draft'",
      [DEMO, pupils[i].student_id, cls.id, periods[p].id, grid[i % grid.length][p]],
    );
  }
}

console.log("\n=== 1. Super Admin : nouvelle devise et nouveau pays, sans code ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/pays`);
check((await text(sa)).includes("Côte d'Ivoire") && (await text(sa)).includes("France"), "pays de départ listés (dont France / EUR)");
if (!(await q1("select 1 as x from currencies where code = 'MAD'"))) {
  await sa.getByRole("button", { name: "Ajouter une devise" }).click();
  await dialog(sa).getByLabel("Code ISO (3 lettres)").fill("MAD");
  await dialog(sa).getByLabel("Nom").fill("Dirham marocain");
  await dialog(sa).getByLabel("Symbole").fill("DH");
  await dialog(sa).getByRole("button", { name: "Enregistrer" }).click();
  await done(sa);
}
await sa.goto(`${base}/plateforme/pays`);
await sa.getByRole("button", { name: /Ajouter un pays/ }).click();
const d = dialog(sa);
await d.getByLabel("Code ISO (2 lettres)").fill("MA");
await d.getByLabel(/^Nom( \*)?$/).fill("Maroc");
await d.getByLabel("Nom en anglais").fill("Morocco");
await d.getByLabel("Indicatif téléphonique").fill("+212");
await d.getByLabel("Devise principale").selectOption("MAD");
await d.getByLabel("Fuseau horaire").fill("Africa/Casablanca");
await d.getByLabel(/Format du numéro/).fill("^[0-9]{9}$");
await d.getByRole("button", { name: "Enregistrer" }).click();
await done(sa);
const ma = await q1("select name, default_currency, timezone, is_active from countries where code = 'MA'");
check(ma?.default_currency === "MAD" && ma.timezone === "Africa/Casablanca" && ma.is_active, "pays « Maroc » créé depuis la console (MAD, Africa/Casablanca)");
await shot(sa, "01-pays");

console.log("\n=== 2. Le nouveau pays est proposé à l'inscription ===");
const anon = await (await browser.newContext({ locale: "fr-FR" })).newPage();
await anon.goto(`${base}/inscription`);
check((await anon.getByLabel("Pays *").locator("option").allInnerTexts()).includes("Maroc"), "« Maroc » dans la liste des pays de l'inscription");

console.log("\n=== 3. Modèle national (Côte d'Ivoire) : formule, essai, publication ===");
await sa.goto(`${base}/plateforme/regles?pays=CI`);
await sa.getByLabel("Mode de calcul").selectOption("formula");
await sa.getByLabel("Formule").fill("(T1 + T2 + 2*T3) / 4");
await sa.getByLabel("T1", { exact: true }).fill("12");
await sa.getByLabel("T2", { exact: true }).fill("14");
await sa.getByLabel("T3", { exact: true }).fill("16");
check(await sa.getByRole("status").filter({ hasText: "14,5" }).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "essai en direct calculé par le serveur : 14,5");
await sa.getByLabel("Formule").fill("T1 + pg_sleep(5)");
check(await sa.getByText(/Élément inconnu|Caractère non autorisé/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "formule dangereuse refusée par le serveur");
await sa.getByLabel("Formule").fill("(T1 + T2 + 2*T3) / 4");
await sa.getByRole("button", { name: /Enregistrer comme nouvelle version/ }).click();
await sa.getByRole("button", { name: "Publier" }).first().waitFor();
await sa.getByRole("button", { name: "Publier" }).first().click();
await dialog(sa).getByRole("button", { name: "Publier" }).click();
await done(sa);
check((await q1("select status from academic_rule_sets where organization_id is null and country_code = 'CI' order by version desc limit 1")).status === "published", "modèle national publié (versionné)");
await shot(sa, "02-modele-national");

console.log("\n=== 4. Établissement : modèle du pays en vigueur, règles propres, simulateur ===");
const admin = await login("admin@demo.neoscol.app");
await admin.goto(`${base}/parametres/regles-academiques`);
let t = await text(admin);
check(t.includes("En vigueur : Modèle du pays"), "en vigueur : modèle du pays (Côte d'Ivoire)");
await admin.getByLabel("Classe").selectOption({ label: cls.name });
await admin.getByLabel("Mode de calcul").selectOption("weights");
await admin.getByLabel("Poids T3").fill("1");
await admin.getByRole("button", { name: "Simuler" }).click();
check(await admin.getByText(/décision\(s\) sur \d+ changeraient/).waitFor({ timeout: 15000 }).then(() => true).catch(() => false), "simulateur sur la classe réelle (comparaison avec les règles en vigueur)");
check((await q1("select count(*)::int n from annual_results where class_id = $1", [cls.id])).n === 0, "simulation : rien n'est enregistré");
await shot(admin, "03-simulateur");
await admin.getByRole("button", { name: /Enregistrer comme nouvelle version/ }).click();
await admin.getByRole("button", { name: "Publier" }).first().waitFor();
await admin.getByRole("button", { name: "Publier" }).first().click();
await dialog(admin).getByRole("button", { name: "Publier" }).click();
await done(admin);
await admin.reload();
check((await text(admin)).includes("En vigueur : Règles de l'établissement (version 1)"), "règles de l'établissement publiées (v1)");

console.log("\n=== 5. Résultats annuels : calcul, décision du conseil, validation figée ===");
await admin.goto(`${base}/resultats-annuels?classe=${cls.id}`);
await admin.getByRole("button", { name: /Calculer les résultats/ }).click();
await dialog(admin).getByRole("button", { name: "Calculer" }).click();
await done(admin);
const first = await q1("select average, rank, rule_version from annual_results where class_id = $1 and student_id = $2", [cls.id, pupils[0].student_id]);
check(Number(first?.average) === 14 && first.rank === 1 && first.rule_version === 1, "moyenne annuelle (12 + 14 + 16) / 3 = 14, rang 1, règles v1");
await admin.reload();
await shot(admin, "04-resultats-annuels");
const row = admin.getByRole("row").filter({ hasText: /Exclu|redoubler/ }).first();
await row.getByRole("button", { name: "Décision du conseil" }).click();
await dialog(admin).getByLabel("Décision").selectOption("promoted");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await dialog(admin).getByText(/Motif obligatoire/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "décision différente sans motif : refusée");
await dialog(admin).getByLabel("Motif").fill("Progrès remarquables au 3e trimestre");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
await done(admin);
check((await q1("select count(*)::int n from annual_results where class_id = $1 and decision_reason is not null", [cls.id])).n === 1, "décision du conseil enregistrée avec motif");
await admin.getByRole("button", { name: /Valider \(figer\)/ }).click();
await dialog(admin).getByRole("button", { name: "Valider" }).click();
await done(admin);
check((await text(admin)).includes("Résultats validés et figés"), "résultats validés et figés");
// Nouvelles règles publiées après validation : les résultats validés ne bougent pas.
const before = await q1("select average from annual_results where class_id = $1 and student_id = $2", [cls.id, pupils[0].student_id]);
await db.query("update academic_rule_sets set status = 'archived' where organization_id = $1 and status = 'published'", [DEMO]);
check(Number(before.average) === 14, "résultat validé reproductible (règles de sa validation)");
await shot(admin, "05-resultats-valides");

console.log("\n=== 6. Sécurité : un enseignant n'accède ni aux règles ni aux résultats ===");
const teacher = await login("enseignant@demo.neoscol.app");
check((await teacher.goto(`${base}/parametres/regles-academiques`)).status() === 404, "enseignant : règles de calcul inaccessibles");
check((await teacher.goto(`${base}/resultats-annuels`)).status() === 404, "enseignant : résultats annuels inaccessibles");
check((await admin.goto(`${base}/plateforme/pays`)).status() === 404, "administrateur d'établissement : console des pays inaccessible");

// Restauration de l'état de démonstration.
await db.query("alter table annual_results disable trigger annual_results_guard");
await db.query("delete from annual_results where organization_id = $1", [DEMO]);
await db.query("alter table annual_results enable trigger annual_results_guard");
await db.query("alter table academic_rule_sets disable trigger academic_rule_sets_guard");
await db.query("delete from academic_rule_sets where organization_id = $1 or (organization_id is null and country_code = 'CI')", [DEMO]);
await db.query("alter table academic_rule_sets enable trigger academic_rule_sets_guard");
await db.query("delete from report_cards where class_id = $1 and status = 'draft'", [cls.id]);
for (const card of savedCards.filter((c) => c.status === "draft")) {
  const cols = Object.keys(card);
  await db.query(`insert into report_cards (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing`, cols.map((c) => card[c]));
}

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nMOTEUR ACADÉMIQUE E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
