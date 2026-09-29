// P7d — Centre d'envois, de bout en bout : modèle SMS avec variables, aperçu
// du public (impayés), envoi par lots, historique par destinataire (canal non
// activé par la plateforme : « non configuré », aucun envoi simulé), arrêt,
// relance automatique des impayés, droits. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-centre-envois";
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

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const reset = async () => {
  await db.query("delete from message_campaigns where organization_id = $1", [DEMO]);
  await db.query("delete from communication_automations where organization_id = $1", [DEMO]);
  await db.query("delete from message_templates where organization_id = $1", [DEMO]);
  await db.query("delete from message_deliveries where organization_id = $1 and purpose = 'campaign'", [DEMO]);
};
await reset();
const unpaid = (
  await q1(
    `select count(distinct b.student_id)::int as n from student_balances b join students s on s.id = b.student_id
      where b.organization_id = $1 and b.has_overdue and s.status = 'active' and s.archived_at is null
        and exists (select 1 from student_guardians sg where sg.student_id = s.id)`,
    [DEMO],
  )
).n;

console.log("\n=== 1. Modèle de message avec variables ===");
const admin = await login("admin@demo.neoscol.app");
await admin.goto(`${base}/communication/envois`);
let t = await text(admin);
check(t.includes("Centre d'envois") && t.includes("Canal non activé par la plateforme"), "canaux non activés signalés (aucun envoi simulé)");
check(t.includes("Créez d'abord un modèle de message actif"), "aucun modèle au départ");
await admin.getByRole("button", { name: "Nouveau modèle" }).click();
await dialog(admin).getByLabel(/^Nom du modèle/).fill("Rappel de solde");
await dialog(admin).getByLabel(/^Message/).fill("Bonjour {{destinataire}}, il reste {{solde}} {{devise}} à régler pour {{eleve_prenom}}. {{motdepasse}}");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await dialog(admin).getByText(/Variable inconnue : \{\{motdepasse\}\}/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "variable inconnue refusée par la base");
await dialog(admin).getByLabel(/^Message/).fill("Bonjour {{destinataire}}, il reste {{solde}} {{devise}} à régler pour {{eleve_prenom}}. Merci.");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
await done(admin);
await admin.waitForLoadState("networkidle");
check((await text(admin)).includes("Rappel de solde"), "modèle SMS « Rappel de solde » créé");

console.log("\n=== 2. Aperçu du public puis envoi ===");
await admin.reload();
await admin.getByLabel("Parents d'élèves en impayé").check();
await admin.getByRole("button", { name: "Aperçu des destinataires" }).click();
const preview = admin.getByTestId("campaign-preview");
await preview.waitFor({ timeout: 15000 });
t = await preview.innerText();
check(t.includes(`destinataire(s) joignable(s) sur ${unpaid}`), `aperçu : ${unpaid} parent(s) d'élèves en impayé`);
check(/Bonjour .+, il reste [\d  ]+ XOF à régler pour .+\. Merci\./.test(t) && !t.includes("{{"), "message rendu avec les vraies variables (solde, devise, prénom)");
check(/\+225•+\d{2}/.test(t), "numéro masqué dans l'aperçu");
check(/caractère\(s\) — 1 SMS par destinataire/.test(t), "nombre de SMS indiqué");
await shot(admin, "01-apercu");
await admin.getByRole("button", { name: /Envoyer à \d+ destinataire/ }).click();
await admin.getByText(/Envoi terminé/).first().waitFor({ timeout: 60000 });
const camp = await q1("select id, status, total, sent, failed, skipped from message_campaigns where organization_id = $1", [DEMO]);
check(camp.status === "done" && camp.total === unpaid, "envoi terminé, tous les destinataires traités");
check(camp.sent === 0 && camp.failed + camp.skipped === unpaid, "canal non configuré : aucun message compté comme envoyé");
const statuses = (await db.query("select status, count(*)::int as n from message_campaign_recipients where campaign_id = $1 group by status", [camp.id])).rows;
check(statuses.every((s) => ["not_configured", "no_contact"].includes(s.status)), "destinataires marqués « non configuré » (aucun faux succès)");
const deliveries = await q1("select count(*)::int as n from message_deliveries where organization_id = $1 and purpose = 'campaign' and status = 'not_configured'", [DEMO]);
check(deliveries.n > 0, "journal des envois de la plateforme alimenté");

console.log("\n=== 3. Historique et détail ===");
await admin.reload();
t = await text(admin);
check(t.includes("Rappel de solde") && t.includes("Terminé") && t.includes("Parents en impayé"), "historique : envoi terminé, public affiché");
await admin.getByRole("link", { name: "Rappel de solde" }).first().click();
await admin.waitForURL(/envoi=/);
await admin.locator("[data-recipient-status]").first().waitFor();
t = await text(admin);
check(t.includes("Canal non configuré") && t.includes("n'est pas configuré par la plateforme"), "détail : statut et raison par destinataire");
check((await admin.locator("[data-recipient-status]").count()) === unpaid, "détail : un destinataire par élève en impayé");
check(!/\+225\d{10}/.test(t), "détail : aucun numéro en clair");
await shot(admin, "02-historique");

console.log("\n=== 4. Arrêt d'un envoi préparé ===");
const tpl = await q1("select id from message_templates where organization_id = $1", [DEMO]);
const staged = (await q1(`select create_message_campaign($1, $2, 'Envoi à arrêter', '{"kind":"staff"}') as id`, [DEMO, tpl.id])).id;
await admin.goto(`${base}/communication/envois`);
await admin.getByRole("row", { name: /Envoi à arrêter/ }).getByRole("button", { name: "Arrêter" }).click();
await dialog(admin).getByRole("button", { name: "Arrêter" }).click();
await done(admin);
check((await q1("select status from message_campaigns where id = $1", [staged])).status === "cancelled", "envoi arrêté, historique conservé");

console.log("\n=== 5. Relance automatique des impayés ===");
await admin.getByRole("button", { name: "Régler" }).click();
await dialog(admin).getByLabel("Modèle de message").selectOption({ label: "SMS — Rappel de solde" });
await dialog(admin).getByLabel("Fréquence (jours)").fill("10");
await dialog(admin).getByLabel("Activer la relance automatique").check();
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
await done(admin);
const auto = await q1("select enabled, interval_days, template_id from communication_automations where organization_id = $1", [DEMO]);
check(auto?.enabled && auto.interval_days === 10 && auto.template_id === tpl.id, "relance automatique activée (tous les 10 jours)");
await admin.reload();
check((await text(admin)).includes("Active : parents d'élèves en impayé, tous les 10 jour(s)"), "état de la relance affiché");
const audit = await q1("select count(*)::int as n from audit_logs where organization_id = $1 and action like 'communication.%'", [DEMO]);
check(audit.n >= 5, "journal d'audit : modèle, envois, arrêt, automatisation");
const mobile = await login("admin@demo.neoscol.app", { width: 390, height: 844 });
await mobile.goto(`${base}/communication/envois`);
await shot(mobile, "03-mobile");

console.log("\n=== 6. Droits ===");
const teacher = await login("enseignant@demo.neoscol.app");
check((await teacher.goto(`${base}/communication/envois`)).status() === 404, "enseignant : centre d'envois inaccessible");
const secretary = await login("secretariat@demo.neoscol.app");
check((await secretary.goto(`${base}/communication/envois`)).status() === 404, "secrétariat : envois groupés réservés à la direction");

await reset();
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nCENTRE D'ENVOIS E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
