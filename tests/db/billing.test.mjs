// Abonnements NéoScol : formules, essai, paiement vérifié, idempotence, impayés, isolation, permissions.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

/** Passe l'abonnement DEMO en essai réel (hors démonstration) dans la transaction du test. */
async function realTrial(q, org = ORG_DEMO) {
  await switchTo(q, null);
  await q("update subscriptions set is_demo = false, status = 'TRIALING', trial_start = now(), trial_end = now() + interval '14 days', current_period_start = null, current_period_end = null where organization_id = $1", [org]);
}
async function asService(q) {
  await switchTo(q, null);
  await q("set local role service_role");
}
async function checkout(q, plan = "COLLEGE_LYCEE", interval = "YEARLY", provider = "simulation", mode = "test") {
  const [{ c }] = await q("select public.billing_start_checkout($1, $2, $3, $4, $5) as c", [ORG_DEMO, plan, interval, provider, mode]);
  return c;
}
const confirm = (q, c, { amount = c.amount, mode = "test", currency = "XOF" } = {}) =>
  q("select public.billing_confirm_payment('simulation', $1, $2, $3, $4, $5) as r", [mode, `SIM-${c.reference}`, c.reference, amount, currency]).then((rows) => rows[0].r);

describe("Abonnements NéoScol", () => {
  test("formules officielles : prix mensuels, annuels -30 %, prix barré et économie exacts, essai 14 jours", async () => {
    await as("anon", async (q) => {
      const plans = await q("select code, monthly_price, annual_price, annual_list_price, annual_savings, annual_discount_percent::int as d, currency, trial_days from subscription_plans order by sort_order");
      assert.deepEqual(
        plans.map((p) => [p.code, p.monthly_price, p.annual_price, p.annual_list_price, p.annual_savings, p.d, p.currency, p.trial_days]),
        [
          ["MATERNELLE_PRIMAIRE", 8000, 67200, 96000, 28800, 30, "XOF", 14],
          ["COLLEGE_LYCEE", 15000, 126000, 180000, 54000, 30, "XOF", 14],
          ["CENTRE_FORMATION", 15000, 126000, 180000, 54000, 30, "XOF", 14],
          ["UNIVERSITE", 20000, 168000, 240000, 72000, 30, "XOF", 14],
          ["ENTERPRISE", 28000, 235200, 336000, 100800, 30, "XOF", 14],
        ],
      );
      assert.match(await rejects(q("select id from subscriptions")), /permission denied/);
    });
  });

  test("création d'un établissement : essai TRIALING de 14 jours exactement + événement", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ id }] = await q("select public.create_organization('École Essai Test', 'ESSAI1', 'ecole-essai-test', 'primary_school') as id");
      const [s] = await q("select s.status, p.code, s.billing_interval, s.trial_end - s.trial_start as len, s.monthly_price from subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = $1", [id]);
      assert.equal(s.status, "TRIALING");
      assert.equal(s.code, "MATERNELLE_PRIMAIRE");
      assert.equal(s.len.days, 14);
      assert.equal(s.monthly_price, 8000);
      assert.equal((await q("select count(*)::int n from subscription_events where organization_id = $1 and event_type = 'trial_started'", [id]))[0].n, 1);
      const [a] = await q("select public.billing_access_state($1) a", [id]);
      assert.equal(a.a.days_left, 14);
      assert.equal(a.a.access, "full");
    });
  });

  test("paiement : montant calculé en base, confirmation vérifiée, idempotence, contrôles montant / devise / mode", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.admin);
      const monthly = await checkout(q, "COLLEGE_LYCEE", "MONTHLY");
      assert.equal(monthly.amount, 15000);
      const c = await checkout(q, "COLLEGE_LYCEE", "YEARLY");
      assert.equal(c.amount, 126000, "annuel : 126 000 (et non 12 × 15 000)");
      assert.match(c.reference, /^NEO-\d{4}-\d{6}$/);
      assert.match(c.invoice_number, /^NSC-\d{4}-\d{6}$/);
      const [inv] = await q("select list_amount, discount_amount, amount, status from subscription_invoices where id = $1", [c.invoice_id]);
      assert.deepEqual([inv.list_amount, inv.discount_amount, inv.amount, inv.status], [180000, 54000, 126000, "PENDING"]);
      // Le navigateur (authenticated) ne peut ni confirmer ni forcer un statut.
      assert.match(await rejects(confirm(q, c)), /permission denied/);
      assert.match(await rejects(q("update subscriptions set status = 'ACTIVE' where organization_id = $1", [ORG_DEMO])), /permission denied/);
      assert.match(await rejects(q("insert into subscription_payments (organization_id, subscription_id, invoice_id, transaction_id, amount, currency, provider, mode, reference, paid_at) values ($1, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'XOF', 'x', 'test', 'x', now())", [ORG_DEMO])), /permission denied/);

      await asService(q);
      await q("select public.billing_attach_checkout($1, $2, 'http://x/y', '{}')", [c.transaction_id, `SIM-${c.reference}`]);
      assert.equal((await confirm(q, c, { amount: 1 })).reason, "montant_different");
      assert.equal((await confirm(q, c, { currency: "EUR" })).reason, "devise_differente");
      assert.equal((await confirm(q, c, { mode: "live" })).reason, "mode_different");
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, "TRIALING", "rejets : aucun effet");
      assert.equal((await confirm(q, c)).result, "confirmed");
      assert.equal((await confirm(q, c)).result, "duplicate", "notification rejouée");
      assert.equal((await confirm(q, c)).result, "duplicate");
      assert.equal((await q("select count(*)::int n from subscription_payments where organization_id = $1", [ORG_DEMO]))[0].n, 1, "un seul paiement");
      const [s] = await q("select status, billing_interval, annual_price, current_period_start = trial_end as after_trial, current_period_end = current_period_start + interval '1 year' as one_year from subscriptions where organization_id = $1", [ORG_DEMO]);
      assert.deepEqual([s.status, s.billing_interval, s.annual_price, s.after_trial], ["ACTIVE", "YEARLY", 126000, true]);
      assert.equal(s.one_year, true, "période annuelle d'un an");
      const [paid] = await q("select status, paid_at is not null as p from subscription_invoices where id = $1", [c.invoice_id]);
      assert.deepEqual([paid.status, paid.p], ["PAID", true]);
      assert.equal((await q("select status from subscription_invoices where id = $1", [monthly.invoice_id]))[0].status, "CANCELLED", "facture en attente remplacée");
      const events = (await q("select event_type from subscription_events where organization_id = $1", [ORG_DEMO])).map((e) => e.event_type);
      for (const e of ["plan_selected", "invoice_created", "payment_pending", "checkout_created", "payment_failed", "payment_success", "invoice_paid", "subscription_activated", "invoice_cancelled"]) {
        assert.ok(events.includes(e), `événement ${e}`);
      }
      assert.ok((await q("select count(*)::int n from notifications where organization_id = $1 and title = 'Paiement confirmé'", [ORG_DEMO]))[0].n >= 1);
    });
  });

  test("paiement échoué / abandonné : transaction marquée, abonnement inchangé, notification", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.admin);
      const c = await checkout(q);
      await asService(q);
      const [{ r }] = await q("select public.billing_fail_payment('simulation', 'test', null, $1, 'FAILED', 'refus', '{}') r", [c.reference]);
      assert.equal(r.result, "failed");
      assert.equal((await q("select status from payment_transactions where id = $1", [c.transaction_id]))[0].status, "FAILED");
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, "TRIALING");
      assert.equal((await q("select count(*)::int n from notifications where organization_id = $1 and title = 'Paiement échoué'", [ORG_DEMO]))[0].n >= 1, true);
    });
  });

  test("impayés : PAST_DUE → GRACE_PERIOD → RESTRICTED (lecture seule, données conservées) → EXPIRED, puis réactivation immédiate", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      const students = (await q("select count(*)::int n from students where organization_id = $1", [ORG_DEMO]))[0].n;
      const step = async (days, expected) => {
        await switchTo(q, null);
        await q("update subscriptions set trial_end = now() - make_interval(days => $2), trial_start = now() - make_interval(days => $2 + 14) where organization_id = $1", [ORG_DEMO, days]);
        await q("set local role service_role");
        await q("select public.billing_process_lifecycle()");
        await switchTo(q, null);
        assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, expected, `J+${days}`);
      };
      await step(1, "PAST_DUE");
      await step(5, "GRACE_PERIOD");
      await switchTo(q, USERS.admin);
      assert.ok((await q("select public.my_permissions($1) p", [ORG_DEMO]))[0].p.includes("students.create"), "délai de grâce : accès complet");
      await step(15, "RESTRICTED");
      await switchTo(q, USERS.admin);
      const [{ p }] = await q("select public.my_permissions($1) p", [ORG_DEMO]);
      assert.ok(p.includes("students.read") && p.includes("billing.manage") && p.includes("reports.export"), "lecture, export et paiement conservés");
      assert.ok(!p.includes("students.create") && !p.includes("grades.enter") && !p.includes("finance.payments.create"), "écriture retirée");
      assert.equal((await q("select count(*)::int n from students where organization_id = $1", [ORG_DEMO]))[0].n, students, "élèves toujours lisibles");
      assert.match(await rejects(q("insert into students (organization_id, first_name, last_name) values ($1, 'X', 'Y')", [ORG_DEMO])), /row-level security|permission|autoris/i);
      await step(70, "EXPIRED");
      // Paiement confirmé → réactivation immédiate, sans synchronisation manuelle.
      await switchTo(q, USERS.admin);
      const c = await checkout(q, "COLLEGE_LYCEE", "MONTHLY");
      await asService(q);
      await q("select public.billing_attach_checkout($1, $2, 'http://x', '{}')", [c.transaction_id, `SIM-${c.reference}`]);
      assert.equal((await confirm(q, c)).event, "subscription_reactivated");
      await switchTo(q, USERS.admin);
      assert.ok((await q("select public.my_permissions($1) p", [ORG_DEMO]))[0].p.includes("students.create"), "écriture rétablie");
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, "ACTIVE");
    });
  });

  test("rappels de fin d'essai (J-7) envoyés une seule fois ; établissement de démonstration jamais restreint", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      await switchTo(q, null);
      await q("update subscriptions set trial_end = now() + interval '6 days 12 hours' where organization_id = $1", [ORG_DEMO]);
      await q("update subscriptions set current_period_end = now() - interval '400 days', current_period_start = now() - interval '800 days' where organization_id = $1", [ORG_DEMOF]);
      await q("set local role service_role");
      await q("select public.billing_process_lifecycle()");
      await q("select public.billing_process_lifecycle()");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from subscription_events where organization_id = $1 and event_type = 'notification_sent' and metadata->>'key' like 'trial:7:%'", [ORG_DEMO]))[0].n, 1);
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMOF]))[0].status, "ACTIVE", "démonstration : pas de restriction");
    });
  });

  test("isolation : un établissement ne voit jamais l'abonnement, les factures ni les paiements d'un autre ; la plateforme voit tout", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.admin);
      await checkout(q);
      await switchTo(q, USERS.otherOrgAdmin);
      for (const table of ["subscriptions", "subscription_invoices", "payment_transactions", "subscription_events", "subscription_payments"]) {
        assert.equal((await q(`select id from ${table} where organization_id = $1`, [ORG_DEMO])).length, 0, table);
      }
      assert.match(await rejects(q("select public.billing_start_checkout($1, 'COLLEGE_LYCEE', 'MONTHLY', 'simulation', 'test')", [ORG_DEMO])), /billing\.manage/);
      assert.match(await rejects(q("select public.billing_cancel($1)", [ORG_DEMO])), /billing\.manage/);
      assert.match(await rejects(q("select public.billing_access_state($1)", [ORG_DEMO])), /autorisé/);
      assert.equal((await q("select id from payment_webhooks")).length, 0);
      await switchTo(q, USERS.superadmin);
      const orgs = (await q("select distinct organization_id from subscription_invoices")).map((r) => r.organization_id);
      assert.ok(orgs.includes(ORG_DEMO));
      assert.ok((await q("select count(*)::int n from subscriptions"))[0].n >= 3);
      assert.ok((await q("select public.platform_billing_overview() o"))[0].o.trialing >= 1);
    });
  });

  test("permissions : enseignant et comptable ne gèrent pas l'abonnement ; plateforme réservée au super administrateur", async () => {
    await as(USERS.teacher, async (q) => {
      assert.equal((await q("select id from subscriptions")).length, 0);
      assert.match(await rejects(q("select public.billing_start_checkout($1, 'COLLEGE_LYCEE', 'MONTHLY', 'simulation', 'test')", [ORG_DEMO])), /billing\.manage/);
    });
    await as(USERS.accountant, async (q) => {
      assert.equal((await q("select id from subscriptions where organization_id = $1", [ORG_DEMO])).length, 1, "comptable : lecture");
      assert.match(await rejects(q("select public.billing_cancel($1)", [ORG_DEMO])), /billing\.manage/);
    });
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select public.platform_billing_overview()")), /plateforme/);
      assert.match(await rejects(q("select public.platform_record_manual_payment(gen_random_uuid(), 'REF', 1, 'virement')")), /plateforme/);
      assert.match(await rejects(q("select public.billing_process_lifecycle()")), /permission denied/);
      assert.match(await rejects(q("select public.billing_start_checkout($1, 'COLLEGE_LYCEE', 'MONTHLY', 'manual', 'live')", [ORG_DEMO])), /indisponible/);
    });
  });

  test("annulation en fin de période, reprise ; changement de formule gratuit pendant l'essai uniquement", async () => {
    await as(USERS.admin, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.admin);
      await q("select public.billing_change_trial_plan($1, 'UNIVERSITE', 'YEARLY')", [ORG_DEMO]);
      const [s] = await q("select p.code, s.annual_price, s.status from subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = $1", [ORG_DEMO]);
      assert.deepEqual([s.code, s.annual_price, s.status], ["UNIVERSITE", 168000, "TRIALING"]);
      assert.equal((await q("select count(*)::int n from subscription_events where organization_id = $1 and event_type = 'plan_changed'", [ORG_DEMO]))[0].n, 1);
      await q("select public.billing_cancel($1, 'test')", [ORG_DEMO]);
      assert.equal((await q("select cancel_at_period_end c from subscriptions where organization_id = $1", [ORG_DEMO]))[0].c, true);
      assert.match(await rejects(q("select public.billing_cancel($1)", [ORG_DEMO])), /déjà annulé/);
      await q("select public.billing_resume($1)", [ORG_DEMO]);
      assert.equal((await q("select cancel_at_period_end c from subscriptions where organization_id = $1", [ORG_DEMO]))[0].c, false);
      await switchTo(q, null);
      await q("update subscriptions set status = 'ACTIVE' where organization_id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select public.billing_change_trial_plan($1, 'ENTERPRISE', 'MONTHLY')", [ORG_DEMO])), /Hors période d'essai/);
    });
  });

  test("paiement manuel : super administrateur uniquement, montant exact, référence unique, identité conservée", async () => {
    await as(USERS.superadmin, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.superadmin);
      const [{ id }] = await q("select public.platform_issue_invoice($1, 'ENTERPRISE', 'MONTHLY') id", [ORG_DEMO]);
      assert.match(await rejects(q("select public.platform_record_manual_payment($1, 'VIR-1', 1000, 'virement')", [id])), /Montant différent/);
      const [{ r }] = await q("select public.platform_record_manual_payment($1, 'VIR-TEST-1', 28000, 'virement', 'ok') r", [id]);
      assert.equal(r.result, "confirmed");
      const [tx] = await q("select status, provider, confirmed_by from payment_transactions where id = $1", [r.transaction_id]);
      assert.deepEqual([tx.status, tx.provider, tx.confirmed_by], ["SUCCESS", "manual", USERS.superadmin]);
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, "ACTIVE");
      const [{ id: other }] = await q("select public.platform_issue_invoice($1, 'ENTERPRISE', 'MONTHLY') id", [ORG_DEMO]);
      assert.match(await rejects(q("select public.platform_record_manual_payment($1, 'VIR-TEST-1', 28000, 'virement')", [other])), /déjà été enregistrée/);
    });
  });
});
