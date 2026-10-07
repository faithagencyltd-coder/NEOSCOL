// NEOSCOOL — Fiche élève / étudiant / apprenant : en-tête (photo, badges, infos),
// 5 cartes chiffrées, onglets principaux + « Plus », Échéancier, Paiements,
// caisse ouverte sur la personne, actions regroupées dans « ⋯ » (trois modules).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-fiche-eleve";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];

async function login(email, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${email}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(email);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
const studentWithBalance = (email) =>
  q1(
    `select s.id, s.last_name, s.matricule, sum(b.total) total, sum(b.paid) paid, sum(b.balance) balance
       from students s join invoice_balances b on b.student_id = s.id and b.status = 'issued'
      where s.archived_at is null and s.status = 'active'
        and s.organization_id = (select m.organization_id from memberships m join auth.users u on u.id = m.user_id where u.email = $1 limit 1)
      group by s.id having sum(b.balance) > 0 order by s.matricule limit 1`,
    [email],
  );
const fcfa = (n) => new Intl.NumberFormat("fr-FR").format(Number(n)).replace(/\s/g, " ");

for (const [module, email, badge] of [["Scolaire", "admin@demo.neoscol.app", "Scolaire"], ["Formation", "formation@demo.neoscol.app", "Formation pro"], ["Université", "universite@demo.neoscol.app", "Université"]]) {
  console.log(`\n=== ${module} ===`);
  const s = await studentWithBalance(email);
  const page = await login(email);
  await page.goto(`${base}/eleves/${s.id}`);
  const header = page.getByTestId("dossier-header");
  check((await header.innerText()).includes(badge), `${module} : badge du module`);
  check((await page.getByTestId("dossier-facts").innerText()).includes(s.matricule), `${module} : matricule dans l'en-tête`);
  const kpis = (await page.getByTestId("dossier-kpis").innerText()).replace(/\s/g, " ");
  check(kpis.includes("Total dû") && kpis.includes(fcfa(s.total)) && kpis.includes(fcfa(s.balance)) && kpis.includes("Recouvrement"), `${module} : cartes chiffrées (total ${fcfa(s.total)}, reste ${fcfa(s.balance)})`);
  check(await page.getByTestId("overview-tab").isVisible(), `${module} : Aperçu par défaut`);
  const nav = page.getByRole("navigation", { name: "Sections du dossier" });
  check((await nav.evaluate((n) => n.scrollWidth - n.clientWidth)) <= 1, `${module} : onglets sans barre de défilement`);
  for (const t of ["Aperçu", "Informations", "Inscription", "Parent / Tuteur", "Paiements", "Échéancier", "Présences", "Documents"]) {
    check((await nav.getByRole("link", { name: new RegExp(`^${t}`) }).count()) >= 1, `${module} : onglet ${t}`);
  }
  await page.getByTestId("tab-more").click();
  check((await page.getByRole("menuitem", { name: "Historique" }).count()) === 1, `${module} : « Plus » regroupe les autres onglets`);
  await page.keyboard.press("Escape");
  await nav.getByRole("link", { name: /^Échéancier/ }).click();
  await page.getByTestId("schedule-tab").waitFor();
  check((await page.getByTestId("schedule-tab").locator("tbody tr").count()) >= 1, `${module} : échéancier`);
  await page.getByTestId("more-actions").click();
  check(await page.getByRole("menu", { name: "Actions du dossier" }).getByRole("link", { name: "Modifier" }).isVisible(), `${module} : « ⋯ » contient Modifier`);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${out}/${module}.png`, fullPage: true });
  if (module === "Scolaire") {
    // Caisse depuis la fiche : ouverte directement sur l'élève.
    await header.getByTestId("cashier-open").click();
    const dlg = page.getByRole("dialog");
    await dlg.getByTestId("cashier-form").waitFor({ timeout: 15000 });
    check((await dlg.getByTestId("cashier-student").innerText()).includes(s.last_name), "caisse ouverte sur l'élève de la fiche");
    await dlg.getByRole("button", { name: "Annuler" }).click();
    // Mobile : pas de défilement horizontal de la page.
    const m = await login(email, { width: 390, height: 844 });
    await m.goto(`${base}/eleves/${s.id}`);
    check((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "mobile : pas de défilement horizontal");
    await m.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  }
}
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
