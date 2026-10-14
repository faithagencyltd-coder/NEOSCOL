// NEOSCOOL — Saisie simple des notes : l'école règle le nombre d'interrogations (INT)
// et de devoirs (DEV), l'enseignant choisit INT 3 et saisit, le bulletin affiche
// ces colonnes ; PDF et récapitulatif annuel. La configuration initiale est restaurée.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-calcul-bulletins";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const ORG = "10000000-0000-4000-a000-000000000001";
const initial = (await db.query("select config from report_card_settings where organization_id = $1", [ORG])).rows[0].config;
let createdSlot = null;

const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fr-FR" });
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));

try {
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill("admin@demo.neoscol.app");
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });

  console.log("\n=== 1. Réglages : saisie simple (3 INT, 2 DEV) ===");
  await page.goto(`${base}/bulletins/configuration`);
  const slotsCard = page.getByTestId("rc-slots");
  check(await slotsCard.isVisible(), "carte « Notes de chaque matière » affichée en premier");
  check((await page.locator("#slots-trimester-interro").inputValue()) === "3" && (await page.locator("#slots-trimester-devoir").inputValue()) === "2", "3 interrogations et 2 devoirs par trimestre");
  const formula = () => page.getByTestId("rc-slots-formula").innerText();
  check(/Moyenne interro = \(INT 1 \+ INT 2 \+ INT 3\) ÷ 3/.test(await formula()), "formule des interrogations en clair");
  check(/Moyenne de la matière = \(Moyenne interro \+ DEV 1 \+ DEV 2\) ÷ 3/.test(await formula()), "formule de la matière en clair");
  check(!(await page.getByTestId("rc-groups").isVisible().catch(() => false)), "réglages techniques (groupes) masqués");
  await page.screenshot({ path: `${out}/01-reglages.png`, fullPage: true });

  console.log("\n=== 2. L'école passe à 1 devoir par trimestre ===");
  await page.locator("#slots-trimester-devoir").fill("1");
  check(/\(Moyenne interro \+ DEV 1\) ÷ 2/.test(await formula()), "formule recalculée en direct (÷ 2)");
  await page.getByRole("button", { name: "Enregistrer la configuration" }).click();
  await page.getByText(/Configuration enregistrée/).first().waitFor({ timeout: 15000 });
  const saved = (await db.query("select config from report_card_settings where organization_id = $1", [ORG])).rows[0].config;
  check(saved.slots?.trimester?.devoir === 1 && saved.slots?.trimester?.interro === 3, "réglage enregistré en base (3 INT, 1 DEV)");

  console.log("\n=== 3. Enseignant : choisir INT 3 et saisir les notes ===");
  const [book] = (
    await db.query(
      `select cs.id from class_subjects cs join classes c on c.id = cs.class_id join subjects s on s.id = cs.subject_id
       join academic_years y on y.id = c.academic_year_id where c.organization_id = $1 and y.is_current and c.name = '6e A' and s.code = 'MATH'`,
      [ORG],
    )
  ).rows;
  const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
  const teacher = await teacherContext.newPage();
  teacher.on("pageerror", (e) => problems.push(e.message));
  await teacher.goto(`${base}/connexion`);
  await teacher.getByLabel("Adresse e-mail ou matricule").fill("enseignant@demo.neoscol.app");
  await teacher.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await teacher.getByRole("button", { name: "Se connecter", exact: true }).click();
  await teacher.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });
  await teacher.goto(`${base}/notes/${book.id}`);
  const picker = teacher.getByTestId("slot-picker");
  await picker.waitFor({ timeout: 15000 });
  const pickerText = await picker.innerText();
  check(["INT 1", "INT 2", "INT 3", "DEV 1"].every((l) => pickerText.includes(l)) && !pickerText.includes("DEV 2"), "cases INT 1, INT 2, INT 3, DEV 1 proposées (réglage de l'école)");
  check(!(await teacher.getByRole("button", { name: "Nouvelle évaluation" }).isVisible().catch(() => false)), "plus de formulaire « Nouvelle évaluation »");
  await teacher.screenshot({ path: `${out}/03-enseignant-cases.png`, fullPage: true });
  await picker.getByRole("button", { name: /INT 3/ }).click();
  await teacher.waitForURL(/\/notes\/evaluations\//, { timeout: 15000 });
  check((await teacher.locator("h1").innerText()).trim() === "INT 3", "grille de saisie « INT 3 » ouverte");
  await teacher.getByLabel(/^Note de /).first().fill("15");
  await teacher.getByRole("button", { name: "Enregistrer les notes" }).click();
  await teacher.getByText(/note\(s\) enregistrée\(s\)/).first().waitFor({ timeout: 15000 });
  createdSlot = (
    await db.query("select a.id, count(g.*) as n from assessments a left join grades g on g.assessment_id = a.id where a.class_subject_id = $1 and a.column_key = 'interro' and a.slot = 3 group by a.id", [book.id])
  ).rows[0];
  check(createdSlot && Number(createdSlot.n) >= 1, "note enregistrée dans la case INT 3");
  await teacher.screenshot({ path: `${out}/04-enseignant-saisie.png`, fullPage: true });
  await teacherContext.close();

  console.log("\n=== 4. Bulletin : colonnes de l'école ===");
  await page.goto(`${base}/bulletins`);
  await page.getByRole("button", { name: /^(Re)?[Cc]alculer/ }).first().click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Calculer" }).click();
  await page.waitForTimeout(1500);
  await page.goto(`${base}/bulletins/apercu`);
  await page.getByText(/Moyenne générale :/).waitFor({ timeout: 15000 });
  const headers = (await page.locator("table thead th").allInnerTexts()).map((t) => t.trim());
  const at = (label) => headers.findIndex((h) => h.toUpperCase() === label.toUpperCase());
  const order = ["INT 1", "INT 2", "INT 3", "MOYEN INTERRO", "DEV 1", "MOY.", "COEF.", "Points", "Moy. cl.", "Min / Max", "Enseignant", "Appréciation"].map(at);
  check(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `colonnes du bulletin dans l'ordre (${headers.join(" | ")})`);
  check(at("COMPO 1") === -1, "pas de colonne COMPO");
  await page.screenshot({ path: `${out}/02-apercu-detail.png`, fullPage: true });

  console.log("\n=== 3 bis. PDF du bulletin ===");
  const [rc] = (
    await db.query(
      `select rc.id from report_cards rc join academic_periods p on p.id = rc.academic_period_id
       join academic_years y on y.id = p.academic_year_id
       where rc.organization_id = $1 and y.is_current and p.sequence = 1 order by rc.average desc nulls last limit 1`,
      [ORG],
    )
  ).rows;
  const pdf = await page.request.get(`${base}/api/documents/bulletins/${rc.id}`);
  const body = await pdf.body();
  check(pdf.status() === 200 && body.subarray(0, 5).toString() === "%PDF-", "PDF du bulletin généré");
  writeFileSync(`${out}/bulletin.pdf`, body);

  console.log("\n=== 5. Récapitulatif annuel : seulement sur le dernier trimestre ===");
  const periods = (
    await db.query(
      "select p.id, p.sequence from academic_periods p join academic_years y on y.id = p.academic_year_id where p.organization_id = $1 and y.is_current order by p.sequence",
      [ORG],
    )
  ).rows;
  await page.goto(`${base}/bulletins/apercu?periode=${periods[0].id}`);
  await page.getByText(/Moyenne générale :/).waitFor({ timeout: 15000 });
  check((await page.getByTestId("recap-annuel").count()) === 0, "1er trimestre : pas de récapitulatif annuel ni de décision");
  await page.goto(`${base}/bulletins/apercu?periode=${periods.at(-1).id}`);
  const recap = page.getByTestId("recap-annuel");
  await recap.waitFor({ timeout: 15000 });
  const recapText = await recap.innerText();
  check(/RÉCAPITULATIF ANNUEL/.test(recapText) && /1er trimestre/.test(recapText) && /3e trimestre/.test(recapText), "dernier trimestre : moyennes T1, T2, T3 affichées");
  check(/Moyenne générale annuelle/.test(recapText), "dernier trimestre : moyenne générale annuelle affichée");
  check(/Année incomplète/.test(recapText), "trimestres sans notes signalés (année incomplète)");
  await page.screenshot({ path: `${out}/03-recapitulatif-annuel.png`, fullPage: true });
} finally {
  await db.query("update report_card_settings set config = $2 where organization_id = $1", [ORG, initial]);
  if (createdSlot) await db.query("delete from assessments where id = $1", [createdSlot.id]);
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
