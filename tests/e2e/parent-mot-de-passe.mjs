// NEOSCOOL — Connexion parent gratuite : l'école active le portail (mot de passe
// provisoire affiché une fois), le parent se connecte avec téléphone + mot de passe,
// nouveau mot de passe, refus si le compte sert dans un autre établissement, option SMS.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-parent-mot-de-passe";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];

const ORG = "10000000-0000-4000-a000-000000000001";
const OTHER_ORG = "10000000-0000-4000-a000-000000000003";
const phone = `+22997${String(Date.now()).slice(-6)}`;
const guardian = await q1("insert into guardians (organization_id, first_name, last_name, phone) values ($1, 'Afiavi', 'TESTPARENT', $2) returning id", [ORG, phone]);

const admin = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fr-FR" })).newPage();
admin.on("pageerror", (e) => problems.push(`[admin] ${e.message}`));

async function parentSignIn(password) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[parent] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByRole("button", { name: "Parent / Tuteur" }).click();
  await page.getByLabel("Numéro de téléphone").fill(phone);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  const okUrl = await page.waitForURL(/\/portail/, { timeout: 20000 }).then(() => true, () => false);
  return { ctx, page, okUrl };
}

async function credentials(button, submit) {
  await admin.goto(`${base}/parents/${guardian.id}`);
  await admin.getByRole("button", { name: button }).click();
  const dlg = admin.getByRole("dialog");
  await dlg.getByRole("button", { name: submit }).click();
  await dlg.getByTestId("temporary-password").waitFor({ timeout: 20000 });
  return { dlg, password: (await dlg.getByTestId("temporary-password").textContent()).trim() };
}

try {
  await admin.goto(`${base}/connexion`);
  await admin.getByLabel("Adresse e-mail ou matricule").fill("admin@demo.neoscol.app");
  await admin.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await admin.getByRole("button", { name: "Se connecter", exact: true }).click();
  await admin.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });

  console.log("\n=== 1. L'école active le portail : mot de passe provisoire ===");
  const first = await credentials("Activer le portail", "Créer l'accès");
  check(first.password.length >= 10, "mot de passe provisoire affiché");
  check(await first.dlg.getByText(phone).isVisible(), "identifiant = téléphone du parent");
  check(await first.dlg.getByRole("button", { name: "Imprimer la fiche" }).isVisible(), "bouton « Imprimer la fiche »");
  await admin.screenshot({ path: `${out}/1-activation.png` });
  await first.dlg.getByRole("button", { name: "Terminé" }).click();
  const linked = await q1("select g.user_id, u.email, u.phone from guardians g join auth.users u on u.id = g.user_id where g.id = $1", [guardian.id]);
  check(linked?.email === `parent-${guardian.id}@parents.neoscol.invalid`, "compte créé (adresse technique, aucun e-mail envoyé)");
  check(linked?.phone === phone.slice(1), "téléphone conservé sur le compte (option SMS possible)");

  console.log("\n=== 2. Connexion parent : téléphone + mot de passe ===");
  const bad = await (async () => {
    const ctx = await browser.newContext({ locale: "fr-FR" });
    const page = await ctx.newPage();
    await page.goto(`${base}/connexion`);
    await page.getByRole("button", { name: "Parent / Tuteur" }).click();
    check(await page.getByRole("button", { name: "Recevoir plutôt un code par SMS" }).isVisible(), "option SMS proposée en second");
    await page.getByLabel("Numéro de téléphone").fill(phone);
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Accéder à mon espace" }).click();
    const shown = await page.getByText("Numéro de téléphone ou mot de passe incorrect.").waitFor({ timeout: 15000 }).then(() => true, () => false);
    await page.getByRole("button", { name: "Recevoir plutôt un code par SMS" }).click();
    check(await page.getByRole("button", { name: "Recevoir un code par SMS" }).isVisible(), "formulaire SMS toujours disponible");
    await ctx.close();
    return shown;
  })();
  check(bad, "mauvais mot de passe refusé (message unique)");
  const p1 = await parentSignIn(first.password);
  check(p1.okUrl, "parent connecté avec téléphone + mot de passe");
  await p1.page.goto(`${base}/portail/plus`);
  check(await p1.page.getByRole("heading", { name: "Changer mon mot de passe" }).isVisible(), "le parent peut changer son mot de passe lui-même");
  await p1.page.screenshot({ path: `${out}/2-portail-parent.png` });
  await p1.ctx.close();

  console.log("\n=== 3. Nouveau mot de passe (oubli) ===");
  const second = await credentials("Nouveau mot de passe", "Générer");
  check(second.password !== first.password, "nouveau mot de passe généré");
  await admin.screenshot({ path: `${out}/3-nouveau-mot-de-passe.png` });
  await second.dlg.getByRole("button", { name: "Terminé" }).click();
  const old = await parentSignIn(first.password);
  check(!old.okUrl, "l'ancien mot de passe ne fonctionne plus");
  await old.ctx.close();
  const p2 = await parentSignIn(second.password);
  check(p2.okUrl, "le nouveau mot de passe fonctionne");
  await p2.ctx.close();
  check(Boolean(await q1("select 1 from audit_logs where action = 'portal.password_reset' and entity_id = $1", [guardian.id])), "réinitialisation journalisée");

  console.log("\n=== 4. Compte aussi utilisé dans un autre établissement : refus ===");
  await db.query("insert into guardians (organization_id, first_name, last_name, phone, user_id) values ($1, 'Afiavi', 'TESTPARENT', $2, $3)", [OTHER_ORG, phone, linked.user_id]);
  await admin.goto(`${base}/parents/${guardian.id}`);
  await admin.getByRole("button", { name: "Nouveau mot de passe" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Générer" }).click();
  check(
    await admin.getByText("Ce compte est aussi utilisé dans un autre établissement").first().waitFor({ timeout: 15000 }).then(() => true, () => false),
    "une école ne peut pas reprendre l'accès d'un parent d'un autre établissement",
  );
  const p3 = await parentSignIn(second.password);
  check(p3.okUrl, "mot de passe du parent inchangé");
  await p3.ctx.close();
} finally {
  const row = await q1("select user_id from guardians where id = $1", [guardian.id]);
  await db.query("delete from guardians where phone = $1", [phone]);
  if (row?.user_id) await db.query("delete from auth.users where id = $1", [row.user_id]);
  await browser.close();
  await db.end();
}

console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est OK.");
process.exit(problems.length ? 1 : 0);
