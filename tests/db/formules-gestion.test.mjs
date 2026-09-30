// Formules gérées par le Super Admin : création, modification, duplication,
// retrait, suppression (seulement si jamais utilisée), options appliquées aux
// établissements, garde sur le type d'établissement, formule d'essai.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const FEATURES = JSON.stringify({ parents: true, student_portal: false, assistant: false, sms: true });
const create = (q, code = "SCOLAIRE_PREMIUM", types = "{primary_school,middle_school}", active = true) =>
  q(
    `select platform_save_plan(null, $1, 'Scolaire Premium', 'School Premium', 'Pour aller plus loin.', 'To go further.', 'Écoles exigeantes',
       '["Tout le Module Scolaire", "Assistance prioritaire"]'::jsonb, '["Everything in School"]'::jsonb, $2::organization_type[], 2, $3, $4::jsonb, 25000, 30, 10) as id`,
    [code, types, active, FEATURES],
  );

describe("Formules (Super Admin)", () => {
  test("création : Super Admin uniquement, contrôles, options et prix annuel calculés, audit", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ id }] = await create(q);
      const [plan] = await q("select * from subscription_plans where id = $1", [id]);
      assert.deepEqual([plan.code, plan.name_en, plan.monthly_price, plan.annual_price, plan.trial_days, plan.is_active], ["SCOLAIRE_PREMIUM", "School Premium", 25000, 210000, 10, true]);
      assert.deepEqual(plan.highlights, ["Tout le Module Scolaire", "Assistance prioritaire"]);
      const features = Object.fromEntries((await q("select feature_code, enabled from subscription_features where plan_id = $1", [id])).map((f) => [f.feature_code, f.enabled]));
      assert.equal(Object.keys(features).length, 17, "toutes les options du catalogue");
      assert.deepEqual([features.parents, features.student_portal, features.assistant, features.grades], [true, false, false, true], "options choisies, les autres incluses");
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'platform.plan_created' and entity_id = $1", [id]))[0].n, 1);

      assert.match(await rejects(create(q)), /existe déjà/);
      assert.match(await rejects(create(q, "sc-1")), /Code de la formule/);
      assert.match(await rejects(create(q, "SANS_TYPE", "{}")), /au moins un type/);
      assert.match(await rejects(create(q, "GROUPE_BIS", "{school_group}")), /uniquement le Module 4/);
      assert.match(await rejects(q("select platform_save_plan(null, 'X_OPT', 'Test', null, null, null, null, '[]', '[]', '{university}', 1, true, '{\"piratage\": true}', 1000)")), /Option inconnue/);
      for (const user of [USERS.admin, USERS.director, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(create(q, "INTRUS")), /Réservé|Permission|platform/i);
      }
    });
  });

  test("modification, duplication, retrait, réactivation, suppression", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ id }] = await create(q);
      await q(
        `select platform_save_plan($1, '', 'Scolaire Premium+', null, 'Nouveau texte', null, null, '["Un", " ", "Deux"]', '[]', '{high_school}', 3, true, '{"assistant": true}')`,
        [id],
      );
      const [plan] = await q("select name, description, highlights, org_types, sort_order, code, monthly_price from subscription_plans where id = $1", [id]);
      assert.deepEqual([plan.name, plan.description, plan.code, plan.monthly_price, plan.sort_order], ["Scolaire Premium+", "Nouveau texte", "SCOLAIRE_PREMIUM", 25000, 3], "code et prix inchangés");
      assert.deepEqual(plan.highlights, ["Un", "Deux"], "lignes vides ignorées");
      assert.equal((await q("select enabled from subscription_features where plan_id = $1 and feature_code = 'assistant'", [id]))[0].enabled, true);

      const [{ id: copy }] = await q("select platform_duplicate_plan($1, 'SCOLAIRE_PREMIUM_BIS', 'Copie') as id", [id]);
      const [dup] = await q("select is_active, monthly_price, org_types from subscription_plans where id = $1", [copy]);
      assert.deepEqual([dup.is_active, dup.monthly_price], [false, 25000], "copie retirée, même prix");
      assert.equal((await q("select count(*)::int as n from subscription_features where plan_id = $1", [copy]))[0].n, 17);

      await q("select platform_set_plan_active($1, false)", [id]);
      assert.equal((await q("select is_active from subscription_plans where id = $1", [id]))[0].is_active, false);
      await q("select platform_set_plan_active($1, true)", [id]);
      await switchTo(q, null);
      await q("update subscription_plans set org_types = '{}' where id = $1", [copy]);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_set_plan_active($1, true)", [copy])), /au moins un type/);

      await q("select platform_delete_plan($1)", [copy]);
      assert.equal((await q("select count(*)::int as n from subscription_plans where id = $1", [copy]))[0].n, 0, "formule jamais utilisée : supprimée");
      const [{ id: used }] = await q("select id from subscription_plans where code = 'MODULE_SCOLAIRE'");
      assert.match(await rejects(q("select platform_delete_plan($1)", [used])), /déjà servi/);
      assert.equal((await q("select count(*)::int as n from audit_logs where action in ('platform.plan_retired', 'platform.plan_reactivated', 'platform.plan_deleted')"))[0].n, 3);
    });
  });

  test("garde : une formule n'est souscrite que par les types d'établissement concernés", async () => {
    await as(USERS.superadmin, async (q) => {
      await create(q, "UNIV_PLUS", "{university,institute}");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select public.billing_start_checkout($1, 'UNIV_PLUS', 'MONTHLY', 'simulation', 'test')", [ORG_DEMO])), /pas proposée à ce type/, "une école ne souscrit pas une formule université");
      await switchTo(q, null);
      const [{ plan_id, id: sub }] = await q("select plan_id, id from subscriptions where organization_id = $1", [ORG_DEMO]);
      const [{ id: univ }] = await q("select id from subscription_plans where code = 'UNIV_PLUS'");
      const insert = (planId) =>
        q(
          `insert into subscription_invoices (organization_id, subscription_id, invoice_number, plan_id, plan_code, plan_name, billing_interval,
             unit_monthly_price, unit_annual_price, list_amount, discount_amount, amount, currency, kind, status, due_at)
           values ($1, $2, 'NSC-2099-' || lpad(floor(random() * 999999)::text, 6, '0'), $3, 'X', 'X', 'MONTHLY', 1000, 10000, 1000, 0, 1000, 'XOF', 'plan_change', 'PENDING', now())`,
          [ORG_DEMO, sub, planId],
        );
      assert.match(await rejects(insert(univ)), /pas proposée à ce type/);
      await insert(plan_id);
    });
  });

  test("options appliquées : l'établissement lit les options de sa formule ; formule d'essai par type", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ id: school }] = await q("select s.plan_id as id from subscriptions s where s.organization_id = $1", [ORG_DEMO]);
      await q("select platform_save_plan($1, '', 'Module Scolaire', null, null, null, null, '[]', '[]', '{primary_school,middle_school,high_school,private_school,school_complex}', 1, true, '{\"assistant\": false}')", [school]);
      await switchTo(q, USERS.admin);
      const [org] = await q("select o.id, public.plan_features(o) as f from organizations o where o.id = $1", [ORG_DEMO]);
      assert.equal(org.f.assistant, false, "l'établissement voit l'option coupée");
      assert.equal(org.f.parents, true);
      assert.equal((await q("select app.org_plan_allows($1, 'assistant') as ok", [ORG_DEMO]))[0].ok, false);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select count(*)::int as n from organizations o where o.id = $1 and public.plan_features(o) is not null", [ORG_DEMO]))[0].n, 0, "options d'un autre établissement invisibles");

      await switchTo(q, USERS.superadmin);
      assert.equal((await q("select app.default_plan_code('university') as c"))[0].c, "UNIVERSITE");
      await create(q, "UNIV_ESSENTIEL", "{university}");
      await switchTo(q, null);
      await q("update subscription_plans set sort_order = 0 where code = 'UNIV_ESSENTIEL'");
      assert.equal((await q("select app.default_plan_code('university') as c"))[0].c, "UNIV_ESSENTIEL", "la première formule proposée au type sert à l'essai");
      assert.equal((await q("select app.default_plan_code('institute') as c"))[0].c, "UNIVERSITE");
    });
  });
});
