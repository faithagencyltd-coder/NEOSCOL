// DERNIERS AJOUTS — notifications push (clés VAPID Super Admin, bouton appareil),
// tableau de bord configurable, fonctionnalités par établissement, prix des
// formules, remise sur facture, export des notes (Excel / CSV).
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/derniers-ajouts.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-derniers-ajouts";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
async function login(identifier, password = "NeoScol-Demo-2026!") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement/);
  return page;
}

console.log("\n=== 1. Super Admin : clés VAPID générées et chiffrées ===");
{
  const page = await login("superadmin@demo.neoscol.app");
  await page.goto(`${base}/plateforme/integrations`);
  const card = page.locator("article", { hasText: "Notifications push (Web Push)" });
  check(await card.isVisible(), "carte « Notifications push » dans les intégrations");
  await card.getByTestId("push-generate").getByRole("button", { name: /Générer des clés|Régénérer les clés/ }).click();
  await card.getByText("Actif", { exact: true }).waitFor({ timeout: 15000 });
  const row = await q1("select enabled, config, secret_ciphertext, secret_hint from platform_integrations where provider = 'web_push'");
  check(row.enabled && /^[A-Za-z0-9_-]{87}$/.test(row.config.public_key ?? ""), "clé publique VAPID enregistrée, intégration active");
  check(row.secret_ciphertext?.startsWith("v1:") && !row.secret_ciphertext.includes(row.config.public_key), "clé privée chiffrée (AES-256-GCM)");
  check(/^mailto:/.test(row.config.subject ?? ""), "contact VAPID par défaut : adresse du Super Admin");
  await card.getByRole("button", { name: "Tester" }).click();
  await card.getByText(/Clés valides|envoyée/).waitFor({ timeout: 15000 });
  check(true, "test des clés : valides");
  await page.screenshot({ path: `${out}/01-integration-push.png`, fullPage: true });
  await page.context().close();
}

console.log("\n=== 2. Administrateur : bouton push, tableau de bord configurable ===");
{
  const page = await login("admin@demo.neoscol.app");
  await page.goto(`${base}/notifications`);
  const toggle = page.getByTestId("push-toggle");
  await toggle.waitFor({ timeout: 15000 });
  check(["off", "on", "unsupported"].includes(await toggle.getAttribute("data-state")), "bouton « Activer les notifications sur cet appareil » affiché");

  await page.goto(`${base}/tableau-de-bord`);
  const announcements = page.getByText("Communications en cours de l'établissement");
  await announcements.first().waitFor({ timeout: 20000 }).catch(() => {});
  check(await announcements.isVisible(), "bloc Annonces affiché par défaut");
  await page.getByTestId("dashboard-customize").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Annonces").uncheck();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await announcements.waitFor({ state: "detached", timeout: 15000 });
  check(!(await announcements.isVisible()), "bloc Annonces masqué après personnalisation");
  const pref = await q1("select hidden from dashboard_preferences p join auth.users u on u.id = p.user_id where u.email = 'admin@demo.neoscol.app'");
  check(pref?.hidden?.includes("announcements"), "préférence enregistrée en base");
  await page.screenshot({ path: `${out}/02-tableau-de-bord-personnalise.png`, fullPage: true });
  await page.getByTestId("dashboard-customize").click();
  await page.getByRole("dialog").getByLabel("Annonces").check();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await announcements.waitFor({ timeout: 15000 });
  check(true, "bloc Annonces réaffiché");

  await page.goto(`${base}/parametres`);
  check((await text(page)).includes("Fonctionnalités"), "Paramètres : carte Fonctionnalités de l'établissement");

  const invoice = await q1(
    "select b.invoice_id as id from invoice_balances b join organizations o on o.id = b.organization_id where o.slug = 'demo' and b.balance > 0 and b.status not in ('cancelled', 'draft') limit 1",
  );
  if (invoice) {
    await page.goto(`${base}/finances/factures/${invoice.id}`);
    check(await page.getByRole("button", { name: /Remise/ }).isVisible(), "facture impayée : bouton « Remise »");
  } else check(false, "facture impayée de démonstration introuvable");

  const assessment = await q1(
    "select a.id from assessments a join organizations o on o.id = a.organization_id where o.slug = 'demo' limit 1",
  );
  if (assessment) {
    for (const format of ["xlsx", "csv"]) {
      const res = await page.request.get(`${base}/api/notes/evaluations/${assessment.id}/export?format=${format}`);
      const type = res.headers()["content-type"] ?? "";
      check(res.status() === 200 && (format === "xlsx" ? type.includes("spreadsheetml") : type.includes("csv")), `export des notes ${format.toUpperCase()} (${res.status()})`);
    }
  } else check(false, "évaluation de démonstration introuvable");
  await page.context().close();
}

console.log("\n=== 3. Super Admin : prix des formules, fonctionnalités d'un établissement ===");
{
  const page = await login("superadmin@demo.neoscol.app");
  await page.goto(`${base}/plateforme/formules`);
  check((await page.getByRole("button", { name: /Modifier le prix/ }).count()) >= 3, "« Modifier le prix » sur chaque formule");
  const org = await q1("select id from organizations where slug = 'demo'");
  await page.goto(`${base}/plateforme/etablissements/${org.id}`);
  check((await text(page)).includes("Fonctionnalités"), "fiche établissement : fonctionnalités réglables par le Super Admin");
  await page.context().close();
}

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est OK.");
process.exit(problems.length ? 1 : 0);
