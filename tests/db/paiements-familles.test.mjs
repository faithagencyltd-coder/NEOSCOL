// Paiements en ligne des familles : interrupteurs (global, établissement,
// fournisseur), montant calculé en base, double clic, double paiement,
// confirmation vérifiée (montant, devise, référence, doublon) → écriture
// comptable, reçu, notifications ; remboursements ; isolation des établissements.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

/** Établissement de démo prêt : paiement activé + fournisseur de test actif. Renvoie { provider, invoice, installments }. */
async function setup(q, { enable = true } = {}) {
  await switchTo(q, null);
  await q("insert into org_payment_settings (organization_id, online_enabled) values ($1, $2) on conflict (organization_id) do update set online_enabled = $2", [ORG_DEMO, enable]);
  const provider = (await one(q, "insert into org_payment_providers (organization_id, adapter, label, methods, mode, is_active, is_default) values ($1, 'mock', 'Mobile Money (test)', '{mobile_money,card}', 'test', true, true) returning id", [ORG_DEMO])).id;
  const invoice = await one(q, "select i.id, i.number, ib.balance from invoices i join invoice_balances ib on ib.invoice_id = i.id where i.number = 'FAC-DEMO-26-000001'");
  const installments = await q("select id, amount, sequence from installments where invoice_id = $1 order by sequence", [invoice.id]);
  return { provider, invoice, installments };
}
const start = (q, invoice, installment, amount, provider, method = null) =>
  one(q, "select fee_payment_start($1, $2, $3, $4, $5) as t", [invoice, installment, amount, provider, method]).then((r) => r.t);
const confirm = (q, provider, ptx, ref, amount, currency = "XOF") =>
  one(q, "select fee_payment_confirm($1, $2, $3, $4, $5, 'mobile_money', '{}', 'test') as r", [provider, ptx, ref, amount, currency]).then((r) => r.r);

describe("Paiements en ligne des familles", () => {
  test("création : parent de l'élève seulement, montant d'une échéance calculé en base, double clic réutilisé", async () => {
    await as(USERS.parent, async (q) => {
      const { provider, invoice, installments } = await setup(q);
      await switchTo(q, USERS.parent);
      const opts = (await one(q, "select fee_payment_options($1) as o", [ORG_DEMO])).o;
      assert.equal(opts.open, true);
      assert.equal(opts.providers.length, 1, "seuls les fournisseurs actifs sont proposés");
      assert.equal(opts.providers[0].config, undefined, "aucune configuration exposée à la famille");

      const t = await start(q, invoice.id, installments[0].id, 999999999, provider);
      assert.equal(Number(t.amount), Number(installments[0].amount), "le montant envoyé par le navigateur est ignoré : échéance calculée en base");
      assert.match(t.reference, /^NEO-\d{4}-\d{6,}$/);
      const again = await start(q, invoice.id, installments[0].id, null, provider);
      assert.deepEqual([again.transaction_id, again.reused], [t.transaction_id, true], "double clic : même transaction");
      assert.match(await rejects(start(q, invoice.id, null, null, provider)), /déjà en cours/, "double paiement : le total en cours ne dépasse pas le reste dû");
      assert.match(await rejects(start(q, invoice.id, null, 1000, provider)), /montant libre/, "montant libre refusé si l'établissement ne l'autorise pas");
      assert.match(await rejects(start(q, invoice.id, installments[1].id, null, provider, "bank_transfer")), /non proposé/);

      await switchTo(q, USERS.admin);
      assert.match(await rejects(start(q, invoice.id, installments[1].id, null, provider)), /introuvable/, "le personnel ne paie pas à la place de la famille");
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select count(*)::int n from fee_payment_transactions")).filter(Boolean)[0].n, 0, "transactions d'un autre établissement invisibles");
      assert.equal((await q("select count(*)::int n from org_payment_providers where organization_id = $1", [ORG_DEMO]))[0].n, 0);
    });
  });

  test("interrupteurs : global, établissement, fournisseur ; rien n'est supprimé", async () => {
    await as(USERS.parent, async (q) => {
      const { provider, invoice } = await setup(q);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_school_payments(false)");
      await switchTo(q, USERS.parent);
      assert.equal((await one(q, "select fee_payment_options($1) as o", [ORG_DEMO])).o.providers.length, 0, "global désactivé : rien côté parent");
      assert.match(await rejects(start(q, invoice.id, null, null, provider)), /pas disponible/);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_school_payments(true)");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from org_payment_providers where id = $1", [provider]))[0].n, 1, "configuration conservée");
      await q("update org_payment_settings set online_enabled = false where organization_id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(start(q, invoice.id, null, null, provider)), /pas disponible/, "établissement désactivé");
      await switchTo(q, null);
      await q("update org_payment_settings set online_enabled = true where organization_id = $1", [ORG_DEMO]);
      await q("update org_payment_providers set is_active = false, is_default = false where id = $1", [provider]);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(start(q, invoice.id, null, null, provider)), /pas disponible/, "fournisseur désactivé");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_set_school_payments(false)")), /Réservé/);
    });
  });

  test("confirmation : contrôles, écriture comptable, reçu, solde, notifications, doublon", async () => {
    await as(USERS.parent, async (q) => {
      const { provider, invoice, installments } = await setup(q);
      await switchTo(q, USERS.parent);
      const t = await start(q, invoice.id, installments[0].id, null, provider);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(confirm(q, provider, "X1", t.reference, Number(t.amount))), /permission denied/, "la confirmation n'est jamais appelable par un utilisateur");
      await switchTo(q, null);
      await q("select fee_payment_attach($1, $2, 'https://pay.example/1', '{}')", [t.transaction_id, `MOCK-${t.reference}`]);
      assert.equal((await confirm(q, provider, "INCONNU", null, 1)).reason, "transaction_inconnue");
      assert.equal((await confirm(q, provider, `MOCK-${t.reference}`, t.reference, Number(t.amount) - 1)).reason, "montant_different");
      assert.equal((await confirm(q, provider, `MOCK-${t.reference}`, t.reference, Number(t.amount), "EUR")).reason, "devise_differente");
      assert.equal((await one(q, "select needs_review from fee_payment_transactions where id = $1", [t.transaction_id])).needs_review, true, "anomalies signalées à la comptabilité");
      const familyBefore = (await one(q, "select count(*)::int n from notifications where user_id = $1", [USERS.parent])).n;

      const ok = await confirm(q, provider, `MOCK-${t.reference}`, t.reference, Number(t.amount));
      assert.equal(ok.result, "confirmed");
      assert.match(ok.receipt, /^REC-/);
      const pay = await one(q, "select amount, method, status, balance_after from payments where id = $1", [ok.payment_id]);
      assert.deepEqual([Number(pay.amount), pay.method, pay.status], [Number(t.amount), "mobile_money", "completed"], "écriture comptable automatique");
      const bal = await one(q, "select paid, balance from invoice_balances where invoice_id = $1", [invoice.id]);
      assert.equal(Number(bal.balance), Number(invoice.balance) - Number(t.amount), "solde de la facture mis à jour");
      assert.equal((await one(q, "select status, needs_review from fee_payment_transactions where id = $1", [t.transaction_id])).status, "SUCCESS");
      assert.ok((await one(q, "select count(*)::int n from notifications where user_id = $1", [USERS.parent])).n > familyBefore, "famille notifiée");
      assert.equal((await one(q, "select count(*)::int n from notifications where user_id = $1 and type = 'payment.online'", [USERS.accountant])).n, 1, "comptabilité notifiée");

      assert.equal((await confirm(q, provider, `MOCK-${t.reference}`, t.reference, Number(t.amount))).result, "duplicate", "notification reçue deux fois : un seul paiement");
      assert.equal((await one(q, "select count(*)::int n from payments where notes like $1", [`%${t.reference}%`])).n, 1);
      assert.ok((await one(q, "select count(*)::int n from fee_payment_events where transaction_id = $1", [t.transaction_id])).n >= 5, "historique complet");
      assert.equal((await one(q, "select count(*)::int n from audit_logs where action = 'finance.online_payment_confirmed' and entity_id = $1", [t.transaction_id])).n, 1);

      await switchTo(q, USERS.parent);
      assert.equal((await q("select status from fee_payment_transactions where id = $1", [t.transaction_id]))[0].status, "SUCCESS", "le parent voit sa transaction");
      assert.match(await rejects(q("select provider_response from fee_payment_transactions limit 1")), /permission denied/, "réponses brutes du fournisseur non exposées");
    });
  });

  test("échec, expiration puis confirmation tardive ; facture réglée entre-temps → à traiter", async () => {
    await as(USERS.parent, async (q) => {
      const { provider, invoice, installments } = await setup(q);
      await switchTo(q, USERS.parent);
      const t1 = await start(q, invoice.id, installments[0].id, null, provider);
      await switchTo(q, null);
      await q("select fee_payment_attach($1, $2, null, '{}')", [t1.transaction_id, `MOCK-${t1.reference}`]);
      assert.equal((await one(q, "select fee_payment_fail($1, $2, null, 'CANCELLED', 'Annulé par le payeur') as r", [provider, `MOCK-${t1.reference}`])).r.result, "cancelled");
      await q("update fee_payment_transactions set expires_at = now() - interval '1 minute', status = 'PROCESSING' where id = $1", [t1.transaction_id]);
      assert.equal((await one(q, "select fee_payment_expire_stale($1) as n", [ORG_DEMO])).n, 1);
      assert.equal((await confirm(q, provider, `MOCK-${t1.reference}`, t1.reference, Number(t1.amount))).result, "confirmed", "argent reçu après expiration : enregistré");

      await switchTo(q, USERS.parent);
      const t2 = await start(q, invoice.id, installments[1].id, null, provider);
      await switchTo(q, null);
      await q("select fee_payment_attach($1, $2, null, '{}')", [t2.transaction_id, `MOCK-${t2.reference}`]);
      const left = Number((await one(q, "select balance from invoice_balances where invoice_id = $1", [invoice.id])).balance);
      await q("insert into payments (organization_id, invoice_id, student_id, amount, method) select organization_id, id, student_id, $2, 'cash' from invoices where id = $1", [invoice.id, left]);
      const r = await confirm(q, provider, `MOCK-${t2.reference}`, t2.reference, Number(t2.amount));
      assert.equal(r.result, "confirmed_review", "facture soldée au guichet entre-temps : pas de double encaissement, cas à traiter");
      const tx = await one(q, "select status, needs_review, payment_id from fee_payment_transactions where id = $1", [t2.transaction_id]);
      assert.deepEqual([tx.status, tx.needs_review, tx.payment_id], ["SUCCESS", true, null]);
    });
  });

  test("remboursement partiel puis total : comptabilité et solde exacts, droits", async () => {
    await as(USERS.parent, async (q) => {
      const { provider, invoice, installments } = await setup(q);
      await switchTo(q, USERS.parent);
      const t = await start(q, invoice.id, installments[0].id, null, provider);
      await switchTo(q, null);
      await q("select fee_payment_attach($1, $2, null, '{}')", [t.transaction_id, `MOCK-${t.reference}`]);
      await confirm(q, provider, `MOCK-${t.reference}`, t.reference, Number(t.amount));
      const after = Number((await one(q, "select balance from invoice_balances where invoice_id = $1", [invoice.id])).balance);

      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select fee_payment_refund_request($1, 1000, 'test')", [t.transaction_id])), /introuvable/);
      await switchTo(q, USERS.accountant);
      assert.match(await rejects(q("select fee_payment_refund_request($1, $2, 'Trop perçu')", [t.transaction_id, Number(t.amount) + 1])), /invalide/);
      const r1 = (await one(q, "select fee_payment_refund_request($1, 10000, 'Erreur de tranche') as id", [t.transaction_id])).id;
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select fee_payment_refund_complete($1, '', null)", [r1])), /référence/);
      await q("select fee_payment_refund_complete($1, 'MM-REMB-001', 'Remboursé par Mobile Money')", [r1]);
      await switchTo(q, null);
      assert.equal(Number((await one(q, "select balance from invoice_balances where invoice_id = $1", [invoice.id])).balance), after + 10000, "remboursement partiel : reste dû augmenté du montant remboursé");
      const tx = await one(q, "select status, refunded_amount, payment_id from fee_payment_transactions where id = $1", [t.transaction_id]);
      assert.deepEqual([tx.status, Number(tx.refunded_amount)], ["PARTIALLY_REFUNDED", 10000]);
      assert.equal(Number((await one(q, "select amount from payments where id = $1", [tx.payment_id])).amount), Number(t.amount) - 10000, "nouveau reçu du montant conservé");

      await switchTo(q, USERS.accountant);
      const r2 = (await one(q, "select fee_payment_refund_request($1, $2, 'Désistement') as id", [t.transaction_id, Number(t.amount) - 10000])).id;
      await switchTo(q, USERS.admin);
      await q("select fee_payment_refund_complete($1, 'MM-REMB-002', null)", [r2]);
      await switchTo(q, null);
      assert.equal(Number((await one(q, "select balance from invoice_balances where invoice_id = $1", [invoice.id])).balance), Number(invoice.balance), "remboursement total : solde revenu au départ");
      assert.equal((await one(q, "select status from fee_payment_transactions where id = $1", [t.transaction_id])).status, "REFUNDED");
      assert.equal((await one(q, "select count(*)::int n from payments where notes like $1 and status = 'completed'", [`%${t.reference}%`])).n, 0, "aucun paiement actif restant");
    });
  });

  test("fournisseurs : clés jamais lisibles, réservé aux responsables, test de test uniquement", async () => {
    await as(USERS.admin, async (q) => {
      const id = (await one(q, "select org_save_payment_provider($1, null, 'fedapay', 'FedaPay', 'BJ', 'XOF', '{mobile_money}', 'test', '{}', null, 'v1:QUJD:REVG:R0hJ', '••_123') as id", [ORG_DEMO])).id;
      assert.match(await rejects(q("select secret_ciphertext from org_payment_providers where id = $1", [id])), /permission denied/, "clés chiffrées jamais lisibles");
      assert.match(await rejects(q("select org_save_payment_provider($1, null, 'mock', 'Test', null, 'XOF', '{card}', 'live', '{}', null)", [ORG_DEMO])), /mode TEST/);
      await q("select org_set_payment_provider_state($1, true, true, 10)", [id]);
      await q("select org_save_payment_provider($1, $2, 'fedapay', 'FedaPay', 'BJ', 'XOF', '{mobile_money}', 'live', '{}', null)", [ORG_DEMO, id]);
      assert.equal((await one(q, "select is_active from org_payment_providers where id = $1", [id])).is_active, false, "identifiants modifiés : retiré jusqu'à réactivation");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select org_save_payment_provider($1, null, 'mock', 'X', null, 'XOF', '{card}', 'test', '{}', null)", [ORG_DEMO])), /Permission/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select org_set_payment_provider_state($1, false, false, 1)", [id])), /introuvable/, "isolation : un autre établissement ne touche à rien");
    });
  });

  test("correctif : un paiement saisi au guichet peut être annulé (avec motif), une dépense annulée archivée", async () => {
    await as(USERS.accountant, async (q) => {
      const inv = await one(q, "select id from invoices where number = 'FAC-DEMO-26-000001'");
      const p = await one(q, "insert into payments (organization_id, invoice_id, student_id, amount, method) select organization_id, id, student_id, 1000, 'cash' from invoices where id = $1 returning id, number", [inv.id]);
      await switchTo(q, USERS.admin);
      await q("update payments set status = 'cancelled', cancelled_reason = 'Erreur de saisie' where id = $1", [p.id]);
      assert.equal((await one(q, "select status from payments where id = $1", [p.id])).status, "cancelled");
      assert.match(await rejects(q("update payments set amount = 2000 where id = $1", [p.id])), /annulé/, "un paiement annulé reste figé");
    });
  });
});
