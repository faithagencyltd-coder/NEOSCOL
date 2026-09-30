// SMS payants, de bout en bout : le Super Admin active la facturation et fixe le
// prix d'un SMS ; l'établissement voit le devis (SMS × prix) avant l'envoi,
// achète du crédit avec le paiement (simulé en local, même vérification serveur
// qu'un vrai fournisseur), puis envoie : chaque SMS consomme le crédit, et un
// SMS non délivré (canal non configuré en local) est recrédité. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-sms-payants";
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

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const TEMPLATE = "Crédit SMS — test";
const reset = async () => {
  await db.query("update platform_sms_pricing set billing_enabled = false, default_price = 25, min_purchase = 100 where id = 1");
  await db.query("delete from sms_wallet_movements where organization_id = $1", [DEMO]);
  await db.query("delete from sms_wallets where organization_id = $1", [DEMO]);
  await db.query("delete from sms_credit_purchases where organization_id = $1", [DEMO]);
  await db.query("delete from message_campaigns where organization_id = $1 and name like 'Test crédit SMS%'", [DEMO]).catch(() => {});
  await db.query("delete from message_templates where organization_id = $1 and name = $2", [DEMO, TEMPLATE]);
};
await reset();
await db.query("insert into message_templates (organization_id, name, channel, body) values ($1, $2, 'sms', 'Bonjour {{destinataire}}, réunion des parents vendredi à 16 h. Merci.')", [DEMO, TEMPLATE]);

try {
  // 1. Super Admin : facturation active, 25 F le SMS, 100 SMS minimum.
  const { page: sa, context: sctx } = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/sms`);
  await sa.getByTestId("sms-settings").click();
  const dialog = sa.getByRole("dialog");
  await dialog.getByLabel(/Prix d'un SMS/).fill("25");
  await dialog.getByLabel(/Achat minimum/).fill("100");
  await dialog.getByLabel("Facturer les SMS aux établissements").check();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  check(await toast(sa, "Réglages des SMS enregistrés"), "console : facturation activée, prix fixé");
  const pricing = await q1("select billing_enabled, default_price, min_purchase from platform_sms_pricing where id = 1");
  check(pricing.billing_enabled && pricing.default_price === 25 && pricing.min_purchase === 100, "console : réglages enregistrés en base");
  await sa.screenshot({ path: `${out}/console-sms.png`, fullPage: true });

  // 2. Devis avant envoi : crédit insuffisant, envoi bloqué, lien d'achat.
  const { page: admin, context: actx } = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/communication/envois`);
  await admin.getByLabel("Modèle").selectOption({ label: `SMS — ${TEMPLATE}` }).catch(async () => admin.getByLabel("Modèle").selectOption({ label: TEMPLATE }));
  await admin.getByRole("button", { name: "Aperçu des destinataires" }).click();
  const quote = admin.getByTestId("sms-quote");
  await quote.waitFor({ timeout: 15000 });
  const quoteText = await quote.innerText();
  const reachable = Number((await admin.getByTestId("campaign-preview").innerText()).match(/(\d+) destinataire\(s\) joignable/)?.[1] ?? 0);
  check(reachable > 0 && quoteText.replace(/\s+/g, " ").includes(`${reachable} SMS × 25`), `devis : ${reachable} SMS × 25 F affiché avant l'envoi`);
  check(quoteText.includes("Crédit disponible : 0 SMS") && quoteText.includes(`Il manque ${reachable} SMS`), "devis : crédit 0, manque indiqué");
  check(await admin.getByRole("button", { name: /Envoyer à \d+ destinataire/ }).isDisabled(), "envoi bloqué tant que le crédit manque");
  await admin.screenshot({ path: `${out}/devis-envoi.png`, fullPage: true });

  // 3. Achat de crédit (paiement simulé local, vérification serveur).
  await quote.getByRole("link", { name: "Acheter le crédit manquant" }).click();
  await admin.waitForURL(/credit-sms/);
  const total = await admin.getByTestId("sms-purchase-total").innerText();
  check(total.includes("100 SMS × 25") || total.includes(`${Math.max(100, reachable)} SMS × 25`), "achat : total = SMS × prix affiché avant paiement");
  await admin.getByLabel("Nombre de SMS").fill("200");
  await admin.getByRole("button", { name: /Payer et ajouter 200 SMS/ }).click();
  await admin.waitForURL(/paiement-simule/);
  check((await admin.locator("body").innerText()).replace(/\s+/g, " ").includes("5 000"), "paiement : 200 × 25 = 5 000 F demandés");
  await admin.getByRole("button", { name: "Simuler un paiement réussi" }).click();
  await admin.getByTestId("sms-payment-result").waitFor({ timeout: 30000 });
  check((await admin.getByTestId("sms-payment-result").innerText()).includes("200 SMS ajoutés"), "retour : crédit ajouté après vérification du paiement");
  check((await q1("select balance from sms_wallets where organization_id = $1", [DEMO]))?.balance === 200, "base : crédit de 200 SMS");
  await admin.goto(`${base}/communication/credit-sms`);
  check((await admin.locator("body").innerText()).includes("200 SMS"), "page Crédit SMS : solde affiché");
  await admin.screenshot({ path: `${out}/credit-sms.png`, fullPage: true });

  // 4. Envoi : décompte puis recrédit (canal SMS non configuré en local : aucun faux succès).
  await admin.goto(`${base}/communication/envois`);
  await admin.getByLabel("Modèle").selectOption({ label: `SMS — ${TEMPLATE}` }).catch(async () => admin.getByLabel("Modèle").selectOption({ label: TEMPLATE }));
  await admin.getByRole("button", { name: "Aperçu des destinataires" }).click();
  await admin.getByTestId("sms-quote").waitFor({ timeout: 15000 });
  check((await admin.getByTestId("sms-quote").innerText()).includes("Crédit disponible : 200 SMS"), "devis : crédit de 200 SMS disponible");
  await admin.getByRole("button", { name: /Envoyer à \d+ destinataire/ }).click();
  await admin.getByText(/Envoi terminé/).first().waitFor({ timeout: 60000 }).catch(() => {});
  const moves = (await db.query("select reason, sum(delta)::int as total from sms_wallet_movements where organization_id = $1 group by reason", [DEMO])).rows;
  const by = Object.fromEntries(moves.map((m) => [m.reason, m.total]));
  check(by.send === -reachable && by.refund === reachable, `envoi : ${reachable} SMS décomptés puis recrédités (non délivrés)`);
  check((await q1("select balance from sms_wallets where organization_id = $1", [DEMO])).balance === 200, "crédit intact : on ne paie pas un SMS non délivré");
  await sctx.close();
  await actx.close();
} catch (e) {
  problems.push(`Exception : ${e.message}`);
} finally {
  await reset();
  await db.end();
  await browser.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
