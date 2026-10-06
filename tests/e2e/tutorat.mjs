// NEOSCOOL Tutor Match (navigateur) : fermé par défaut, ouverture par le Super
// Admin (Contrôle des modules), fiche tuteur, validation et vérification,
// recherche par une famille, demande → acceptation → confirmation (coordonnées
// par étapes), séance, portail parent, console, fermeture sans perte.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-tutorat";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const q1 = async (sql, params) => (await q(sql, params))[0];
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true }).catch(() => {});
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 20000 });
const TUTOR_EMAIL = "formation@demo.neoscol.app";

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

// État de départ : module fermé, réglages par défaut, aucune donnée de test laissée par un passage précédent.
const tutorId = (await q1("select id from auth.users where email = $1", [TUTOR_EMAIL])).id;
const parentId = (await q1("select id from auth.users where email = 'parent@demo.neoscol.app'")).id;
await q("delete from platform_feature_rules where feature_key = 'tutor_match'");
await q("update tutor_settings set independent_tutors = true, school_teachers = true, require_verification = true, forbid_own_school = true, suggestions_enabled = false where id = 1");
await q("delete from tutor_requests where tutor_id = $1", [tutorId]);
await q("delete from tutor_blocks where tutor_id = $1", [tutorId]);
await q("delete from tutor_profiles where user_id = $1", [tutorId]);

console.log("\n=== 1. Fermé par défaut ===");
const parent = await login("parent@demo.neoscol.app");
await parent.goto(`${base}/espace/tutorat`);
check(await parent.getByTestId("tutoring-closed").isVisible(), "famille : service non ouvert");
await parent.goto(`${base}/portail/plus`);
check((await parent.getByText("Soutien scolaire (trouver un tuteur)").count()) === 0, "portail parent : aucun lien tant que le module est fermé");

console.log("\n=== 2. Ouverture par le Super Admin ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/modules`);
const card = sa.getByTestId("module-tutor_match");
await card.getByTestId("module-tutor_match-global").click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Pilote Tutor Match");
await sa.getByRole("dialog").getByRole("button", { name: "Ouvrir" }).click();
await card.getByText("Ouvert partout").waitFor({ timeout: 15000 });
check(true, "Tutor Match ouvert sur la plateforme (Contrôle des modules)");

console.log("\n=== 3. Fiche tuteur ===");
const tutor = await login(TUTOR_EMAIL);
await tutor.goto(`${base}/espace/tuteur`);
const form = tutor.getByTestId("tutor-profile-form");
await form.locator('input[name="headline"]').fill("Professeur de mathématiques, collège et lycée");
await form.locator('input[name="subjects"]').fill("Mathématiques, Physique");
await form.locator('input[name="levels"]').fill("3e, Seconde");
await form.locator('select[name="country"]').selectOption("CI");
await form.locator('input[name="city"]').fill("Abidjan");
await form.locator('input[name="zones"]').fill("Cocody");
await form.locator('input[name="rate_amount"]').fill("5000");
await form.locator('textarea[name="qualifications"]').fill("Licence de mathématiques");
await form.locator('input[name="accept_terms"]').check();
await form.getByRole("button", { name: "Enregistrer ma fiche" }).click();
await toast(tutor, "Fiche enregistrée.");
const p = await q1("select status, verification, kind from tutor_profiles where user_id = $1", [tutorId]);
check(p?.status === "pending" && p.verification === "unverified" && p.kind === "independent", "fiche en attente, qualifications « déclarées »");
await tutor.reload();
await tutor.getByRole("button", { name: "Demander la vérification de mon profil" }).click();
await toast(tutor, "Demande de vérification envoyée");
await shot(tutor, "01-fiche-tuteur");

console.log("\n=== 4. Validation et vérification ===");
await parent.goto(`${base}/espace/tutorat?matiere=Math`);
check(await parent.getByTestId("tutor-results-empty").isVisible(), "fiche non validée : invisible pour les familles");
await sa.goto(`${base}/plateforme/tutorat?onglet=tuteurs&filtre=verification`);
const row = sa.getByTestId(`tutor-${TUTOR_EMAIL}`);
await row.getByRole("button", { name: "Approuver" }).click();
await toast(sa, "Fiche mise à jour.");
await row.getByRole("button", { name: "Vérifier" }).click();
await sa.getByRole("dialog").getByLabel(/Ce qui a été vérifié/).fill("Pièce d'identité et licence vérifiées");
await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
let p2;
for (let i = 0; i < 20; i++) {
  p2 = await q1("select status, verification from tutor_profiles where user_id = $1", [tutorId]);
  if (p2.verification === "verified") break;
  await sa.waitForTimeout(500);
}
check(p2.status === "approved" && p2.verification === "verified", "fiche approuvée et vérifiée par la plateforme");

console.log("\n=== 5. Recherche et demande ===");
await parent.goto(`${base}/espace/tutorat?matiere=Math&ville=cocody`);
const tc = parent.getByTestId("tutor-card").first();
await tc.waitFor({ timeout: 15000 });
const cardText = (await tc.textContent()) ?? "";
check(cardText.includes("Profil vérifié par NeoScool") && cardText.includes("Qualifications vérifiées"), "tuteur trouvé, vérification affichée");
check(!cardText.includes(TUTOR_EMAIL) && !/\+225/.test(cardText), "aucune coordonnée du tuteur dans la recherche");
await shot(parent, "02-recherche");
await tc.getByRole("button", { name: "Demander un cours" }).click();
const dlg = parent.getByRole("dialog");
await dlg.getByLabel(/Niveau ou classe/).fill("3e");
await dlg.getByLabel(/Votre message/).fill("Bonjour, ma fille a besoin d'aide en géométrie.");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await toast(parent, "Demande envoyée au tuteur.");
const req = await q1("select id, status from tutor_requests where parent_id = $1 and tutor_id = $2 order by created_at desc limit 1", [parentId, tutorId]);
check(req?.status === "sent", "demande enregistrée");
check(!(await parent.getByTestId(`tutor-request-${req.id}`).getByTestId("tutor-contact").count()), "pas de coordonnées avant acceptation");

console.log("\n=== 6. Acceptation, confirmation, séance ===");
await tutor.goto(`${base}/espace/tuteur`);
const r1 = tutor.getByTestId(`tutor-request-${req.id}`);
check(!(await r1.getByTestId("tutor-contact").count()), "tuteur : coordonnées de la famille masquées avant confirmation");
await r1.getByRole("button", { name: "Accepter" }).click();
await toast(tutor, "Réponse envoyée.");
await r1.getByLabel("Votre message").fill("Bonjour, je peux le mercredi après-midi.");
await r1.getByRole("button", { name: "Envoyer" }).click();
await toast(tutor, "Message envoyé.");

await parent.goto(`${base}/espace/tutorat`);
const r2 = parent.getByTestId(`tutor-request-${req.id}`);
check(((await r2.getByTestId("tutor-contact").textContent()) ?? "").includes(TUTOR_EMAIL), "famille : coordonnées du tuteur après acceptation");
check(((await r2.textContent()) ?? "").includes("mercredi après-midi"), "message du tuteur reçu");
await r2.getByRole("button", { name: "Confirmer les modalités" }).click();
await toast(parent, "Demande mise à jour.");
await r2.getByRole("button", { name: "Ajouter une séance" }).click();
const sd = parent.getByRole("dialog");
await sd.getByLabel("Date").fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
await sd.getByLabel("Heure").fill("15:00");
await sd.getByRole("button", { name: "Enregistrer" }).click();
await toast(parent, "Séance ajoutée.");
check(Number((await q1("select count(*) n from tutor_sessions where request_id = $1", [req.id])).n) === 1, "séance enregistrée");
await shot(parent, "03-demande-confirmee");
await tutor.goto(`${base}/espace/tuteur`);
check(((await tutor.getByTestId(`tutor-request-${req.id}`).getByTestId("tutor-contact").textContent()) ?? "").includes("parent@demo.neoscol.app"), "tuteur : coordonnées de la famille après confirmation");

console.log("\n=== 7. Portail parent et console ===");
await parent.goto(`${base}/portail/plus`);
check(await parent.getByText("Soutien scolaire (trouver un tuteur)").isVisible(), "portail parent : lien « Soutien scolaire »");
await sa.goto(`${base}/plateforme/tutorat`);
check(await sa.getByTestId("tutor-overview").isVisible(), "console : vue d'ensemble");
await sa.goto(`${base}/plateforme/tutorat?onglet=demandes`);
const consoleText = (await sa.getByTestId("tutor-requests-console").textContent()) ?? "";
check(consoleText.includes("Math") && !consoleText.includes("géométrie"), "console : suivi sans le contenu des échanges");
const viewer = await login("enseignant@demo.neoscol.app");
await viewer.goto(`${base}/plateforme/tutorat`);
check(!(await viewer.getByText("NEOSCOOL Tutor Match").count()), "console inaccessible à un enseignant");

console.log("\n=== 8. Fermeture ===");
await sa.goto(`${base}/plateforme/modules`);
await sa.getByTestId("module-tutor_match").getByTestId("module-tutor_match-global").click();
await sa.getByRole("dialog").getByLabel(/Motif/).fill("Fin du pilote");
await sa.getByRole("dialog").locator('button[type="submit"]', { hasText: "Fermer" }).click();
await sa.getByTestId("module-tutor_match").getByText("Fermé (par défaut)").waitFor({ timeout: 15000 });
await parent.goto(`${base}/espace/tutorat`);
check((await parent.getByTestId("tutoring-closed").isVisible()) && (await parent.getByTestId(`tutor-request-${req.id}`).isVisible()), "fermé : plus de recherche, historique conservé");

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
