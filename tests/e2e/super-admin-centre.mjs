// Super Admin SA-2 à SA-5 : tableau de bord (chiffres réels), alertes de
// sécurité, supervision + sonde publique /api/sante, assistance (demande d'un
// établissement → réponse de la plateforme → notification → résolution).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-super-admin-centre";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}

console.log("\n=== 1. Tableau de bord général ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme`);
const orgs = (await q("select count(*)::int n from organizations"))[0].n;
const card = sa.locator("section[aria-label='Indicateurs']");
await sa.waitForTimeout(1500);
check((await card.textContent()).includes(String(orgs)), `nombre réel d'établissements (${orgs})`);
for (const label of ["Connectés aujourd'hui", "Abonnements actifs", "Revenus du mois", "Échecs de connexion (24 h)"]) check(await card.getByText(label).isVisible(), `indicateur « ${label} »`);
check(await sa.getByText(/Alertes \(\d+\)/).isVisible(), "bloc des alertes");
check(await sa.getByText("Échéances des 30 prochains jours").isVisible(), "bloc des échéances");
check(await sa.getByRole("heading", { name: "Tous les établissements" }).isVisible(), "liste des établissements conservée");
await sa.screenshot({ path: `${out}/01-tableau-de-bord.png`, fullPage: true });

console.log("\n=== 2. Alertes de sécurité ===");
await sa.goto(`${base}/plateforme/securite`);
const alerts = sa.getByTestId("security-alerts");
check(await alerts.getByText("Faits observés").isVisible(), "faits observés");
check(await alerts.getByText(/À vérifier/).isVisible(), "comportements à vérifier");
check(await alerts.getByText("Modifications sensibles").isVisible(), "modifications sensibles");
check(await sa.getByText(/ne détectent pas toutes les attaques/).isVisible(), "limite annoncée honnêtement");
await sa.screenshot({ path: `${out}/02-securite.png`, fullPage: true });

console.log("\n=== 3. Supervision et sonde publique ===");
await sa.goto(`${base}/plateforme/supervision`);
check(await sa.getByTestId("supervision-status").isVisible(), "état général affiché");
check(await sa.getByText("Temps de réponse de la base").isVisible(), "temps de réponse mesuré");
check((await sa.getByTestId("service-row").count()) >= 5, "services externes listés");
const body = await sa.content();
check(!/sk-ant|secret_ciphertext|BEGIN PRIVATE/i.test(body), "aucune clé ni secret dans la page");
check(/^https?:\/\/.+\/api\/sante$/.test(((await sa.getByTestId("health-url").textContent()) ?? "").trim()), "adresse complète de la sonde indiquée");
await sa.screenshot({ path: `${out}/03-supervision.png`, fullPage: true });
const anon = await (await browser.newContext()).newPage();
const probe = await anon.request.get(`${base}/api/sante`);
const pj = await probe.json();
check(probe.status() === 200 && pj.status === "ok" && pj.database === "ok" && Object.keys(pj).length === 4, "sonde /api/sante : sans connexion, aucune donnée");

console.log("\n=== 4. Assistance : de la demande à la résolution ===");
const school = await login("secretariat@demo.neoscol.app");
await school.goto(`${base}/assistance`);
check(await school.getByRole("heading", { name: "Assistance" }).isVisible(), "page Assistance de l'établissement");
const title = `Bulletins introuvables ${Date.now()}`;
await school.getByRole("button", { name: "Nouvelle demande" }).click();
const dlg = school.getByRole("dialog");
await dlg.getByLabel(/^Sujet/).fill(title);
await dlg.getByLabel(/^Catégorie/).selectOption("documents");
await dlg.getByLabel(/^Urgence/).selectOption("high");
await dlg.getByLabel(/^Description/).fill("Les bulletins du 1er trimestre ne s'ouvrent pas pour la 6e A.");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await school.getByTestId("support-list").getByText(title).waitFor({ timeout: 15000 });
check(true, "demande créée et listée");
const ticket = (await q("select id, number from support_tickets where title = $1", [title]))[0];

await sa.goto(`${base}/plateforme/incidents`);
check(await sa.getByTestId("ticket-row").filter({ hasText: title }).isVisible(), "demande visible dans la console");
await sa.goto(`${base}/plateforme/incidents/${ticket.id}`);
await sa.getByRole("button", { name: "Répondre" }).click();
await sa.getByRole("dialog").getByLabel(/^Message/).fill("Note : vérifier le modèle de bulletin.");
await sa.getByRole("dialog").getByLabel(/Note interne/).check();
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText("Note interne (invisible pour l'établissement)").waitFor({ timeout: 15000 });
await sa.getByRole("button", { name: "Répondre" }).click();
await sa.getByRole("dialog").getByLabel(/^Message/).fill("Le problème est corrigé, merci de réessayer.");
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText("Le problème est corrigé, merci de réessayer.").waitFor({ timeout: 15000 });
await sa.getByRole("button", { name: "Statut et gravité" }).click();
await sa.getByRole("dialog").getByLabel(/^Statut/).selectOption("resolved");
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText(/^Résolue le/).waitFor({ timeout: 15000 });
check(true, "réponse, note interne et résolution par la plateforme");
await sa.screenshot({ path: `${out}/04-console-demande.png`, fullPage: true });

await school.goto(`${base}/assistance?demande=${ticket.id}`);
const thread = school.getByTestId("support-thread");
check(await thread.getByText("Le problème est corrigé, merci de réessayer.").isVisible(), "l'établissement voit la réponse");
check((await thread.getByText("vérifier le modèle de bulletin").count()) === 0, "note interne invisible pour l'établissement");
check(await school.getByText("Résolue").first().isVisible(), "statut « Résolue » visible");
const notes = await q("select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email = 'secretariat@demo.neoscol.app' and n.type = 'support' and n.link like $1", [`%${ticket.id}`]);
check(notes[0].n === 2, "notifications : réponse puis résolution");
await school.screenshot({ path: `${out}/05-etablissement-demande.png`, fullPage: true });
const teacher = await login("enseignant@demo.neoscol.app");
await teacher.goto(`${base}/assistance?demande=${ticket.id}`);
check((await teacher.getByText(title).count()) === 0, "un autre membre sans droit ne voit pas la demande");

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nTOUT EST OK");
process.exit(problems.length ? 1 : 0);
