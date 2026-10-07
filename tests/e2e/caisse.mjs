// NEOSCOOL — Caisse : « Enregistrer un paiement » depuis Finances (choix de l'élève,
// tranche proposée, mode, date, reçu), bouton « Encaisser » d'une ligne de facture.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-caisse";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const created = [];

const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fr-FR" });
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(e.message));
await page.goto(`${base}/connexion`);
await page.getByLabel("Adresse e-mail ou matricule").fill("comptable@demo.neoscol.app");
await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
await page.getByRole("button", { name: "Se connecter", exact: true }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });

try {
  // Facture avec échéancier dont une tranche reste à payer.
  const target = await q1(`
    select b.invoice_id, b.number, b.balance, b.paid, s.last_name, s.first_name, s.matricule
      from invoice_balances b join students s on s.id = b.student_id
      join organizations o on o.id = b.organization_id
     where o.id = (select m.organization_id from memberships m join auth.users u on u.id = m.user_id where u.email = 'comptable@demo.neoscol.app' limit 1)
       and b.status = 'issued' and b.balance > 0
       and (select count(*) from installments i where i.invoice_id = b.invoice_id) >= 2
       and (select count(*) from invoice_balances b2 where b2.student_id = b.student_id and b2.status = 'issued' and b2.balance > 0) = 1
     order by b.balance desc limit 1`);
  const inst = (await db.query("select label, amount from installments where invoice_id = $1 order by sequence", [target.invoice_id])).rows;
  let left = Number(target.paid);
  const next = inst.map((i) => { const c = Math.min(Number(i.amount), Math.max(0, left)); left -= c; return { label: i.label, remaining: Number(i.amount) - c }; }).find((i) => i.remaining > 0);

  console.log("\n=== 1. Bouton en haut de Finances › Paiements ===");
  await page.goto(`${base}/finances?onglet=paiements`);
  await page.getByTestId("cashier-open").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/nom, prénom ou matricule/).fill(target.matricule);
  await dlg.getByTestId("cashier-results").getByRole("button").first().click();
  check((await dlg.getByTestId("cashier-student").innerText()).includes(target.last_name), "élève choisi");
  const choiceText = await dlg.getByTestId("cashier-choice").locator("option:checked").innerText();
  check(choiceText.startsWith(next.label), `tranche proposée : ${choiceText}`);
  check(Number(await dlg.getByLabel(/^Montant/).inputValue()) === next.remaining, "montant = reste de la tranche");
  check((await dlg.getByText(/Reste sur cette échéance/).count()) === 1, "reste de l'échéance affiché");
  await page.screenshot({ path: `${out}/01-caisse.png` });
  await dlg.getByLabel(/^Montant/).fill("1000");
  await dlg.getByRole("radio", { name: "Mobile Money" }).click();
  await dlg.getByLabel("Référence (transaction, chèque…)").fill("MM-TEST-CAISSE");
  const back = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await dlg.getByLabel("Date").fill(back);
  await dlg.getByRole("button", { name: "Valider et générer le reçu" }).click();
  await dlg.getByTestId("cashier-done").waitFor({ timeout: 20000 });
  const pay = await q1("select id, amount, method, reference, (paid_at at time zone 'UTC')::date::text as day from payments where invoice_id = $1 order by created_at desc limit 1", [target.invoice_id]);
  created.push(pay.id);
  check(Number(pay.amount) === 1000 && pay.method === "mobile_money" && pay.reference === "MM-TEST-CAISSE", "paiement enregistré (montant, mode, référence)");
  check(pay.day === back, "date d'encaissement saisie conservée");
  check((await dlg.getByRole("link", { name: "Imprimer le reçu" }).getAttribute("href")) === `/api/documents/recus/${pay.id}`, "reçu proposé à l'impression");
  const pdf = await page.request.get(`${base}/api/documents/recus/${pay.id}`);
  check(pdf.status() === 200 && (pdf.headers()["content-type"] ?? "").includes("pdf"), "reçu PDF généré");
  await page.screenshot({ path: `${out}/02-recu.png` });
  await dlg.getByTestId("cashier-done").getByRole("button", { name: "Fermer" }).click();

  console.log("\n=== 2. Bouton « Encaisser » d'une ligne de facture ===");
  await page.goto(`${base}/finances?onglet=factures&q=${encodeURIComponent(target.number)}`);
  await page.getByRole("link", { name: `Encaisser ${target.number}` }).click();
  const dlg2 = page.getByRole("dialog");
  await dlg2.getByTestId("cashier-form").waitFor({ timeout: 15000 });
  check((await dlg2.getByTestId("cashier-student").innerText()).includes(target.last_name), "caisse ouverte sur l'élève de la facture");
  const balance = Number(target.balance) - 1000;
  await dlg2.getByTestId("cashier-choice").selectOption("all");
  check(Number(await dlg2.getByLabel(/^Montant/).inputValue()) === balance, "« Tout le reste » = reliquat de la facture");
  await dlg2.getByLabel(/^Montant/).fill(String(balance + 1));
  check(await dlg2.getByRole("button", { name: "Valider et générer le reçu" }).isDisabled(), "montant supérieur au reste : validation bloquée");
} finally {
  for (const id of created) await db.query("update payments set status = 'cancelled', cancelled_reason = 'Test automatique caisse' where id = $1", [id]);
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
