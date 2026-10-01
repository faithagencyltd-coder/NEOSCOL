// Paiements en ligne des familles, cycle complet avec le fournisseur de TEST
// (mode test, aucun argent réel ; même chemin qu'un vrai agrégateur) :
// PARENT → PAIEMENT → FOURNISSEUR → WEBHOOK → SUCCESS → COMPTABILITÉ → SOLDE →
// REÇU PDF → NOTIFICATIONS → HISTORIQUE → AUDIT, puis les cas d'erreur
// (échec, annulation, double clic, webhook reçu deux fois, montant différent,
// transaction inconnue, attente puis expiration et confirmation tardive,
// fournisseur sans clés, établissement et plateforme désactivés),
// remboursement automatique et isolation des établissements. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-paiements-familles";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const norm = (s) => s.replace(/[  ]/g, " ");
const text = async (page) => norm(await page.locator("body").innerText());
const toast = (page, t) => page.getByText(t).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);

const DEMO = "10000000-0000-4000-a000-000000000001";
const NOTE = "Test E2E paiements en ligne";

async function login(identifier, { child } = {}) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR" });
  if (child) await context.addCookies([{ name: "neoscol_enfant", value: child, url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/portail|tableau-de-bord|plateforme|formation/, { timeout: 30000 });
  return { page, context };
}

// Enfant du parent de démonstration (identifiant régénéré à chaque réinitialisation de la base).
const AYA = (
  await q1(
    "select s.id from students s join student_guardians sg on sg.student_id = s.id join guardians g on g.id = sg.guardian_id where g.user_id = '00000000-0000-4000-a000-000000000008' and s.first_name = 'Aya' and s.organization_id = $1",
    [DEMO],
  )
).id;

// --- Préparation : plateforme active, établissement désactivé, anciens fournisseurs de test archivés, facture dédiée.
await db.query("update platform_payment_settings set school_payments_enabled = true where id = 1");
await db.query("update org_payment_providers set is_active = false, is_default = false, archived_at = coalesce(archived_at, now()) where organization_id = $1 and label like 'E2E %'", [DEMO]);
await db.query("insert into org_payment_settings (organization_id, online_enabled) values ($1, false) on conflict (organization_id) do update set online_enabled = false, allow_partial = false", [DEMO]);
await db
  .query("update invoices set status = 'cancelled', cancelled_reason = 'Fin du test E2E', cancelled_at = now() where organization_id = $1 and notes = $2 and status = 'issued'", [DEMO, NOTE])
  .catch(() => {});
const year = (await q1("select academic_year_id from enrollments where student_id = $1 order by created_at desc limit 1", [AYA]))?.academic_year_id ?? null;
const invoice = await q1(
  "insert into invoices (organization_id, student_id, academic_year_id, status, currency, subtotal, total, notes, number) values ($1, $2, $3, 'issued', 'XOF', 60000, 60000, $4, '') returning id, number",
  [DEMO, AYA, year, NOTE],
);
await db.query("insert into installments (organization_id, invoice_id, label, due_on, amount, sequence) values ($1, $2, 'Tranche 1', current_date, 20000, 1), ($1, $2, 'Tranche 2', current_date + 30, 40000, 2)", [DEMO, invoice.id]);
const balance = async () => Number((await q1("select balance from invoice_balances where invoice_id = $1", [invoice.id])).balance);
const lastTx = () => q1("select * from fee_payment_transactions where invoice_id = $1 order by created_at desc limit 1", [invoice.id]);
console.log(`Facture de test ${invoice.number} (60 000 F : 20 000 + 40 000)`);

let webhookUrl = "";
const postHook = (body, url = webhookUrl) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

/** Parent : ouvre le paiement de la facture de test ; renvoie la référence affichée par le fournisseur de test. */
async function startPayment(page, choose) {
  await page.goto(`${base}/portail/finances/payer?facture=${invoice.id}`);
  await page.getByTestId("pay-form").waitFor({ timeout: 20000 });
  if (choose) await choose(page);
  await page.getByTestId("pay-submit").click();
  await page.waitForURL(/paiement-test\/NEO-/, { timeout: 30000 });
  await page.getByTestId("fee-test-checkout").waitFor({ timeout: 20000 });
  return decodeURIComponent(page.url().split("/").pop());
}
async function outcome(page, label) {
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/finances\/retour/, { timeout: 30000 });
  await page.getByTestId("fee-return").waitFor({ timeout: 20000 });
  return page.getByTestId("fee-return").getAttribute("data-status");
}

try {
  console.log("\n=== 1. Établissement : activation + fournisseurs ===");
  const { page: admin } = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/parametres/paiements`);
  await admin.getByTestId("fee-settings-form").waitFor({ timeout: 20000 });
  check((await text(admin)).includes("Côté familles") && !(await text(admin)).includes("désactivés au niveau global"), "paramètres › paiements : plateforme autorisée");
  await admin.getByTestId("fee-settings-form").getByLabel(/Activer le paiement en ligne/).check();
  await admin.getByTestId("fee-settings-form").getByRole("button", { name: "Enregistrer" }).click();
  check(await toast(admin, "Paiement en ligne activé pour les familles"), "activation du paiement en ligne par l'établissement");

  // Fournisseur réel sans clés : ne peut pas être activé ; ses clés ne sont jamais réaffichées.
  await admin.goto(`${base}/parametres/paiements/fournisseurs/nouveau`);
  await admin.getByLabel("Type de fournisseur *").selectOption("paydunya");
  await admin.getByLabel("Nom affiché aux familles *").fill("E2E PayDunya");
  await admin.getByRole("button", { name: "ENREGISTRER" }).click();
  await admin.waitForURL(/fournisseurs\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await admin.getByTestId("fee-provider-state").waitFor({ timeout: 20000 });
  await admin.getByTestId("fee-provider-state").getByLabel(/ACTIF/).check();
  await admin.getByTestId("fee-provider-state").getByRole("button", { name: "Appliquer" }).click();
  check(await toast(admin, "Renseignez"), "fournisseur sans clés : activation refusée");
  const SECRET = "test_private_e2eSecret98765";
  await admin.getByLabel(/Clé privée/).fill(SECRET);
  await admin.getByLabel(/Clé principale/).fill("e2eMasterKey12345");
  await admin.getByLabel(/^Token/).fill("e2eToken123456");
  await admin.getByRole("button", { name: "ENREGISTRER" }).click();
  check(await toast(admin, "clés chiffrées"), "clés enregistrées (chiffrées par le serveur)");
  await admin.reload();
  await admin.getByTestId("fee-provider-state").waitFor({ timeout: 20000 });
  const html = await admin.content();
  check(!html.includes(SECRET) && !html.includes("e2eMasterKey12345") && html.includes("Clé enregistrée"), "clés jamais renvoyées au navigateur (indice seulement)");
  const stored = await q1("select secret_ciphertext from org_payment_providers where label = 'E2E PayDunya' and organization_id = $1 and archived_at is null", [DEMO]);
  check(stored.secret_ciphertext?.startsWith("v1:") && !stored.secret_ciphertext.includes(SECRET), "clés chiffrées en base");

  // Fournisseur de test : ajouté, testé, activé par défaut.
  await admin.goto(`${base}/parametres/paiements`);
  await admin.getByTestId("fee-add-provider").click();
  await admin.waitForURL(/fournisseurs\/nouveau/);
  await admin.getByLabel("Type de fournisseur *").selectOption("mock");
  await admin.getByLabel("Nom affiché aux familles *").fill("E2E Mobile Money (test)");
  check((await text(admin)).includes("Fournisseur de test — aucun argent réel"), "fournisseur de test clairement signalé");
  await admin.getByRole("button", { name: "ENREGISTRER" }).click();
  await admin.waitForURL(/fournisseurs\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await admin.getByRole("button", { name: "TESTER LA CONNEXION" }).click();
  check(await toast(admin, "aucune connexion externe"), "tester la connexion : réussi");
  await admin.getByTestId("fee-provider-state").getByLabel(/ACTIF/).check();
  await admin.getByTestId("fee-provider-state").getByLabel("Fournisseur par défaut").check();
  await admin.getByTestId("fee-provider-state").getByRole("button", { name: "Appliquer" }).click();
  check(await toast(admin, "est proposé aux familles"), "fournisseur de test activé (par défaut)");
  webhookUrl = await admin.getByTestId("fee-webhook-url").inputValue();
  check(/\/api\/webhooks\/school-payments\/[0-9a-f]{48}$/.test(webhookUrl), "adresse de notification propre au fournisseur affichée");
  await admin.goto(`${base}/parametres/paiements`);
  await admin.getByTestId("fee-provider-list").waitFor();
  check((await text(admin)).includes("E2E Mobile Money (test)") && (await text(admin)).includes("ACTIF") && (await text(admin)).includes("TEST"), "liste des fournisseurs : actif, mode test");
  await admin.screenshot({ path: `${out}/parametres-paiements.png`, fullPage: true });

  console.log("\n=== 2. Parent : payer une échéance → succès ===");
  const { page: parent, context: pctx } = await login("parent@demo.neoscol.app", { child: AYA });
  await parent.goto(`${base}/portail/finances`);
  await parent.getByTestId("portal-finance-summary").waitFor({ timeout: 20000 });
  const card = parent.locator("div.rounded-xl", { hasText: invoice.number }).first();
  check(await card.getByTestId("pay-now").isVisible(), "bouton PAYER MAINTENANT sur la facture");
  check((await text(parent)).includes("Total facturé") && (await text(parent)).includes("Aya"), "synthèse : élève, total, payé, en attente");
  await parent.screenshot({ path: `${out}/portail-finances.png`, fullPage: true });
  await card.getByTestId("pay-now").click();
  await parent.getByTestId("pay-form").waitFor({ timeout: 20000 });
  check((await text(parent)).includes("Tranche 1") && (await text(parent)).includes("Mobile Money") && !(await text(parent)).includes("E2E PayDunya"), "choix : échéances + seuls les fournisseurs actifs");
  await parent.screenshot({ path: `${out}/payer.png`, fullPage: true });
  const ref1 = await startPayment(parent);
  let tx = await lastTx();
  check(tx.internal_reference === ref1 && Number(tx.amount) === 20000 && tx.status === "PROCESSING", `transaction créée : ${ref1}, 20 000 F (échéance calculée en base), en cours`);
  // Double clic / retour arrière : même demande réutilisée, aucune nouvelle transaction.
  const again = await startPayment(parent);
  const count1 = Number((await q1("select count(*) n from fee_payment_transactions where invoice_id = $1", [invoice.id])).n);
  check(again === ref1 && count1 === 1, "double clic : même transaction réutilisée");
  await parent.screenshot({ path: `${out}/fournisseur-test.png`, fullPage: true });
  const status1 = await outcome(parent, "Simuler un paiement réussi");
  check(status1 === "SUCCESS" && (await text(parent)).includes("Paiement reçu avec succès."), "retour : « Paiement reçu avec succès. »");
  await parent.screenshot({ path: `${out}/retour-succes.png`, fullPage: true });

  tx = await lastTx();
  const pay = await q1("select id, number, amount, method, status, balance_after, notes from payments where id = $1", [tx.payment_id]);
  check(tx.status === "SUCCESS" && pay && Number(pay.amount) === 20000 && pay.status === "completed", `comptabilité : paiement ${pay?.number} enregistré automatiquement`);
  check((await balance()) === 40000 && Number(pay.balance_after) === 40000, "solde de la facture mis à jour (reste 40 000 F)");
  check(pay.notes.includes("MODE TEST"), "écriture marquée MODE TEST");
  const hook = await q1("select processing_status from fee_payment_webhooks where transaction_id = $1 order by received_at limit 1", [tx.id]);
  check(hook?.processing_status === "processed", "notification du fournisseur journalisée puis traitée (vérification serveur)");
  const notifParent = await q1("select title, body from notifications where user_id = '00000000-0000-4000-a000-000000000008' and data ->> 'payment_id' = $1", [pay.id]);
  check(notifParent?.title === "Paiement reçu avec succès.", "notification parent : « Paiement reçu avec succès. »");
  const notifCompta = await q1("select body from notifications where user_id = '00000000-0000-4000-a000-000000000005' and type = 'payment.online' and data ->> 'transaction_id' = $1", [tx.id]);
  check(norm(notifCompta?.body ?? "").startsWith("Nouveau paiement reçu de 20 000 FCFA pour Aya BAMBA"), `notification comptabilité : « ${norm(notifCompta?.body ?? "").slice(0, 60)}… »`);
  const audit = await q1("select count(*) n from audit_logs where entity_id = $1 and action = 'finance.online_payment_confirmed'", [tx.id]);
  check(Number(audit.n) === 1, "audit : paiement en ligne confirmé");
  const receipt = await pctx.request.get(`${base}/api/documents/recus/${pay.id}`);
  const pdf = await receipt.body();
  check(receipt.status() === 200 && (receipt.headers()["content-type"] ?? "").includes("pdf") && pdf.subarray(0, 4).toString() === "%PDF", "reçu PDF téléchargeable par le parent");
  check(await parent.getByTestId("fee-receipt-link").isVisible(), "lien du reçu sur la page de retour");

  console.log("\n=== 3. Webhook reçu deux fois, transaction inconnue, adresse inconnue ===");
  const dup = await postHook({ transaction_id: tx.provider_transaction_id });
  const payments = Number((await q1("select count(*) n from payments where invoice_id = $1", [invoice.id])).n);
  check(dup.status === 200 && dup.json?.status === "duplicate" && payments === 1, "webhook reçu deux fois : ignoré, un seul paiement");
  const unknown = await postHook({ transaction_id: "MOCK-NEO-2026-99999999" });
  check(unknown.status === 200 && unknown.json?.status === "rejected", "transaction inconnue : rejetée");
  const badUrl = await postHook({ transaction_id: tx.provider_transaction_id }, webhookUrl.replace(/[0-9a-f]{48}$/, "0".repeat(48)));
  check(badUrl.status === 404, "adresse de notification inconnue : 404");
  const forged = await postHook({ status: "SUCCESS", amount: 40000, reference: "NEO-2026-1" });
  check(forged.json?.status === "rejected" && (await balance()) === 40000, "notification forgée (sans identifiant vérifiable) : aucun effet");

  console.log("\n=== 4. Échec, annulation, montant différent ===");
  const refFail = await startPayment(parent, (p) => p.getByText("Tout le reste à payer").click());
  check((await outcome(parent, "Simuler un refus")) === "FAILED", "paiement refusé : statut FAILED");
  check(Number((await q1("select count(*) n from payments where invoice_id = $1", [invoice.id])).n) === 1 && (await balance()) === 40000, "échec : aucune écriture comptable");
  const refCancel = await startPayment(parent, (p) => p.getByText("Tout le reste à payer").click());
  check(refCancel !== refFail && (await outcome(parent, "Annuler le paiement")) === "CANCELLED", "paiement annulé : statut CANCELLED");
  await startPayment(parent, (p) => p.getByText("Tout le reste à payer").click());
  await outcome(parent, /Test de sécurité/);
  tx = await lastTx();
  check(tx.status === "PROCESSING" && tx.needs_review && /Montant confirmé/.test(tx.review_reason) && (await balance()) === 40000, "montant différent confirmé par le fournisseur : refusé, cas à traiter");
  const wrongTx = tx;

  console.log("\n=== 5. Comptabilité : tableau de bord, rapprochement ===");
  const { page: compta } = await login("comptable@demo.neoscol.app");
  await compta.goto(`${base}/finances/paiements-en-ligne`);
  await compta.getByTestId("fee-stats").waitFor({ timeout: 20000 });
  let t = await text(compta);
  check(t.includes(ref1) && t.includes(refFail) && t.includes("Réussi") && t.includes("Échoué") && t.includes("Annulé"), "transactions listées avec leurs statuts");
  check(t.includes("Par fournisseur") && t.includes("E2E Mobile Money (test)"), "totaux par fournisseur et par moyen");
  await compta.screenshot({ path: `${out}/comptabilite-paiements-en-ligne.png`, fullPage: true });
  await compta.goto(`${base}/finances/paiements-en-ligne?q=${ref1}`);
  await compta.getByTestId("fee-transactions").waitFor({ timeout: 20000 });
  check((await compta.getByTestId("fee-transactions").locator("tbody tr").count()) === 1, "recherche par référence");
  await compta.goto(`${base}/finances/paiements-en-ligne?onglet=a-traiter`);
  await compta.getByText(wrongTx.internal_reference).first().waitFor({ timeout: 20000 });
  check(true, "onglet À traiter : cas du montant différent");
  await compta.goto(`${base}/finances/paiements-en-ligne/${wrongTx.id}`);
  await compta.getByTestId("fee-tx-events").waitFor({ timeout: 20000 });
  await compta.getByRole("button", { name: "Vérifier auprès du fournisseur" }).click();
  check(await toast(compta, "Confirmation refusée par les contrôles"), "vérification auprès du fournisseur : toujours refusée (montant)");
  await compta.getByRole("button", { name: "Marquer comme traité" }).click();
  await compta.getByRole("dialog").getByLabel(/Comment le cas a été traité/).fill("Fournisseur contacté : montant erroné, paiement non reçu");
  await compta.getByRole("dialog").getByRole("button", { name: "Marquer traité" }).click();
  check(await toast(compta, "Cas marqué comme traité"), "cas marqué comme traité (trace conservée)");
  await db.query("update fee_payment_transactions set expires_at = now() - interval '1 minute' where id = $1", [wrongTx.id]);

  console.log("\n=== 6. En attente → expiré → confirmation tardive acceptée ===");
  const refLate = await startPayment(parent, (p) => p.getByText("Tout le reste à payer").click());
  check((await q1("select status from fee_payment_transactions where internal_reference = $1", [refLate])).status === "PROCESSING", `paiement en attente (${refLate})`);
  await parent.goto(`${base}/portail/finances/retour?ref=${refLate}`);
  await parent.getByTestId("fee-return").waitFor({ timeout: 20000 });
  check((await parent.getByTestId("fee-return").getAttribute("data-status")) === "PROCESSING" && (await text(parent)).includes("en attente"), "retour sans confirmation : en attente (le retour du navigateur ne prouve rien)");
  await db.query("update fee_payment_transactions set expires_at = now() - interval '1 minute' where internal_reference = $1", [refLate]);
  await parent.goto(`${base}/portail/finances`);
  await parent.getByTestId("portal-finance-summary").waitFor({ timeout: 20000 });
  check((await q1("select status from fee_payment_transactions where internal_reference = $1", [refLate])).status === "EXPIRED", "délai dépassé : EXPIRED");
  await db.query("insert into payment_simulations (reference, outcome, amount) values ($1, 'completed', 40000) on conflict (reference) do update set outcome = 'completed', amount = 40000", [refLate]);
  const late = await postHook({ transaction_id: `MOCK-${refLate}` });
  check(late.json?.status === "confirmed" && (await balance()) === 0, "confirmation tardive du fournisseur : acceptée, facture soldée");
  await parent.goto(`${base}/portail/finances`);
  await parent.getByTestId("portal-online-payments").waitFor({ timeout: 20000 });
  t = await text(parent);
  check(!(await parent.locator("div.rounded-xl", { hasText: invoice.number }).first().getByTestId("pay-now").isVisible().catch(() => false)), "facture soldée : plus de bouton de paiement");
  check(t.includes("Expiré") || t.includes("Réussi"), "historique des paiements en ligne côté parent");

  console.log("\n=== 7. Remboursement (automatique, fournisseur de test) ===");
  const first = await q1("select id from fee_payment_transactions where internal_reference = $1", [ref1]);
  await compta.goto(`${base}/finances/paiements-en-ligne/${first.id}`);
  await compta.getByTestId("fee-refund-request").click();
  await compta.getByRole("dialog").getByLabel("Montant *").fill("5000");
  await compta.getByRole("dialog").getByLabel("Motif *").fill("Trop-perçu sur la tranche 1");
  await compta.getByRole("dialog").getByRole("button", { name: "Demander" }).click();
  check(await toast(compta, "Remboursement demandé"), "DEMANDER UN REMBOURSEMENT");
  await compta.getByTestId("fee-refund-auto").waitFor({ timeout: 20000 });
  await compta.getByTestId("fee-refund-auto").click();
  check(await toast(compta, "Remboursement effectué auprès du fournisseur"), "REMBOURSER : automatique auprès du fournisseur");
  const r = await q1("select status, mode, external_reference from fee_payment_refunds where transaction_id = $1", [first.id]);
  const after = await q1("select status, refunded_amount from fee_payment_transactions where id = $1", [first.id]);
  check(r.status === "completed" && r.mode === "automatic" && after.status === "PARTIALLY_REFUNDED" && Number(after.refunded_amount) === 5000, "remboursement tracé, transaction remboursée en partie");
  check((await balance()) === 5000, "comptabilité : le remboursement rouvre 5 000 F sur la facture");
  await compta.screenshot({ path: `${out}/remboursement.png`, fullPage: true });

  console.log("\n=== 8. Désactivations (établissement, plateforme) ===");
  await db.query("update org_payment_settings set online_enabled = false where organization_id = $1", [DEMO]);
  await parent.goto(`${base}/portail/finances`);
  await parent.getByTestId("portal-finance-summary").waitFor({ timeout: 20000 });
  check((await parent.getByTestId("pay-now").count()) === 0, "établissement désactivé : aucun bouton de paiement");
  await db.query("update org_payment_settings set online_enabled = true where organization_id = $1", [DEMO]);
  const { page: sa } = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme/paiements-en-ligne`);
  await sa.getByTestId("school-payments-global").waitFor({ timeout: 20000 });
  await sa.getByRole("button", { name: "Désactiver pour tous les établissements" }).click();
  check(await toast(sa, "désactivés pour tous les établissements"), "Super Admin : désactivation globale");
  await sa.screenshot({ path: `${out}/super-admin-global.png`, fullPage: true });
  await admin.goto(`${base}/parametres/paiements`);
  await admin.getByTestId("fee-global-off").waitFor({ timeout: 20000 });
  check((await text(admin)).includes("Les paiements en ligne sont actuellement désactivés au niveau global."), "établissement : message de désactivation globale");
  await parent.goto(`${base}/portail/finances`);
  await parent.getByTestId("portal-finance-summary").waitFor({ timeout: 20000 });
  check((await text(parent)).includes("Les paiements en ligne sont actuellement désactivés au niveau global.") && (await parent.getByTestId("pay-now").count()) === 0, "parent : message global, aucun bouton");
  const kept = await q1("select count(*) n from org_payment_providers where organization_id = $1 and label like 'E2E %' and archived_at is null", [DEMO]);
  check(Number(kept.n) === 2, "configurations conservées pendant la désactivation");
  await sa.getByRole("button", { name: "Activer pour tous les établissements" }).click();
  check(await toast(sa, "Paiements en ligne des établissements activés"), "Super Admin : réactivation globale");

  console.log("\n=== 9. Isolation ===");
  const { page: other } = await login("formation@demo.neoscol.app");
  const resp = await other.goto(`${base}/finances/paiements-en-ligne/${first.id}`);
  await other.waitForTimeout(1500);
  check(resp.status() === 404 || /introuvable|n'existe pas/i.test(await text(other)), "autre établissement : transaction introuvable");
  const leak = await other.goto(`${base}/finances/paiements-en-ligne`);
  await other.waitForTimeout(1500);
  check(leak.status() === 404 || !(await text(other)).includes(ref1), "autre établissement : aucune transaction visible");
} catch (e) {
  problems.push(`Exception : ${e.message}`);
  console.log(e);
} finally {
  await db.query("update platform_payment_settings set school_payments_enabled = true where id = 1");
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
