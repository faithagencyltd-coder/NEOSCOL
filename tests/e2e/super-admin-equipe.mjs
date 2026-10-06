// Super Admin SA-1 : équipe (ajout d'un membre « lecture seule » par l'interface,
// connexion de ce membre, bandeau, aucune commande de modification), contrôle
// des modules (arrêt sur toute la plateforme puis exception par type, effet
// réel dans un établissement), journal global (filtres, détail métier masqué).
// Rejouable : e-mail unique, règles et membre retirés à la fin.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-super-admin-equipe";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;

async function login(identifier, password = "NeoScol-Demo-2026!") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
const status = async (page, path) => (await page.goto(`${base}${path}`)).status();

// État initial propre (exécutions précédentes interrompues).
await q("delete from platform_feature_rules where feature_key = 'assistant'");

console.log("\n=== 1. Équipe : ajout d'un membre « lecture seule » ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/equipe`);
check(await sa.getByRole("heading", { name: "Équipe de la plateforme" }).isVisible(), "page Équipe");
check((await sa.getByTestId("team-row").count()) >= 1, "membres listés");
check(await sa.getByRole("link", { name: "Équipe" }).isVisible(), "onglet Équipe dans la console");
const email = `lecture.${Date.now()}@demo.neoscol.app`;
await sa.getByTestId("team-add").click();
const dialog = sa.getByRole("dialog");
await dialog.getByLabel("E-mail de connexion").fill(email);
await dialog.getByLabel("Prénom (nouveau compte)", { exact: true }).fill("Awa");
await dialog.getByLabel("Nom (nouveau compte)", { exact: true }).fill("Lecture");
await dialog.getByLabel("Rôle").selectOption("viewer");
await dialog.getByRole("button", { name: "Ajouter" }).click();
const passwordCell = dialog.getByTestId("temporary-password");
await passwordCell.waitFor({ timeout: 20000 });
const temporary = (await passwordCell.textContent())?.trim() ?? "";
check(temporary.length >= 10, "mot de passe provisoire affiché une seule fois");
await sa.screenshot({ path: `${out}/01-equipe-ajout.png` });
await dialog.getByRole("button", { name: "Terminé" }).click();
await sa.reload();
const row = sa.getByTestId("team-row").filter({ hasText: email });
check(await row.getByText("Lecture seule").isVisible(), "nouveau membre affiché avec le rôle « Lecture seule »");
check(await row.getByText("À activer").isVisible(), "double authentification signalée à activer");

console.log("\n=== 2. Connexion du membre « lecture seule » ===");
const viewer = await login(email, temporary);
await viewer.goto(`${base}/plateforme`);
check(await viewer.getByTestId("viewer-banner").isVisible(), "bandeau « lecture seule » dans la console");
await viewer.goto(`${base}/plateforme/modules`);
check((await viewer.getByRole("button", { name: /Arrêter partout|Rouvrir partout/ }).count()) === 0, "aucune commande de modification des modules");
await viewer.goto(`${base}/plateforme/equipe`);
check((await viewer.getByTestId("team-add").count()) === 0 && (await viewer.getByRole("button", { name: "Retirer" }).count()) === 0, "aucune gestion de l'équipe");
await viewer.goto(`${base}/plateforme/journal`);
check((await viewer.getByTestId("journal-row").count()) > 0, "journal consultable en lecture seule");
await viewer.screenshot({ path: `${out}/02-lecture-seule.png` });
const viewerId = (await q("select id from profiles where email = $1", [email]))[0]?.id;
check(Boolean(viewerId) && (await q("select role from platform_admins where user_id = $1", [viewerId]))[0]?.role === "viewer", "rôle enregistré en base");

console.log("\n=== 3. Contrôle des modules : arrêt global puis exception par type ===");
const admin = await login("admin@demo.neoscol.app");
const formation = await login("formation@demo.neoscol.app");
check((await status(admin, "/assistant")) === 200, "assistant ouvert au départ (groupe scolaire)");
await sa.goto(`${base}/plateforme/modules`);
const card = sa.getByTestId("module-assistant");
await card.getByTestId("module-assistant-global").click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Ouverture progressive de l'assistant");
await sa.getByRole("dialog").getByRole("button", { name: "Arrêter" }).click();
await card.getByText("Arrêté sur la plateforme").waitFor({ timeout: 15000 });
check(true, "assistant arrêté sur toute la plateforme");
check((await status(admin, "/assistant")) === 404, "établissement : assistant indisponible après l'arrêt global");
check((await admin.locator('a[href="/assistant"]').count()) === 0, "lien retiré du menu de l'établissement");

await card.getByRole("button", { name: "Exception" }).click();
const ex = sa.getByRole("dialog");
await ex.getByLabel(/^Pour/).selectOption("org_type:school_complex");
await ex.getByLabel(/^État/).selectOption("on");
await ex.getByLabel(/^Motif/).fill("Pilote groupes scolaires");
await ex.getByRole("button", { name: /Enregistrer|Ajouter|Valider/ }).click();
await card.getByText("Type : Groupe scolaire").waitFor({ timeout: 15000 });
check(true, "exception « Groupe scolaire : ouvert » enregistrée");
check((await status(admin, "/assistant")) === 200, "groupe scolaire : assistant rouvert par l'exception (pilote)");
check((await status(formation, "/assistant")) === 404, "centre de formation : toujours arrêté");
await sa.screenshot({ path: `${out}/03-modules.png`, fullPage: true });
await sa.goto(`${base}/plateforme/etablissements/10000000-0000-4000-a000-000000000002`);
check(await sa.getByText("arrêtée par une règle générale").first().isVisible(), "fiche établissement : arrêt par règle générale signalé");

console.log("\n=== 4. Journal global ===");
await sa.goto(`${base}/plateforme/journal?categorie=platform`);
check(await sa.getByText("Fonctionnalité arrêtée : assistant").first().isVisible(), "arrêt du module journalisé");
check(await sa.getByText(/Membre ajouté à l'équipe/).first().isVisible(), "ajout du membre journalisé");
await sa.goto(`${base}/plateforme/journal?gravite=high&portee=platform`);
const rows = await sa.getByTestId("journal-row").allTextContents();
check(rows.length > 0 && rows.every((r) => r.includes("Élevée")), "filtre par gravité");
await q("insert into audit_logs (organization_id, actor_email, action, summary) values ('10000000-0000-4000-a000-000000000001', 'secretariat@demo.neoscol.app', 'student.created', 'Élève créé : test confidentialité')");
await sa.goto(`${base}/plateforme/journal?categorie=student&etablissement=10000000-0000-4000-a000-000000000001`);
check((await sa.getByText("Élève créé : test confidentialité").count()) === 0 && (await sa.getByText("Détail réservé à l'établissement").first().isVisible()), "détail métier d'une école masqué");
await sa.screenshot({ path: `${out}/04-journal.png` });

console.log("\n=== 5. Nettoyage par l'interface ===");
await sa.goto(`${base}/plateforme/modules`);
await sa.getByTestId("module-assistant").getByRole("button", { name: "Retirer" }).click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Fin du pilote");
await sa.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
await sa.getByTestId("module-assistant").getByText("Type : Groupe scolaire").waitFor({ state: "detached", timeout: 15000 });
await sa.getByTestId("module-assistant-global").click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Ouverture générale");
await sa.getByRole("dialog").getByRole("button", { name: "Rouvrir" }).click();
await sa.getByTestId("module-assistant").getByText("Ouvert", { exact: true }).first().waitFor({ timeout: 15000 });
check((await status(formation, "/assistant")) === 200, "rouvert partout : centre de formation de nouveau servi");
await sa.goto(`${base}/plateforme/equipe`);
await sa.getByTestId("team-row").filter({ hasText: email }).getByRole("button", { name: "Retirer" }).click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Fin du test");
await sa.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
await sa.getByTestId("team-row").filter({ hasText: email }).waitFor({ state: "detached", timeout: 15000 });
check((await q("select count(*)::int n from platform_admins where user_id = $1", [viewerId]))[0].n === 0, "membre retiré de l'équipe");
check((await q("select count(*)::int n from profiles where id = $1", [viewerId]))[0].n === 1, "compte conservé");
check((await status(viewer, "/plateforme")) === 404, "l'ancien membre n'accède plus à la console");

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nTOUT EST OK");
process.exit(problems.length ? 1 : 0);
