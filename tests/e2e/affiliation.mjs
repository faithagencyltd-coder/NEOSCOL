// NEOSCOOL Affiliates (navigateur) : activation par le Super Admin, demande
// d'adhésion, approbation, lien de recommandation, inscription d'une école
// attribuée, lien falsifié ignoré, commission sur paiement réel, validation,
// versement avec référence, espace affilié, export, accès refusé.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-affiliation";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const q1 = async (sql, params) => (await q(sql, params))[0];
const stamp = Date.now();
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true }).catch(() => {});
const SUPERADMIN = "00000000-0000-4000-a000-000000000001";

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

async function signup(context, orgName, email) {
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[inscription] ${e.message}`));
  if (!page.url().includes("/inscription")) await page.goto(`${base}/inscription?formule=UNIVERSITE&periodicite=MONTHLY`);
  await page.getByLabel("Nom de l'établissement *").fill(orgName);
  await page.getByLabel("Type *").selectOption("university");
  await page.getByLabel("Pays *").selectOption("CI");
  await page.getByLabel("Ville").fill("Bouaké");
  await page.getByLabel("Prénom *").fill("Adjoua");
  await page.getByLabel("Nom *", { exact: true }).fill("KOUASSI");
  await page.getByLabel("Adresse e-mail *").fill(email);
  await page.getByLabel("Mot de passe *").fill("Essai-Affiliation-2026");
  await page.getByLabel("Confirmation *").fill("Essai-Affiliation-2026");
  await page.getByLabel(/J'accepte les conditions/).check();
  return page;
}

// État de départ : programme désactivé, réglages par défaut.
await q("update affiliate_settings set enabled = false, signups_open = true, links_enabled = true, codes_enabled = true, require_approval = true, hold_days = 30, reward_type = 'percent', reward_value = 20, reward_event = 'first_payment' where id = 1");
const teacherId = (await q1("select id from auth.users where email = 'enseignant@demo.neoscol.app'")).id;
const existing = await q1("select id, code, status from affiliates where user_id = $1", [teacherId]);

console.log("\n=== 1. Désactivé par défaut ===");
const teacher = await login("enseignant@demo.neoscol.app");
if (!existing) {
  await teacher.goto(`${base}/espace/affiliation`);
  check(await teacher.getByTestId("affiliate-closed").isVisible(), "programme fermé : aucune demande possible");
}
const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
const anon = await anonCtx.newPage();
await anon.goto(`${base}/r/NEO-INCONNU-0000`);
check(new URL(anon.url()).pathname === "/tarifs" && (await anonCtx.cookies()).every((c) => c.name !== "ns_ref"), "lien inconnu : redirection sans cookie");

console.log("\n=== 2. Activation par le Super Admin ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/affiliation?onglet=reglages`);
await sa.getByLabel(/Programme actif/).check();
await sa.locator('input[name="hold_days"]').fill("0");
await sa.getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText("Réglages du programme enregistrés.").first().waitFor({ timeout: 20000 });
const s = await q1("select enabled, hold_days from affiliate_settings where id = 1");
check(s.enabled === true && s.hold_days === 0, "programme activé, délai réglé");
check(Boolean(await q1("select 1 from audit_logs where action = 'platform.affiliate_settings' and created_at > now() - interval '2 minutes'")), "modification journalisée");
await shot(sa, "01-reglages");

console.log("\n=== 3. Demande d'adhésion et approbation ===");
if (!existing) {
  await teacher.goto(`${base}/espace/affiliation`);
  const form = teacher.getByTestId("affiliate-apply");
  await form.locator('select[name="kind"]').selectOption("teacher");
  await form.locator('input[name="phone"]').fill("+225 07 48 12 34 56");
  await form.locator('select[name="payout_method"]').selectOption("mobile_money");
  await form.locator('input[name="payout_details"]').fill("Orange Money +225 07 48 12 34 56");
  await form.locator('input[name="accept_terms"]').check();
  await form.getByRole("button", { name: "Envoyer ma demande" }).click();
  await teacher.getByText("Demande envoyée").first().waitFor({ timeout: 20000 });
}
let aff = await q1("select id, code, status from affiliates where user_id = $1", [teacherId]);
check(Boolean(aff), "demande enregistrée");
if (aff.status !== "approved") {
  await sa.goto(`${base}/plateforme/affiliation?onglet=affilies`);
  await sa.getByTestId(`affiliate-${aff.code}`).getByRole("button", { name: /Approuver|Réactiver/ }).click();
  await sa.getByText("Affilié mis à jour.").first().waitFor({ timeout: 20000 });
  aff = await q1("select id, code, status from affiliates where user_id = $1", [teacherId]);
}
check(aff.status === "approved", "affilié approuvé par le Super Admin");
await teacher.goto(`${base}/espace/affiliation`);
check((await teacher.getByTestId("affiliate-code").textContent())?.trim() === aff.code, "lien et code affichés à l'affilié");
await shot(teacher, "02-espace-affilie");

console.log("\n=== 4. Lien de recommandation → inscription attribuée ===");
const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${stamp % 250}` } });
const v = await visitorCtx.newPage();
await v.goto(`${base}/r/${aff.code}?vers=/inscription`);
check(new URL(v.url()).pathname === "/inscription", "lien → page d'inscription");
check((await visitorCtx.cookies()).some((c) => c.name === "ns_ref" && c.httpOnly), "clic retenu (cookie technique, inaccessible au JavaScript)");
check(await v.getByLabel(/Code de recommandation/).isVisible(), "champ « code de recommandation » à l'inscription");
await v.close();
const orgName = `Université Recommandée ${stamp}`;
const email = `aff.${stamp}@essai.neoscol.app`;
const page = await signup(visitorCtx, orgName, email);
await page.getByRole("button", { name: /Commencer mon essai gratuit/i }).click();
await page.waitForURL(/abonnement\?bienvenue=1/, { timeout: 60000 });
const org = await q1("select id from organizations where name = $1", [orgName]);
const attr = await q1("select source, status, affiliate_id from affiliate_attributions where organization_id = $1", [org?.id]);
check(attr?.source === "link" && attr.status === "active" && attr.affiliate_id === aff.id, "école attribuée à l'affilié (lien vérifié en base)");
check(Number((await q1("select count(*) n from affiliate_commissions where organization_id = $1", [org?.id])).n) === 0, "inscription en essai : aucune commission");

console.log("\n=== 5. Lien falsifié ===");
const fakeCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${(stamp + 7) % 250}` } });
await fakeCtx.addCookies([{ name: "ns_ref", value: "11111111-2222-4333-8444-555555555555", url: base }]);
const fakeName = `Université Lien Falsifié ${stamp}`;
const fp = await signup(fakeCtx, fakeName, `fake.${stamp}@essai.neoscol.app`);
await fp.getByRole("button", { name: /Commencer mon essai gratuit/i }).click();
await fp.waitForURL(/abonnement\?bienvenue=1/, { timeout: 60000 });
const fakeOrg = await q1("select id from organizations where name = $1", [fakeName]);
check(!(await q1("select 1 from affiliate_attributions where organization_id = $1", [fakeOrg?.id])), "identifiant de clic inventé : aucune attribution");

console.log("\n=== 6. Paiement réel → commission → validation → versement ===");
await db.query("begin");
await db.query("set local role authenticated");
await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: SUPERADMIN, role: "authenticated" })]);
const inv = (await db.query("select platform_issue_invoice($1, 'UNIVERSITE', 'MONTHLY') id", [org.id])).rows[0].id;
const amount = (await db.query("select amount from subscription_invoices where id = $1", [inv])).rows[0].amount;
await db.query("select platform_record_manual_payment($1, $2, $3, 'virement', 'E2E affiliation')", [inv, `VIR-AFF-E2E-${stamp}`, amount]);
await db.query("commit");
const com = await q1("select id, amount, status from affiliate_commissions where organization_id = $1", [org.id]);
check(com?.amount === Math.round(amount * 0.2) && com.status === "pending", "commission de 20 % créée sur le paiement confirmé");
await sa.goto(`${base}/plateforme/affiliation?onglet=commissions`);
await sa.getByTestId(`commission-${com.id}`).getByRole("button", { name: "Valider" }).click();
await sa.getByText("Commission mise à jour.").first().waitFor({ timeout: 20000 });
check((await q1("select status from affiliate_commissions where id = $1", [com.id])).status === "payable", "commission validée → payable (délai 0 jour)");
await sa.goto(`${base}/plateforme/affiliation?onglet=versements`);
const box = sa.getByTestId(`payable-${aff.code}`);
await box.locator('input[name="reference"]').fill(`OM-${stamp}`);
await box.getByRole("button", { name: "Enregistrer le versement" }).click();
await sa.getByText("Versement enregistré.").first().waitFor({ timeout: 20000 });
const paid = await q1("select c.status, p.reference from affiliate_commissions c join affiliate_payouts p on p.id = c.payout_id where c.id = $1", [com.id]);
check(paid?.status === "paid" && paid.reference === `OM-${stamp}`, "versement enregistré avec sa référence réelle");
await shot(sa, "03-versements");
await teacher.goto(`${base}/espace/affiliation`);
check(((await teacher.getByTestId("affiliate-payouts").textContent()) ?? "").includes(`OM-${stamp}`), "versement visible par l'affilié");

console.log("\n=== 7. Export et accès ===");
const xlsx = await sa.request.get(`${base}/plateforme/affiliation/export`);
check(xlsx.status() === 200 && (xlsx.headers()["content-type"] ?? "").includes("spreadsheet"), "export Excel (Super Admin)");
const denied = await teacher.request.get(`${base}/plateforme/affiliation/export`, { maxRedirects: 0 });
check(denied.status() !== 200 || !(denied.headers()["content-type"] ?? "").includes("spreadsheet"), "export refusé hors plateforme");
await teacher.goto(`${base}/plateforme/affiliation`);
check(!(await teacher.getByText("NEOSCOOL Affiliates").count()), "console d'affiliation inaccessible à un enseignant");

console.log("\n=== 8. Désactivation ===");
await sa.goto(`${base}/plateforme/affiliation?onglet=reglages`);
await sa.getByLabel(/Programme actif/).uncheck();
await sa.getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText("Réglages du programme enregistrés.").first().waitFor({ timeout: 20000 });
await teacher.goto(`${base}/espace/affiliation`);
check(((await teacher.textContent("body")) ?? "").includes("Le programme est suspendu") && (await teacher.getByTestId("affiliate-payouts").isVisible()), "désactivé : historique conservé, message affiché");
const off = await (await browser.newContext()).newPage();
await off.goto(`${base}/r/${aff.code}`);
check((await off.context().cookies()).every((c) => c.name !== "ns_ref"), "désactivé : lien sans effet");

await q("update affiliate_settings set hold_days = 30 where id = 1");
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
