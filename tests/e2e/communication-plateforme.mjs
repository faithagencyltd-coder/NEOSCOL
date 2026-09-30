// COMMUNICATION PLATEFORME (Super Admin) : annonce ciblée affichée dans les
// établissements (masquable, notification), annonce réservée à la direction,
// envoi groupé aux directions (notifications réelles ; e-mail seulement si configuré).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-communication-plateforme";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
async function login(identifier, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement|mes-cours/);
  return page;
}
const run = String(Date.now()).slice(-5);
const ALL = `Maintenance ${run}`;
const DIR = `Direction ${run}`;
const SUBJECT = `Rentrée ${run}`;

try {
  console.log("\n=== 1. Super Admin : annonces ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme`);
  await sa.getByRole("link", { name: "Communication" }).click();
  await sa.waitForURL(/\/plateforme\/communication/);
  await sa.getByRole("button", { name: "Nouvelle annonce" }).click();
  let dialog = sa.getByRole("dialog");
  await dialog.getByLabel("Titre").fill(ALL);
  await dialog.getByLabel("Message").fill("Une maintenance aura lieu samedi de 22 h à minuit.");
  await dialog.getByLabel("Type").selectOption("warning");
  await dialog.getByLabel(/^Module scolaire/).check();
  await dialog.getByLabel(/Envoyer aussi une notification/).check();
  await dialog.getByRole("button", { name: "Publier" }).click();
  await sa.getByTestId("announcement-list").getByText(ALL, { exact: true }).waitFor({ timeout: 15000 });
  check(true, "annonce publiée (module scolaire, avec notification)");
  const a = await q1("select id, notified_count from platform_announcements where title = $1", [ALL]);
  check(a?.notified_count > 0, `notifications envoyées (${a?.notified_count})`);

  await sa.getByRole("button", { name: "Nouvelle annonce" }).click();
  dialog = sa.getByRole("dialog");
  await dialog.getByLabel("Titre").fill(DIR);
  await dialog.getByLabel("Message").fill("Nouveau tableau de bord des revenus pour la direction.");
  await dialog.getByLabel("Qui la voit ?").selectOption("direction");
  await dialog.getByRole("button", { name: "Publier" }).click();
  await sa.getByTestId("announcement-list").getByText(DIR, { exact: true }).waitFor({ timeout: 15000 });
  check(true, "annonce réservée à la direction publiée");
  await sa.screenshot({ path: `${out}/01-console-annonces.png`, fullPage: true });

  console.log("\n=== 2. Établissement : bandeau ===");
  const admin = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/tableau-de-bord`);
  const banner = admin.getByTestId("platform-announcements");
  await banner.waitFor({ timeout: 15000 });
  check(await banner.getByText(ALL).isVisible(), "administrateur : annonce générale visible");
  check(await banner.getByText(DIR).isVisible(), "administrateur : annonce de direction visible");
  await admin.screenshot({ path: `${out}/02-bandeau-etablissement.png` });
  await banner.getByRole("button", { name: `Masquer l'annonce « ${ALL} »` }).click();
  await banner.getByText(ALL).waitFor({ state: "detached", timeout: 15000 });
  await admin.reload();
  check(!(await admin.getByText(ALL, { exact: true }).count()), "annonce masquée, même après rechargement");
  const notif = await q1("select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email = 'admin@demo.neoscol.app' and n.title = $1", [ALL]);
  check(notif.n === 1, "notification reçue une seule fois");

  // L'enseignant de démo peut enseigner dans plusieurs établissements : on le place sur le module scolaire.
  await db.query("update profiles set last_organization_id = (select id from organizations where code = 'DEMO') where email = 'enseignant@demo.neoscol.app'");
  const teacher = await login("enseignant@demo.neoscol.app");
  await teacher.goto(`${base}/tableau-de-bord`);
  await teacher.getByText(ALL).first().waitFor({ timeout: 15000 });
  check(true, "enseignant : annonce générale visible");
  check(!(await teacher.getByText(DIR, { exact: true }).count()), "enseignant : annonce de direction invisible");

  const formation = await login("formation@demo.neoscol.app");
  await formation.goto(`${base}/tableau-de-bord`);
  await formation.waitForLoadState("networkidle");
  check(!(await formation.getByText(ALL, { exact: true }).count()), "formation professionnelle : annonce du module scolaire invisible");

  console.log("\n=== 3. Envoi groupé aux directions ===");
  await sa.goto(`${base}/plateforme/communication`);
  await sa.getByLabel("Module scolaire", { exact: true }).check();
  await sa.getByLabel("Inclure les établissements de démonstration").check();
  await sa.getByTestId("campaign-preview").getByText(/membre\(s\) de direction dans [1-9]/).waitFor({ timeout: 15000 });
  check(true, `aperçu : ${await sa.getByTestId("campaign-preview").innerText()}`);
  await sa.getByLabel("Objet *").fill(SUBJECT);
  await sa.getByLabel("Message *").fill("Bonjour,\nvoici les nouveautés NeoScool pour la rentrée.");
  await sa.getByRole("checkbox", { name: /E-mail/ }).check();
  await sa.getByRole("button", { name: "Envoyer" }).click();
  const result = sa.getByRole("alert").filter({ hasText: "Envoi terminé" }).or(sa.getByRole("status").filter({ hasText: "Envoi terminé" })).first();
  await result.waitFor({ timeout: 30000 });
  const text = await result.innerText();
  check(/notification\(s\) envoyée\(s\)/.test(text), "notifications envoyées");
  const emailConfigured = await q1("select enabled and secret_ciphertext is not null ok from platform_integrations where provider = 'brevo_email'");
  check(emailConfigured?.ok ? /e-mail\(s\) envoyé\(s\)/.test(text) : /non configuré/.test(text), "e-mail : résultat réel (non configuré = annoncé, jamais simulé)");
  await sa.getByTestId("campaign-list").getByText(SUBJECT).waitFor({ timeout: 15000 });
  check(true, "historique des envois");
  const got = await q1("select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email = 'direction@demo.neoscol.app' and n.title = $1", [SUBJECT]);
  check(got.n === 1, "la direction a reçu la notification");
  const notGot = await q1("select count(*)::int n from notifications n join profiles p on p.id = n.user_id where p.email = 'enseignant@demo.neoscol.app' and n.title = $1", [SUBJECT]);
  check(notGot.n === 0, "l'enseignant ne la reçoit pas");
  await sa.screenshot({ path: `${out}/03-envoi-groupe.png`, fullPage: true });

  console.log("\n=== 3 bis. Messages automatiques ===");
  await sa.getByRole("button", { name: "Modifier le message « Rappel de fin d'essai »" }).click();
  dialog = sa.getByRole("dialog");
  await dialog.getByLabel("Titre *").fill("{etablissement} : plus que {jours} jour(s)");
  await dialog.getByLabel("Texte *").fill("Bonjour, votre essai se termine le ");
  await dialog.getByRole("button", { name: "{date_fin}" }).click();
  const preview = await dialog.getByTestId("template-preview").innerText();
  check(preview.includes("Collège Les Palmiers : plus que 3 jour(s)") && preview.includes("se termine le 15/10/2026"), "aperçu avec un exemple (variables cliquables)");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "detached", timeout: 15000 });
  const tplRow = sa.getByTestId("template-list").getByRole("row").filter({ hasText: "Rappel de fin d'essai" });
  await tplRow.getByText("Personnalisé").waitFor({ timeout: 15000 });
  const saved = await q1("select title, body from platform_message_templates where code = 'trial_reminder'");
  check(saved.title === "{etablissement} : plus que {jours} jour(s)" && saved.body.endsWith("{date_fin}"), "texte personnalisé enregistré");
  await sa.screenshot({ path: `${out}/03b-messages-automatiques.png`, fullPage: true });
  await sa.getByRole("button", { name: "Modifier le message « Rappel de fin d'essai »" }).click();
  await sa.getByRole("dialog").getByRole("button", { name: "Rétablir le texte d'origine" }).click();
  await tplRow.getByText("Texte d'origine").waitFor({ timeout: 15000 });
  check((await q1("select title from platform_message_templates where code = 'trial_reminder'")).title === null, "texte d'origine rétabli");

  console.log("\n=== 4. Accès refusé et mobile ===");
  const res = await admin.goto(`${base}/plateforme/communication`);
  check(res?.status() === 404, "établissement : console introuvable");
  const mob = await login("enseignant@demo.neoscol.app", { width: 390, height: 844 });
  await mob.goto(`${base}/tableau-de-bord`);
  await mob.getByTestId("platform-announcements").waitFor({ timeout: 15000 });
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `mobile : bandeau sans défilement horizontal (${overflow}px)`);
  await mob.screenshot({ path: `${out}/04-bandeau-mobile.png` });
} catch (e) {
  problems.push(`exception: ${e.message}`);
  console.log("EXCEPTION", e);
} finally {
  await db.query("update platform_announcements set is_active = false where title in ($1, $2)", [ALL, DIR]).catch(() => null);
  await db.query("update platform_message_templates set title = null, body = null, enabled = true where code = 'trial_reminder'").catch(() => null);
  await db.end();
  await browser.close();
  writeFileSync(`${out}/problems.json`, JSON.stringify(problems, null, 2));
  if (problems.length) {
    console.log(`\nPROBLÈMES (${problems.length}):`);
    for (const p of problems) console.log("-", p);
    process.exit(1);
  }
  console.log("\nTout est OK.");
}
