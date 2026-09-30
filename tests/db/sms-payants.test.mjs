// SMS payants : prix fixé par le Super Admin (défaut, pays, établissement),
// devis, achat de crédit (même circuit que les paiements), décompte à l'envoi,
// recrédit, SMS hors formule, droits et isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const quote = async (q, sms = 0) => (await q("select sms_quote($1, $2) as c", [ORG_DEMO, sms]))[0].c;

describe("SMS payants", () => {
  test("sans facturation : rien n'est décompté ; prix réglés par le Super Admin seulement", async () => {
    await as(USERS.admin, async (q) => {
      const initial = await quote(q, 50);
      assert.deepEqual([initial.billing_enabled, initial.unit_price, initial.balance, initial.missing], [false, 25, 0, 0]);
      assert.match(await rejects(q("select platform_save_sms_pricing(true, 30, 100)")), /Réservé/);
      assert.match(await rejects(q("select sms_debit($1, 1)", [ORG_DEMO])), /permission denied/, "le décompte n'est jamais appelable depuis le navigateur");
      await switchTo(q, null);
      const [{ r }] = await q("select sms_debit($1, 3) as r", [ORG_DEMO]);
      assert.deepEqual(r, { ok: true, billed: false });
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select sms_quote($1, 1)", [ORG_DEMO])), /Permission refusée/);
    });
  });

  test("prix : défaut, pays, établissement ; historique et journal", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_sms_pricing(true, 30, 100)");
      await switchTo(q, USERS.admin);
      assert.equal((await quote(q, 10)).unit_price, 30, "prix par défaut");
      await switchTo(q, USERS.superadmin);
      const [{ country }] = await q("select country from organizations where id = $1", [ORG_DEMO]);
      await q("select platform_set_country_sms_price($1, 20)", [country]);
      await switchTo(q, USERS.admin);
      assert.equal((await quote(q, 10)).unit_price, 20, "le prix du pays prime sur le défaut");
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_org_sms_price($1, 15, 'Tarif négocié')", [ORG_DEMO]);
      await switchTo(q, USERS.admin);
      const priced = await quote(q, 10);
      assert.deepEqual([priced.unit_price, priced.amount, priced.missing], [15, 150, 10], "le prix de l'établissement prime ; devis = SMS × prix");
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_org_sms_price($1, null)", [ORG_DEMO]);
      assert.match(await rejects(q("select platform_save_sms_pricing(true, 0, 100)")), /Prix d'un SMS invalide/);
      assert.equal((await q("select count(*)::int as n from sms_price_history"))[0].n, 4);
      await switchTo(q, null);
      assert.ok((await q("select count(*)::int as n from audit_logs where action = 'platform.sms_pricing'"))[0].n >= 4);
    });
  });

  test("achat de crédit, confirmation vérifiée et idempotente, décompte, recrédit", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_sms_pricing(true, 25, 100)");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select sms_credit_start_checkout($1, 200, 'simulation', 'test')", [ORG_DEMO])), /Permission refusée/);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select sms_credit_start_checkout($1, 50, 'simulation', 'test')", [ORG_DEMO])), /Achat minimum : 100 SMS/);
      const [{ c }] = await q("select sms_credit_start_checkout($1, 200, 'simulation', 'test') as c", [ORG_DEMO]);
      assert.deepEqual([c.sms, c.unit_price, c.amount, c.currency], [200, 25, 5000, "XOF"], "montant calculé en base");

      await switchTo(q, null);
      const confirm = (amount) => q("select sms_credit_confirm_payment('simulation', 'test', null, $1, $2, 'XOF') as r", [c.reference, amount]);
      assert.equal((await confirm(4000))[0].r.reason, "montant_different", "un montant faux est refusé");
      assert.equal((await confirm(5000))[0].r.result, "confirmed");
      assert.equal((await confirm(5000))[0].r.result, "duplicate", "une seconde confirmation n'ajoute rien");
      await switchTo(q, USERS.admin);
      assert.equal((await quote(q)).balance, 200);

      await switchTo(q, null);
      assert.deepEqual((await q("select sms_debit($1, 3, 'campaign') as r", [ORG_DEMO]))[0].r, { ok: true, billed: true, balance: 197 });
      await q("select sms_refund($1, 3, 'campaign')", [ORG_DEMO]);
      assert.equal((await q("select balance from sms_wallets where organization_id = $1", [ORG_DEMO]))[0].balance, 200, "SMS non délivré : recrédité");
      const [{ r: short }] = await q("select sms_debit($1, 500) as r", [ORG_DEMO]);
      assert.deepEqual([short.ok, short.reason, short.balance], [false, "credit", 200], "crédit insuffisant : rien n'est décompté");
      const moves = await q("select reason, delta from sms_wallet_movements where organization_id = $1 order by created_at, reason", [ORG_DEMO]);
      assert.deepEqual(moves.map((m) => m.reason).sort(), ["purchase", "refund", "send"]);

      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select count(*)::int as n from sms_wallets where organization_id = $1", [ORG_DEMO]))[0].n, 0, "crédit d'un autre établissement invisible");
      assert.equal((await q("select count(*)::int as n from sms_credit_purchases where organization_id = $1", [ORG_DEMO]))[0].n, 0);
    });
  });

  test("SMS hors formule refusés ; crédit offert par la plateforme (motif obligatoire)", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_sms_pricing(true, 25, 100)");
      assert.match(await rejects(q("select platform_adjust_sms_credit($1, 50, '')", [ORG_DEMO])), /motif/);
      assert.equal((await q("select platform_adjust_sms_credit($1, 50, 'Geste commercial') as b", [ORG_DEMO]))[0].b, 50);
      assert.match(await rejects(q("select platform_adjust_sms_credit($1, -80, 'Correction')", [ORG_DEMO])), /négatif/);
      await switchTo(q, null);
      const [{ plan_id }] = await q("select plan_id from subscriptions where organization_id = $1", [ORG_DEMO]);
      await q("update subscription_features set enabled = false where plan_id = $1 and feature_code = 'sms'", [plan_id]);
      assert.deepEqual((await q("select sms_debit($1, 1) as r", [ORG_DEMO]))[0].r, { ok: false, reason: "plan" });
      await switchTo(q, USERS.admin);
      assert.equal((await quote(q)).included_in_plan, false);
      assert.match(await rejects(q("select sms_credit_start_checkout($1, 200, 'simulation', 'test')", [ORG_DEMO])), /pas inclus dans votre formule/);
    });
  });
});
