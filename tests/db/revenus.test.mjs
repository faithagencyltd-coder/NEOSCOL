// Revenus (Super Admin) : indicateurs et export comptable — Super Admin seul,
// démonstration et paiements de test exclus, export journalisé.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const today = new Date().toISOString().slice(0, 10);
const summary = (q) => q("select platform_revenue_summary($1::date - 30, $1::date) s", [today]).then((r) => r[0].s);
const sum = (list) => list.reduce((n, t) => n + Number(t.amount), 0);

describe("Revenus de la plateforme", () => {
  test("réservé au Super Admin ; période contrôlée", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(summary(q)), /Réservé|plateforme/i);
      assert.match(await rejects(q("select * from platform_revenue_export($1::date - 30, $1::date)", [today])), /Réservé|plateforme/i);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_revenue_summary('2026-02-01', '2026-01-01')")), /Période invalide/);
    });
  });

  test("paiement réel compté, paiement de test et démonstration exclus ; export journalisé", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.superadmin);
      const base = await summary(q);
      await switchTo(q, null);
      await q("update organizations set is_demo = false where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      const before = await summary(q);
      await switchTo(q, null);
      await q("update subscriptions set is_demo = false, status = 'TRIALING', trial_start = now() - interval '20 days', trial_end = now() - interval '1 day' where organization_id = $1", [ORG_DEMO]);
      // Paiement de test (simulation) : payé mais exclu des chiffres.
      await switchTo(q, USERS.admin);
      const [{ c }] = await q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'simulation', 'test') c", [ORG_DEMO]);
      await switchTo(q, null);
      const [tx] = await q("select id from payment_transactions where invoice_id = $1 order by created_at desc limit 1", [c.invoice_id]);
      await q("select app.billing_apply_payment($1, 'simulation', null, null)", [tx.id]);
      assert.equal((await q("select status from subscription_invoices where id = $1", [c.invoice_id]))[0].status, "PAID");
      await switchTo(q, USERS.superadmin);
      const withTest = await summary(q);
      assert.equal(sum(withTest.totals), sum(before.totals), "paiement de test non compté");

      // Paiement réel enregistré manuellement : compté.
      await switchTo(q, null);
      await q("update subscriptions set status = 'PAST_DUE', status_changed_at = now() where organization_id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      const unpaid = await summary(q);
      assert.ok(unpaid.unpaid.some((u) => u.organization_code === "DEMO" || u.status === "PAST_DUE"), "impayé listé");
      await switchTo(q, USERS.admin);
      const [{ c: real }] = await q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'YEARLY', 'simulation', 'test') c", [ORG_DEMO]);
      await switchTo(q, null);
      const [inv] = await q("select id, amount from subscription_invoices where id = $1", [real.invoice_id]);
      const [{ n: priorLive }] = await q(
        "select count(*)::int n from subscription_invoices i left join payment_transactions t on t.id = i.payment_transaction_id where i.organization_id = $1 and i.status = 'PAID' and coalesce(t.mode, 'live') = 'live'",
        [ORG_DEMO],
      );
      await switchTo(q, USERS.superadmin);
      await q("select platform_record_manual_payment($1, 'VIR-REV-001', $2, 'virement')", [inv.id, inv.amount]);
      const after = await summary(q);
      assert.equal(sum(after.totals), sum(before.totals) + inv.amount, "paiement réel compté");
      assert.ok(after.by_method.some((m) => m.method === "virement"));
      assert.equal(after.new_paying, before.new_paying + (priorLive ? 0 : 1), "nouveau client payant (premier paiement réel)");
      assert.ok(after.trials_converted >= 1);

      const rows = await q("select * from platform_revenue_export($1::date - 30, $1::date)", [today]);
      assert.ok(rows.some((r) => r.amount === inv.amount && r.mode === "live"));
      assert.ok(rows.every((r) => r.mode === "live"), "export : paiements de test exclus par défaut");
      const [{ n }] = await q("select count(*)::int n from audit_logs where action = 'platform.revenue_exported'");
      assert.ok(n >= 1, "export journalisé");

      // Établissement de démonstration : exclu.
      await switchTo(q, null);
      await q("update organizations set is_demo = true where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      assert.equal(sum((await summary(q)).totals), sum(base.totals), "démonstration exclue");
    });
  });
});
