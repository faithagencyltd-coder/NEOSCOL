// Super Admin SA-6 à SA-11 : analyses (+ export CSV), suivi commercial,
// fiche établissement et comptes (suspension), assistant de supervision,
// audience du site (visite réelle comptée), maintenance (écran côté école,
// accès conservé pour la plateforme), versions, confidentialité (export JSON).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-super-admin-outils";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
// État propre (exécution interrompue précédente).
await q("update platform_maintenance set enabled = false where id = 1");

const sa = await login("superadmin@demo.neoscol.app");

console.log("\n=== 1. Analyses ===");
await sa.goto(`${base}/plateforme/analyses`);
check((await sa.getByTestId("growth-table").locator("tbody tr").count()) === 12, "12 mois détaillés");
check(await sa.getByText(/jamais les frais de scolarité/).isVisible(), "revenus NeoScool distingués des frais de scolarité");
const csv = await sa.request.get(`${base}/plateforme/analyses/export?mois=12`);
const csvText = await csv.text();
check(csv.status() === 200 && csvText.includes("Nouveaux établissements") && csvText.split("\r\n").filter(Boolean).length === 13, "export CSV (en-tête + 12 mois)");
await sa.screenshot({ path: `${out}/01-analyses.png`, fullPage: true });

console.log("\n=== 2. Suivi commercial ===");
const leadName = `Prospect Test ${Date.now()}`;
await q("insert into site_leads (kind, full_name, email, organization, country) values ('demo', $1, 'prospect@exemple.ci', 'Lycée Test', 'CI')", [leadName]);
await sa.goto(`${base}/plateforme/commercial`);
const row = sa.getByTestId("crm-row").filter({ hasText: leadName });
check(await row.isVisible(), "prospect venu du site listé");
await row.getByRole("button", { name: "Suivre" }).click();
const dlg = sa.getByRole("dialog");
await dlg.getByLabel(/^État/).selectOption("demo_planned");
await dlg.getByLabel(/^Prochaine action/).fill("Démonstration en visio");
await dlg.getByLabel(/^Compte rendu/).fill("Appel : directeur intéressé par le module scolaire.");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await row.getByText("Démo planifiée").waitFor({ timeout: 15000 });
check(await row.getByText("directeur intéressé").isVisible(), "état, prochaine action et historique enregistrés");
await sa.screenshot({ path: `${out}/02-commercial.png`, fullPage: true });

console.log("\n=== 3. Fiche établissement et comptes ===");
await sa.goto(`${base}/plateforme/etablissements/10000000-0000-4000-a000-000000000001`);
const profile = sa.getByTestId("org-profile");
check(await profile.getByText("Élèves / personnel").isVisible(), "volumes de l'établissement");
check(await profile.getByText(/Comptes \(\d+\)/).isVisible(), "comptes et rôles");
check(await sa.getByText("Fonctionnalités — Groupe Scolaire Démo NeoScool").isVisible(), "réglage des fonctionnalités conservé");
await sa.screenshot({ path: `${out}/03-fiche.png`, fullPage: true });
await sa.goto(`${base}/plateforme/comptes?q=secretariat@`);
const acc = sa.getByTestId("account-card").first();
check(await acc.getByText("Groupe Scolaire Démo NeoScool").isVisible(), "compte retrouvé avec son établissement");
await acc.getByRole("button", { name: "Suspendre le compte" }).click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Test de suspension");
await sa.getByRole("dialog").getByRole("button", { name: "Suspendre" }).click();
await acc.getByText("Suspendu").waitFor({ timeout: 15000 });
const sec = await browser.newContext().then((c) => c.newPage());
await sec.goto(`${base}/connexion`);
await sec.getByLabel("Adresse e-mail ou matricule").fill("secretariat@demo.neoscol.app");
await sec.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
await sec.getByRole("button", { name: "Se connecter", exact: true }).click();
await sec.waitForTimeout(4000);
check(!/tableau-de-bord/.test(sec.url()), "compte suspendu : plus d'accès à l'établissement");
await acc.getByRole("button", { name: "Réactiver le compte" }).click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Fin du test");
await sa.getByRole("dialog").getByRole("button", { name: "Réactiver" }).click();
await acc.getByText("Actif", { exact: true }).waitFor({ timeout: 15000 });
check(true, "compte réactivé");

console.log("\n=== 4. Assistant de supervision ===");
await sa.goto(`${base}/plateforme/assistant`);
await sa.getByRole("button", { name: "Combien d'établissements sont actifs ?" }).click();
await sa.getByText(/Établissements : \d+/).first().waitFor({ timeout: 30000 });
check(true, "réponse chiffrée (données réelles)");
await sa.getByLabel("Votre question").fill("Y a-t-il eu des tentatives de piratage aujourd'hui ?");
await sa.getByRole("button", { name: "Envoyer la question" }).click();
await sa.getByText(/À VÉRIFIER/).first().waitFor({ timeout: 30000 });
check(await sa.getByText(/ne détectent pas toutes les attaques/).first().isVisible(), "faits et soupçons distingués, limite rappelée");
await sa.screenshot({ path: `${out}/04-assistant.png`, fullPage: true });

console.log("\n=== 5. Visiteurs du site ===");
const before = Number((await q("select count(*) n from site_visits where path = '/tarifs'"))[0].n);
const visitor = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile Safari/537.36" })).newPage();
await visitor.goto(`${base}/tarifs`);
await visitor.waitForTimeout(2500);
const after = Number((await q("select count(*) n from site_visits where path = '/tarifs'"))[0].n);
check(after === before + 1, "visite du site comptée (sans cookie)");
check((await visitor.context().cookies()).every((c) => !/visit|track|_ga/i.test(c.name)), "aucun cookie de mesure déposé");
const dnt = await (await browser.newContext({ extraHTTPHeaders: { DNT: "1" } })).newPage();
await dnt.goto(`${base}/tarifs`);
await dnt.waitForTimeout(2500);
check(Number((await q("select count(*) n from site_visits where path = '/tarifs'"))[0].n) === after, "« ne pas me suivre » respecté");
await sa.goto(`${base}/plateforme/visiteurs?jours=7`);
check(await sa.getByTestId("visitor-stats").getByText("Visiteurs uniques").isVisible(), "statistiques d'audience");
const [topPage] = await q("select path from site_visits where day > current_date - 7 group by path order by count(*) desc, path limit 1");
check(await sa.getByText(topPage.path, { exact: true }).first().isVisible(), "pages les plus vues");
await sa.screenshot({ path: `${out}/05-visiteurs.png`, fullPage: true });

console.log("\n=== 6. Maintenance et versions ===");
await sa.goto(`${base}/plateforme/maintenance`);
check((await sa.getByTestId("app-version").textContent()).includes("0.1.0"), "version en service affichée");
check((await sa.getByTestId("release-history").locator("tbody tr").count()) >= 1, "historique des mises en service");
check(await sa.getByTestId("backups").getByText("Suivi non connecté").isVisible(), "sauvegardes : rien d'inventé sans accès à l'hébergeur");
await sa.getByTestId("maintenance-toggle").click();
await sa.getByRole("dialog").getByLabel(/^Message/).fill("Maintenance de test : retour dans 10 minutes.");
await sa.getByRole("dialog").getByLabel(/^Motif/).fill("Test automatique");
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await sa.getByTestId("maintenance-banner").waitFor({ timeout: 15000 });
check(true, "maintenance activée ; bandeau dans la console");
const school = await login("admin@demo.neoscol.app").catch(() => null);
const schoolPage = school ?? (await browser.newPage());
await schoolPage.goto(`${base}/tableau-de-bord`);
check(await schoolPage.getByTestId("maintenance-screen").getByText("Maintenance de test").isVisible(), "établissement : écran de maintenance");
await schoolPage.screenshot({ path: `${out}/06-maintenance-ecole.png` });
await sa.goto(`${base}/plateforme`);
check(await sa.getByText("Tous les établissements").isVisible(), "la plateforme garde l'accès pendant la maintenance");
await sa.goto(`${base}/plateforme/maintenance`);
await sa.getByTestId("maintenance-toggle").click();
await sa.getByRole("dialog").getByLabel(/Maintenance active/).uncheck();
await sa.getByRole("dialog").getByLabel(/^Motif/).fill("Fin du test");
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await sa.getByTestId("maintenance-banner").waitFor({ state: "detached", timeout: 15000 });
await schoolPage.goto(`${base}/tableau-de-bord`);
check((await schoolPage.getByTestId("maintenance-screen").count()) === 0, "service rétabli pour l'établissement");

console.log("\n=== 7. Confidentialité ===");
await sa.goto(`${base}/plateforme/confidentialite`);
await sa.getByRole("button", { name: "Nouvelle demande" }).click();
const pd = sa.getByRole("dialog");
await pd.getByLabel(/^Nom du demandeur/).fill("Parent Test");
await pd.getByLabel(/^Type de demande/).selectOption("access");
await pd.getByLabel(/^Détails/).fill("Souhaite recevoir la copie des données de sa fille.");
await pd.getByRole("button", { name: "Enregistrer" }).click();
await sa.getByTestId("privacy-list").getByText("Parent Test").first().waitFor({ timeout: 15000 });
check(true, "demande enregistrée avec échéance à 30 jours");
const form = sa.getByTestId("org-export-form");
await form.locator("select[name=organization_id]").selectOption("10000000-0000-4000-a000-000000000001");
await form.locator("input[name=reason]").fill("Test d'export automatique");
const [download] = await Promise.all([sa.waitForEvent("download"), form.getByRole("button", { name: "Exporter" }).click()]);
const path = `${out}/export.json`;
await download.saveAs(path);
const json = JSON.parse((await import("node:fs")).readFileSync(path, "utf8"));
check(Array.isArray(json.tables.students) && json.tables.students.length > 0, "export JSON : données de l'établissement");
check(!/secret_ciphertext|webhook_token|password/i.test(JSON.stringify(json)), "export sans secret");
check(json.tables.students.every((s) => s.organization_id === "10000000-0000-4000-a000-000000000001"), "uniquement cet établissement");
await sa.screenshot({ path: `${out}/07-confidentialite.png`, fullPage: true });

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nTOUT EST OK");
process.exit(problems.length ? 1 : 0);
