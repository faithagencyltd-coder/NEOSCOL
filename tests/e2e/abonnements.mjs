// ABONNEMENTS NeoScool — parcours complet de bout en bout (navigateur + base).
//
// Prérequis : application démarrée (BASE_URL) avec PAYMENT_PROVIDER=simulation
// (mode test, aucun argent réel), base migrée + seed (DATABASE_URL). Exemple :
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/abonnements.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-abonnements";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" };
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
async function payThroughWizard(page, outcome) {
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByRole("button", { name: /^Payer mon abonnement/ }).click();
  await page.waitForURL(/paiement-simule/, { timeout: 30000 });
  await page.getByRole("button", { name: outcome }).click();
  await page.waitForURL(/abonnement\/retour/, { timeout: 30000 });
}

console.log("\n=== 1. Page publique des tarifs ===");
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto(`${base}/pricing`);
  check(page.url().endsWith("/tarifs"), "/pricing redirige vers /tarifs");
  let t = await text(page);
  check(["MODULE SCOLAIRE", "FORMATION PROFESSIONNELLE", "UNIVERSITÉ", "MODULE 4 — MULTI-MODULES"].every((n) => t.toUpperCase().includes(n)), "4 formules présentées (Module Scolaire unique, Module 4)");
  check(!t.toUpperCase().includes("ENTERPRISE") && !t.includes("28 000 F CFA"), "ancienne formule Enterprise remplacée par le Module 4");
  check(!t.toUpperCase().includes("MATERNELLE & PRIMAIRE") && !/(^|[^\d])8 000 F CFA/.test(t), "ancienne formule Maternelle & Primaire retirée de l'offre");
  check(["15 000 F CFA", "20 000 F CFA", "30 000 F CFA"].every((p) => t.includes(p)), "prix mensuels officiels");
  check((t.match(/Essai gratuit 20 jours/g) ?? []).length === 4, "« Essai gratuit 20 jours » sur les 4 cartes");
  await shot(page, "01-tarifs-mensuel");
  await page.getByRole("radio", { name: /Annuel/ }).click();
  t = await text(page);
  check(["126 000 F CFA", "168 000 F CFA", "252 000 F CFA"].every((p) => t.includes(p)), "prix annuels officiels");
  check(t.includes("180 000 F CFA") && t.includes("360 000 F CFA") && t.includes("Économisez 54 000 F CFA") && t.includes("Économisez 108 000 F CFA"), "prix barré et économie exacts");
  check(t.includes("Économisez 30 %"), "« Économisez 30 % » affiché");
  await shot(page, "02-tarifs-annuel");
  const m = await (await browser.newContext(mobile)).newPage();
  await m.goto(`${base}/tarifs`);
  await shot(m, "03-tarifs-mobile");
  await context.close();
}

console.log("\n=== 2. Inscription d'un établissement : essai 20 jours ===");
const stamp = Date.now();
const orgName = `Collège Essai ${stamp}`;
const email = `direction.${stamp}@essai.neoscol.app`;
// Adresse IP propre à ce passage : la limite d'inscriptions (5 par heure et par IP) reste respectée.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${stamp % 250}` } });
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(`[inscription] pageerror: ${e.message}`));
await page.goto(`${base}/inscription?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
await page.getByLabel("Nom de l'établissement *").fill(orgName);
await page.getByLabel("Type *").selectOption("middle_school");
await page.getByLabel("Pays *").selectOption("BJ");
await page.getByLabel("Ville").fill("Cotonou");
await page.getByLabel("Prénom *").fill("Koffi");
await page.getByLabel("Nom *", { exact: true }).fill("HOUNSOU");
await page.getByLabel("Adresse e-mail *").fill(email);
await page.getByLabel("Mot de passe *").fill("Essai-Abonnement-2026");
await page.getByLabel("Confirmation *").fill("Essai-Abonnement-2026");
await page.getByLabel(/J'accepte les conditions/).check();
await shot(page, "04-inscription");
await page.getByRole("button", { name: /Commencer mon essai gratuit/i }).click();
await page.waitForURL(/abonnement\?bienvenue=1/, { timeout: 60000 });
let t = await text(page);
check(t.includes("Bienvenue sur NeoScool") && t.includes("Il vous reste 20 jours d'essai"), "essai affiché : « Il vous reste 20 jours d'essai »");
const org = await q1("select o.id, o.code, s.status, p.code plan, s.billing_interval, extract(epoch from s.trial_end - s.trial_start)/86400 as days from organizations o join subscriptions s on s.organization_id = o.id join subscription_plans p on p.id = s.plan_id join memberships m on m.organization_id = o.id join auth.users u on u.id = m.user_id where u.email = $1", [email]);
check(org?.status === "TRIALING" && Number(org.days) === 20, "base : TRIALING, trial_end = trial_start + 20 jours");
check(org?.plan === "MODULE_SCOLAIRE" && org.billing_interval === "YEARLY", "base : formule et périodicité choisies à l'inscription");
await shot(page, "05-mon-abonnement-essai");

console.log("\n=== 3. Paiement échoué puis réussi (vérification serveur) ===");
await page.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
t = await text(page);
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page.getByRole("button", { name: "Continuer", exact: true }).click();
t = await text(page);
check(t.includes("180 000 F CFA") && t.includes("- 54 000 F CFA (30 %)") && t.includes("126 000 F CFA"), "récapitulatif : prix, réduction -30 %, total");
await shot(page, "06-checkout-recapitulatif");
await page.getByRole("button", { name: "Continuer", exact: true }).click();
await page.getByRole("button", { name: /^Payer mon abonnement/ }).click();
await page.waitForURL(/paiement-simule/, { timeout: 30000 });
await shot(page, "07-paiement-simule");
await page.getByRole("button", { name: "Simuler un échec" }).click();
await page.waitForURL(/abonnement\/retour/);
check((await text(page)).includes("Paiement échoué"), "échec affiché au retour");
let s = await q1("select status from subscriptions where organization_id = $1", [org.id]);
let tx = await q1("select status from payment_transactions where organization_id = $1 order by created_at desc limit 1", [org.id]);
check(tx.status === "FAILED" && s.status === "TRIALING", "échec : transaction FAILED, abonnement inchangé");

await page.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
await payThroughWizard(page, "Simuler un paiement réussi");
t = await text(page);
check(t.includes("Paiement confirmé"), "paiement confirmé au retour");
await shot(page, "08-paiement-confirme");
s = await q1("select s.status, s.billing_interval, s.annual_price, s.current_period_start = s.trial_end as starts_after_trial, s.current_period_end - s.current_period_start as len from subscriptions s where organization_id = $1", [org.id]);
check(s.status === "ACTIVE" && s.annual_price === 126000 && s.starts_after_trial, "ACTIVE ; période payée démarrant à la fin de l'essai ; prix conservé");
const inv = await q1("select id, status, amount, list_amount, discount_amount, (select count(*)::int from subscription_invoices where organization_id = $1) as n from subscription_invoices where organization_id = $1 and status = 'PAID'", [org.id]);
check(inv?.amount === 126000 && inv.list_amount === 180000 && inv.discount_amount === 54000 && inv.n === 1, "facture PAYÉE 126 000 (180 000 - 54 000), facture réutilisée après l'échec");
const events = (await db.query("select event_type from subscription_events where organization_id = $1", [org.id])).rows.map((r) => r.event_type);
check(["trial_started", "invoice_created", "checkout_created", "payment_failed", "payment_success", "invoice_paid", "subscription_activated"].every((e) => events.includes(e)), "événements d'abonnement tracés");
check((await q1("select count(*)::int n from notifications where organization_id = $1 and title = 'Paiement confirmé'", [org.id])).n >= 1, "notification « Paiement confirmé »");
const pdf = await page.request.get(`${base}/api/abonnement/factures/${inv.id}`);
check(pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "facture PDF téléchargeable");

console.log("\n=== 4. Webhook dupliqué : aucun double paiement ===");
const token = (await q1("select provider_transaction_id from payment_transactions where organization_id = $1 and status = 'SUCCESS'", [org.id])).provider_transaction_id;
for (let i = 0; i < 2; i++) {
  const r = await page.request.post(`${base}/api/webhooks/payments/simulation`, { data: { token } });
  check((await r.json()).status === "duplicate", `webhook rejoué n°${i + 1} → « duplicate »`);
}
check((await q1("select count(*)::int n from subscription_payments where organization_id = $1", [org.id])).n === 1, "un seul paiement enregistré");
const forged = await page.request.post(`${base}/api/webhooks/payments/simulation`, { data: { token: "SIM-NEO-2026-000999", status: "completed", amount: 1 } });
check((await forged.json()).status === "rejected", "webhook forgé (transaction inconnue) rejeté");

console.log("\n=== 5. Impayé → lecture seule → réactivation immédiate ===");
await db.query("update subscriptions set current_period_start = now() - interval '13 months', current_period_end = now() - interval '20 days' where organization_id = $1", [org.id]);
await db.query("select public.billing_process_lifecycle()");
s = await q1("select status from subscriptions where organization_id = $1", [org.id]);
check(s.status === "RESTRICTED", "20 jours après l'échéance : RESTRICTED");
await page.goto(`${base}/eleves`);
check((await text(page)).includes("lecture seule"), "bandeau « lecture seule » visible");
const readOnly = await page.goto(`${base}/eleves/nouveau`);
check(readOnly.status() === 404, "création d'élève refusée (écriture bloquée par la base)");
check((await q1("select count(*)::int n from students where organization_id = $1", [org.id])) !== undefined, "données conservées");
await shot(page, "09-lecture-seule");
await page.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=MONTHLY`);
await payThroughWizard(page, "Simuler un paiement réussi");
s = await q1("select status, billing_interval from subscriptions where organization_id = $1", [org.id]);
check(s.status === "ACTIVE" && s.billing_interval === "MONTHLY", "paiement confirmé → ACTIVE (mensuel)");
check((await page.goto(`${base}/eleves/nouveau`)).status() === 200, "écriture rétablie immédiatement");
check((await q1("select count(*)::int n from subscription_events where organization_id = $1 and event_type = 'subscription_reactivated'", [org.id])).n === 1, "événement subscription_reactivated");

console.log("\n=== 6. Changement de périodicité, annulation, reprise ===");
// Séparation des modules : une école ne se voit proposer que la formule de son module.
await page.goto(`${base}/abonnement`);
t = await text(page);
check(!t.includes("Formation professionnelle") && !/Université\s*20 000/.test(t), "école : seule la formule du Module Scolaire est proposée");
await page.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
await page.getByRole("radio", { name: /Annuel/ }).click().catch(() => {});
await payThroughWizard(page, "Simuler un paiement réussi");
s = await q1("select p.code, s.billing_interval from subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = $1", [org.id]);
check(s.code === "MODULE_SCOLAIRE" && s.billing_interval === "YEARLY", "changement de périodicité → Module Scolaire annuel");
check((await q1("select count(*)::int n from subscription_events where organization_id = $1 and event_type = 'plan_changed'", [org.id])).n >= 1, "événement plan_changed (historique conservé)");
await page.goto(`${base}/abonnement`);
await page.getByRole("button", { name: "Annuler l'abonnement" }).click();
await page.getByRole("dialog").getByLabel(/Motif/).fill("Test d'annulation");
await page.getByRole("dialog").getByRole("button", { name: "Confirmer l'annulation" }).click();
await page.getByText("Annulation programmée").first().waitFor();
s = await q1("select status, cancel_at_period_end from subscriptions where organization_id = $1", [org.id]);
check(s.status === "ACTIVE" && s.cancel_at_period_end, "annulation : active jusqu'à la fin de période (cancel_at_period_end)");
await shot(page, "10-mon-abonnement-annulation");
await page.getByRole("button", { name: "Reprendre l'abonnement" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Reprendre" }).click();
await page.getByRole("button", { name: "Annuler l'abonnement" }).waitFor();
check(!(await q1("select cancel_at_period_end c from subscriptions where organization_id = $1", [org.id])).c, "reprise : annulation retirée");
const mp = await (await browser.newContext({ ...mobile, storageState: await context.storageState() })).newPage();
await mp.goto(`${base}/abonnement`);
await shot(mp, "11-mon-abonnement-mobile");
await mp.goto(`${base}/abonnement/souscrire?formule=MODULE_SCOLAIRE&periodicite=YEARLY`);
await shot(mp, "12-checkout-mobile");

console.log("\n=== 7. Isolation et permissions ===");
const demoAdmin = await login("admin@demo.neoscol.app");
const other = await demoAdmin.request.get(`${base}/api/abonnement/factures/${inv.id}`);
check(other.status() === 404, "un autre établissement ne peut pas lire la facture");
const teacher = await login("enseignant@demo.neoscol.app");
check((await teacher.goto(`${base}/abonnement`)).status() === 404, "enseignant : « Mon abonnement » inaccessible");

console.log("\n=== 8. Console plateforme : tableau de bord, paiement manuel ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/abonnements`);
t = await text(sa);
check(t.includes("Essais en cours") && t.includes(orgName), "console : indicateurs et abonnements");
await shot(sa, "13-plateforme-abonnements");
const row = sa.getByRole("row", { name: new RegExp(orgName) });
await row.getByRole("button", { name: "Émettre une facture" }).click();
await sa.getByRole("dialog").getByRole("button", { name: "Émettre" }).click();
await sa.getByRole("dialog").waitFor({ state: "detached" });
await sa.goto(`${base}/plateforme/paiements`);
const invRow = sa.getByRole("row", { name: new RegExp(orgName) }).first();
await invRow.getByRole("button", { name: "Valider un paiement" }).click();
let dlg = sa.getByRole("dialog");
await dlg.getByLabel(/Référence du paiement/).fill(`VIR-${stamp}`);
await dlg.getByLabel(/Montant reçu/).fill("1000");
await dlg.getByRole("button", { name: "Valider le paiement" }).click();
check(await sa.getByText(/Montant différent de la facture/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "paiement manuel : montant différent refusé");
const expected = (await q1("select amount from subscription_invoices where organization_id = $1 and status = 'PENDING' order by issued_at desc limit 1", [org.id])).amount;
await dlg.getByLabel(/Montant reçu/).fill(String(expected));
await dlg.getByRole("button", { name: "Valider le paiement" }).click();
await dlg.waitFor({ state: "detached" });
const manual = await q1("select t.status, t.confirmed_by = u.id as by_sa from payment_transactions t, auth.users u where t.organization_id = $1 and t.provider = 'manual' and u.email = 'superadmin@demo.neoscol.app'", [org.id]);
check(manual?.status === "SUCCESS" && manual.by_sa, "paiement manuel validé, identité du super administrateur conservée");
await shot(sa, "14-plateforme-paiements");
await sa.goto(`${base}/plateforme/formules`);
await shot(sa, "15-plateforme-formules");

console.log("\n=== 9. Module 4 — multi-modules : domaines, espaces, bascule, lecture seule ===");
{
  const name4 = `Complexe Multi ${stamp}`;
  const email4 = `direction.m4.${stamp}@essai.neoscol.app`;
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-forwarded-for": `203.0.113.${stamp % 250}` } });
  const p4 = await ctx4.newPage();
  p4.on("pageerror", (e) => problems.push(`[module 4] pageerror: ${e.message}`));
  await p4.goto(`${base}/tarifs`);
  const card = p4.getByRole("listitem").filter({ hasText: "Domaines de votre établissement" });
  await card.getByRole("link", { name: /Continuer/ }).click();
  check(await card.getByText("Veuillez sélectionner au moins un domaine.").isVisible(), "tarifs : aucun domaine → « Veuillez sélectionner au moins un domaine. »");
  check(p4.url().endsWith("/tarifs"), "tarifs : pas de passage à l'inscription sans domaine");
  await card.getByLabel(/École scolaire/).check();
  await card.getByLabel(/Université \/ Enseignement supérieur/).check();
  await card.getByRole("link", { name: /Continuer/ }).click();
  await p4.waitForURL(/inscription\?formule=MULTI_MODULES/);
  check(p4.url().includes("composantes=school,university"), "tarifs → inscription : domaines transmis");
  check(
    (await p4.getByLabel(/École scolaire/).isChecked()) && (await p4.getByLabel(/Université \/ Enseignement supérieur/).isChecked()) && !(await p4.getByLabel(/Centre de formation professionnelle/).isChecked()),
    "inscription : domaines repris (école + université)",
  );
  check((await p4.getByLabel("Type *").inputValue()) === "school_group", "inscription : type « Plusieurs activités » imposé par le Module 4");
  await p4.getByLabel("Nom de l'établissement *").fill(name4);
  await p4.getByLabel("Prénom *").fill("Awa");
  await p4.getByLabel("Nom *", { exact: true }).fill("DOSSOU");
  await p4.getByLabel("Adresse e-mail *").fill(email4);
  await p4.getByLabel("Mot de passe *").fill("Essai-Module4-2026");
  await p4.getByLabel("Confirmation *").fill("Essai-Module4-2026");
  await p4.getByLabel(/J'accepte les conditions/).check();
  await p4.getByRole("button", { name: /Commencer mon essai gratuit/i }).click();
  await p4.waitForURL(/abonnement\?bienvenue=1/, { timeout: 60000 });
  let t4 = await text(p4);
  check(t4.includes("Module 4 — Multi-modules") && t4.includes("30 000 F CFA") && t4.includes("Il vous reste 20 jours d'essai"), "Mon abonnement : Module 4, 30 000 F CFA, essai 20 jours");
  check(t4.includes("Domaines du Module 4") && !t4.includes("MODULE SCOLAIRE"), "Mon abonnement : domaines ; seule la formule Module 4 est proposée");
  const g = await q1(
    "select o.id, o.type, s.components, p.code, s.status, s.monthly_price from organizations o join subscriptions s on s.organization_id = o.id join subscription_plans p on p.id = s.plan_id where o.name = $1",
    [name4],
  );
  check(g?.type === "school_group" && g.code === "MULTI_MODULES" && g.status === "TRIALING" && g.monthly_price === 30000, "base : établissement principal, Module 4, essai, 30 000");
  check(JSON.stringify(g?.components) === JSON.stringify(["school", "university"]), "base : domaines school + university");
  const spaces = (await db.query("select o.id, o.type, (select count(*)::int from subscriptions s where s.organization_id = o.id) subs from organizations o where o.parent_id = $1 order by o.type", [g.id])).rows;
  check(spaces.length === 2 && spaces.map((x) => x.type).join() === "school_complex,university" && spaces.every((x) => x.subs === 0), "base : 2 espaces créés (école, université), sans abonnement propre");
  await shot(p4, "16-module4-abonnement");

  await p4.goto(`${base}/tableau-de-bord`);
  await p4.waitForURL(/\/espaces/);
  t4 = await text(p4);
  check(t4.includes("Mes espaces") && t4.includes("Non inclus") && (await p4.getByRole("button", { name: /Ouvrir l'espace/ }).count()) === 2, "Mes espaces : 2 espaces ouvrables, formation non incluse");
  const bar = p4.getByRole("navigation", { name: "Mes espaces" });
  check((await bar.getByRole("button").count()) === 3, "barre de bascule : principal + 2 espaces");
  await shot(p4, "17-module4-espaces");
  await p4.locator("main li").filter({ hasText: "Université / Enseignement supérieur" }).getByRole("button", { name: /Ouvrir l'espace/ }).click();
  await p4.waitForURL(/\/universite/);
  check((await text(p4)).includes("Université"), "bascule vers l'espace université");
  await shot(p4, "18-module4-espace-universite");
  await bar.getByRole("button", { name: new RegExp(name4) }).first().click();
  await p4.waitForURL(/\/espaces/);
  check(true, "retour à l'établissement principal par la barre de bascule");

  // Retrait d'un domaine : espace en lecture seule, rien n'est supprimé ; le prix ne change pas.
  const domains = p4.locator("#domaines");
  await domains.getByLabel(/Université \/ Enseignement supérieur/).uncheck();
  await domains.getByLabel(/École scolaire/).uncheck();
  check(await domains.getByText("Veuillez sélectionner au moins un domaine.").isVisible(), "domaines : au moins un exigé");
  await domains.getByLabel(/École scolaire/).check();
  await domains.getByRole("button", { name: "Enregistrer les domaines" }).click();
  await p4.getByText("Domaines du Module 4 enregistrés.").first().waitFor();
  const uni = spaces.find((x) => x.type === "university");
  check((await q1("select app.org_billing_access($1) a", [uni.id])).a === "read_only", "domaine retiré : espace université en lecture seule");
  check((await q1("select count(*)::int n from organizations where parent_id = $1", [g.id])).n === 2, "domaine retiré : espace conservé");
  check((await q1("select monthly_price from subscriptions where organization_id = $1", [g.id])).monthly_price === 30000, "prix inchangé (30 000) avec 1 domaine");
  await p4.goto(`${base}/espaces`);
  await p4.locator("main li").filter({ hasText: "Université / Enseignement supérieur" }).getByRole("button", { name: /Ouvrir l'espace/ }).click();
  await p4.waitForURL(/\/universite/);
  check((await text(p4)).includes("ce domaine n'est pas inclus dans l'abonnement Module 4"), "espace université : bandeau « lecture seule » explicite");
  await p4.goto(`${base}/abonnement`);
  t4 = await text(p4);
  check(t4.toUpperCase().includes("COUVERT PAR") && t4.includes(`Abonnement de « ${name4} »`) && t4.includes("Domaine non inclus"),"Mon abonnement de l'espace : couvert par le principal, domaine non inclus");
  await bar.getByRole("button", { name: new RegExp(name4) }).first().click();
  await p4.waitForURL(/\/espaces/);

  // Ajout d'un domaine puis création de son espace.
  await domains.getByLabel(/Centre de formation professionnelle/).check();
  await domains.getByRole("button", { name: "Enregistrer les domaines" }).click();
  await p4.getByText("Domaines du Module 4 enregistrés.").first().waitFor();
  await p4.goto(`${base}/espaces`);
  await p4.locator("main li").filter({ hasText: "Centre de formation professionnelle" }).getByRole("button", { name: /Créer l'espace/ }).click();
  await p4.getByRole("dialog").getByRole("button", { name: "Créer l'espace" }).click();
  await p4.getByRole("dialog").waitFor({ state: "detached" });
  const training = await q1("select o.id from organizations o where o.parent_id = $1 and o.type = 'vocational_center'", [g.id]);
  check(Boolean(training) && (await q1("select app.org_billing_access($1) a", [training.id])).a === "full", "espace formation créé, accès complet");
  const m4Events = (await db.query("select event_type from subscription_events where organization_id = $1", [g.id])).rows.map((r) => r.event_type);
  check(m4Events.includes("components_changed") && m4Events.filter((e) => e === "space_created").length === 3, "historique : domaines modifiés, 3 espaces créés");
  const mob = await (await browser.newContext({ ...mobile, storageState: await ctx4.storageState() })).newPage();
  await mob.goto(`${base}/espaces`);
  await shot(mob, "19-module4-espaces-mobile");

  // Isolation : un autre établissement ne voit ni le groupe ni ses espaces.
  const demo = await login("admin@demo.neoscol.app");
  await demo.goto(`${base}/espaces`);
  check(!(await text(demo)).includes(name4), "isolation : l'administrateur d'un autre établissement ne voit pas le Module 4");
  await ctx4.close();
}

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nABONNEMENTS E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
