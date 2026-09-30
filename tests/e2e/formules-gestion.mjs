// Formules gérées par le Super Admin, de bout en bout : création d'une nouvelle
// formule (textes, avantages, types d'établissement, options), affichage sur la
// page Tarifs et à l'inscription, modification, duplication, retrait,
// suppression ; option appliquée (assistant coupé par la formule : l'école ne
// l'ouvre plus). Rejouable : tout est remis en l'état à la fin.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-formules-gestion";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme/);
  return { page, context };
}
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);

const CODE = "SCOLAIRE_PREMIUM_TEST";
const school = await q1("select id, features::text from subscription_plans p, lateral (select jsonb_object_agg(feature_code, enabled) as features from subscription_features where plan_id = p.id) f where code = 'MODULE_SCOLAIRE'");
const cleanup = async () => {
  await db.query("delete from subscription_plans where code like 'SCOLAIRE_PREMIUM_TEST%'");
  await db.query("update subscription_features set enabled = true where plan_id = $1 and feature_code = 'assistant'", [school.id]);
};
await cleanup();

try {
  const { page: sa, context: sctx } = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/formules`);
  check((await sa.getByTestId("platform-plans").locator("[data-plan]").count()) >= 4, "console : les formules sont listées");
  check((await sa.locator("body").innerText()).includes("Tout le parcours scolaire dans un seul abonnement"), "console : textes des formules réécrits, plus courts");

  // 1. Nouvelle formule.
  await sa.getByRole("button", { name: "Nouvelle formule" }).click();
  const dialog = sa.getByRole("dialog");
  await dialog.getByLabel("Code *").fill(CODE);
  await dialog.getByLabel("Nom affiché *").fill("Scolaire Premium");
  await dialog.getByLabel("Nom en anglais").fill("School Premium");
  await dialog.getByLabel("Pour qui (phrase courte)").fill("Écoles qui veulent tout");
  await dialog.getByLabel("Prix mensuel (F CFA) *").fill("25000");
  await dialog.getByLabel("Essai gratuit (jours)").fill("10");
  await dialog.getByLabel("Ordre d'affichage").fill("2");
  await dialog.getByLabel("Description", { exact: true }).fill("Le Module Scolaire avec l'assistance prioritaire.");
  await dialog.getByLabel("Avantages affichés (un par ligne, 8 au plus)").fill("Tout le Module Scolaire\nAssistance prioritaire\nFormation des équipes");
  await dialog.getByTestId("plan-org-types").getByLabel("École primaire").check();
  await dialog.getByTestId("plan-org-types").getByLabel("Collège").check();
  await dialog.getByTestId("plan-features").getByLabel("Assistant intelligent").uncheck();
  await sa.screenshot({ path: `${out}/nouvelle-formule.png` });
  await dialog.getByRole("button", { name: "Créer la formule" }).click();
  check(await toast(sa, "Formule créée et proposée"), "création : formule créée et proposée");
  const created = await q1("select id, monthly_price, annual_price, trial_days, org_types::text, is_active, highlights from subscription_plans where code = $1", [CODE]);
  check(created && created.monthly_price === 25000 && created.annual_price === 210000 && created.trial_days === 10, "création : prix, remise annuelle et essai enregistrés");
  check(created?.org_types === "{primary_school,middle_school}" && created.highlights.length === 3, "création : types d'établissement et avantages enregistrés");
  check((await q1("select enabled from subscription_features where plan_id = $1 and feature_code = 'assistant'", [created.id])).enabled === false, "création : option coupée enregistrée");
  await sa.reload();
  const card = sa.locator(`[data-plan="${CODE}"]`);
  check((await card.innerText()).includes("Assistance prioritaire") && (await card.innerText()).includes("Collège"), "console : la nouvelle formule affiche ses avantages et ses établissements");
  await sa.screenshot({ path: `${out}/console-formules.png`, fullPage: true });

  // 2. Proposée sur le site et à l'inscription (types concernés seulement).
  const visitor = await browser.newPage();
  await visitor.goto(`${base}/tarifs`);
  check((await visitor.getByTestId(`plan-points-${CODE}`).innerText()).includes("Formation des équipes"), "Tarifs : la nouvelle formule et ses avantages s'affichent");
  await visitor.goto(`${base}/inscription`);
  await visitor.getByLabel("Type *").selectOption("middle_school");
  const collegeOptions = await visitor.locator("#plan_select option").allInnerTexts();
  check(collegeOptions.includes("Scolaire Premium") && !collegeOptions.some((o) => o.includes("Université")), "inscription : un collège voit la nouvelle formule, pas celle de l'université");
  await visitor.getByLabel("Type *").selectOption("university");
  const univOptions = await visitor.locator("#plan_select option").allInnerTexts();
  check(!univOptions.includes("Scolaire Premium"), "inscription : une université ne voit pas la formule scolaire");
  await visitor.close();

  // 3. Modification.
  await card.getByRole("button", { name: "Modifier" }).click();
  const edit = sa.getByRole("dialog");
  await edit.getByLabel("Nom affiché *").fill("Scolaire Premium+");
  await edit.getByTestId("plan-org-types").getByLabel("Lycée").check();
  await edit.getByRole("button", { name: "Enregistrer la formule" }).click();
  check(await toast(sa, "Formule mise à jour"), "modification : enregistrée");
  const edited = await q1("select name, org_types::text, monthly_price from subscription_plans where code = $1", [CODE]);
  check(edited.name === "Scolaire Premium+" && edited.org_types.includes("high_school") && edited.monthly_price === 25000, "modification : nom et types changés, prix inchangé");

  // 4. Duplication, retrait, suppression.
  await sa.reload();
  await sa.locator(`[data-plan="${CODE}"]`).getByRole("button", { name: "Dupliquer" }).click();
  await sa.getByRole("dialog").getByLabel("Code de la copie *").fill(`${CODE}_BIS`);
  await sa.getByRole("dialog").getByRole("button", { name: "Créer la copie" }).click();
  check(await toast(sa, "Copie créée"), "duplication : copie créée");
  check((await q1("select is_active from subscription_plans where code = $1", [`${CODE}_BIS`]))?.is_active === false, "duplication : la copie est retirée tant qu'elle n'est pas relue");
  await sa.reload();
  await sa.locator(`[data-plan="${CODE}"]`).getByRole("button", { name: "Retirer" }).click();
  await sa.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
  check(await toast(sa, "Formule retirée des offres"), "retrait : la formule n'est plus proposée");
  const tarifs = await browser.newPage();
  await tarifs.goto(`${base}/tarifs`);
  check((await tarifs.getByTestId(`plan-points-${CODE}`).count()) === 0, "retrait : disparue de la page Tarifs");
  await tarifs.close();
  await sa.reload();
  await sa.locator(`[data-plan="${CODE}_BIS"]`).getByRole("button", { name: "Supprimer" }).click();
  await sa.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  check(await toast(sa, "Formule supprimée"), "suppression : copie jamais utilisée supprimée");
  check((await sa.locator('[data-plan="MODULE_SCOLAIRE"]').getByRole("button", { name: "Supprimer" }).count()) === 0, "suppression : impossible pour une formule qui a des abonnés");

  // 5. Option appliquée : l'assistant coupé par la formule de l'école.
  await sa.locator('[data-plan="MODULE_SCOLAIRE"]').getByRole("button", { name: "Modifier" }).click();
  await sa.getByRole("dialog").getByTestId("plan-features").getByLabel("Assistant intelligent").uncheck();
  await sa.getByRole("dialog").getByRole("button", { name: "Enregistrer la formule" }).click();
  check(await toast(sa, "Formule mise à jour"), "option : assistant retiré de la formule Module Scolaire");
  const { page: admin, context: actx } = await login("admin@demo.neoscol.app");
  const response = await admin.goto(`${base}/assistant`);
  check(response?.status() === 404, `option appliquée : l'école n'ouvre plus l'assistant (${response?.status()})`);
  await admin.goto(`${base}/parametres`);
  check((await admin.locator("body").innerText()).includes("Non incluse dans votre formule"), "option appliquée : Paramètres explique « Non incluse dans votre formule »");
  await admin.screenshot({ path: `${out}/option-non-incluse.png`, fullPage: true });
  await actx.close();
  await sctx.close();
} catch (e) {
  problems.push(`Exception : ${e.message}`);
} finally {
  await cleanup();
  await db.end();
  await browser.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
