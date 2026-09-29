// MODULE 4 — Abonnement multi-modules : domaines (1 à 3), espaces rattachés,
// accès contrôlé en base, tarif propre (jamais la somme des modules), isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const GROUP = "10000000-0000-4000-a000-0000000000a4";
const ADMIN = USERS.otherOrgAdmin;

/** Établissement principal Module 4 (essai) administré par ADMIN, dans la transaction de test. */
async function setupGroup(q) {
  await switchTo(q, null);
  await q("insert into organizations (id, name, code, slug, type) values ($1, 'Complexe éducatif ABC', 'CPXABC', 'cpxabc-test', 'school_group')", [GROUP]);
  const [m] = await q("insert into memberships (organization_id, user_id, status, joined_at) values ($1, $2, 'active', now()) returning id", [GROUP, ADMIN]);
  await q("insert into membership_roles (organization_id, membership_id, role_id) select $1, $2, id from roles where organization_id = $1 and key = 'org_admin'", [GROUP, m.id]);
  await switchTo(q, ADMIN);
}

describe("Module 4 — multi-modules", () => {
  test("formule : 30 000 / mois, 252 000 / an (-30 %), essai 20 jours ; abonnement du groupe créé automatiquement", async () => {
    await as(null, async (q) => {
      const [p] = await q("select monthly_price, annual_price, annual_discount_percent::int d, trial_days from subscription_plans where code = 'MULTI_MODULES'");
      assert.deepEqual(p, { monthly_price: 30000, annual_price: 252000, d: 30, trial_days: 20 });
      await setupGroup(q);
      await switchTo(q, null);
      const [s] = await q("select s.status, p.code, s.components from subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = $1", [GROUP]);
      assert.equal(s.status, "TRIALING");
      assert.equal(s.code, "MULTI_MODULES");
      assert.deepEqual(s.components, []);
    });
  });

  test("domaines : au moins un ; espaces créés uniquement pour les domaines souscrits, un par domaine", async () => {
    await as(null, async (q) => {
      await setupGroup(q);
      assert.match(await rejects(q("select create_component_space($1, 'school')", [GROUP])), /pas inclus/);
      assert.match(await rejects(q("select set_subscription_components($1, '{}')", [GROUP])), /au moins un domaine/);
      const [{ c }] = await q("select set_subscription_components($1, array['training', 'school', 'bogus']) c", [GROUP]);
      assert.deepEqual(c, ["school", "training"]);
      const [{ id: school }] = await q("select create_component_space($1, 'school', 'École ABC') id", [GROUP]);
      const [{ id: training }] = await q("select create_component_space($1, 'training') id", [GROUP]);
      assert.match(await rejects(q("select create_component_space($1, 'university')", [GROUP])), /pas inclus/);
      assert.match(await rejects(q("select create_component_space($1, 'school')", [GROUP])), /existe déjà/);
      await switchTo(q, null);
      const spaces = await q("select id, name, type, parent_id from organizations where parent_id = $1 order by name", [GROUP]);
      assert.deepEqual(spaces.map((s) => s.type).sort(), ["school_complex", "vocational_center"]);
      assert.equal(spaces.find((s) => s.id === school).name, "École ABC");
      // Les espaces n'ont pas d'abonnement propre : couverts par le groupe.
      assert.equal((await q("select count(*)::int n from subscriptions where organization_id = any ($1)", [[school, training]]))[0].n, 0);
      assert.equal((await q("select app.org_billing_access($1) a", [school]))[0].a, "full");
      assert.equal((await q("select app.org_billing_access($1) a", [training]))[0].a, "full");
      // L'administrateur du groupe administre les espaces (rôles provisionnés).
      await switchTo(q, ADMIN);
      assert.equal((await q("select app.has_permission($1, 'students.create') ok", [school]))[0].ok, true);
      assert.equal((await q("select app.has_permission($1, 'settings.manage') ok", [training]))[0].ok, true);
    });
  });

  test("domaine non souscrit ou retiré : espace en lecture seule, aucune donnée supprimée", async () => {
    await as(null, async (q) => {
      await setupGroup(q);
      await q("select set_subscription_components($1, array['school', 'training'])", [GROUP]);
      const [{ id: training }] = await q("select create_component_space($1, 'training') id", [GROUP]);
      await q("select set_subscription_components($1, array['school'])", [GROUP]);
      await switchTo(q, null);
      assert.equal((await q("select app.org_billing_access($1) a", [training]))[0].a, "read_only");
      assert.equal((await q("select count(*)::int n from organizations where id = $1", [training]))[0].n, 1, "espace conservé");
      await switchTo(q, ADMIN);
      assert.equal((await q("select app.has_permission($1, 'students.create') ok", [training]))[0].ok, false, "écriture coupée");
      assert.ok((await q("select $1 = any (app.permitted_org_ids('students.read')) ok", [training]))[0].ok, "lecture conservée");
      // Université rattachée sans être souscrite : lecture seule aussi.
      await switchTo(q, null);
      await q("insert into organizations (parent_id, name, code, slug, type) values ($1, 'Université ABC', 'CPXUNI', 'cpxuni-test', 'university')", [GROUP]);
      assert.equal((await q("select app.org_billing_access(id) a from organizations where code = 'CPXUNI'"))[0].a, "read_only");
      const events = await q("select event_type from subscription_events where organization_id = $1 order by created_at", [GROUP]);
      assert.ok(events.some((e) => e.event_type === "components_changed") && events.some((e) => e.event_type === "space_created"));
    });
  });

  test("tarif propre au Module 4 : même prix avec 1, 2 ou 3 domaines", async () => {
    await as(null, async (q) => {
      await setupGroup(q);
      for (const components of [["school"], ["school", "training"], ["school", "training", "university"]]) {
        await q("select set_subscription_components($1, $2)", [GROUP, components]);
        await switchTo(q, null);
        const [y] = await q("select (app.billing_create_invoice($1, 'MULTI_MODULES', 'YEARLY', 'subscription')).amount a", [GROUP]);
        const [m] = await q("select (app.billing_create_invoice($1, 'MULTI_MODULES', 'MONTHLY', 'subscription')).amount a", [GROUP]);
        assert.equal(y.a, 252000);
        assert.equal(m.a, 30000);
        await switchTo(q, ADMIN);
      }
    });
  });

  test("formule réservée aux établissements principaux ; un groupe ne prend que le Module 4", async () => {
    await as(null, async (q) => {
      await setupGroup(q);
      await switchTo(q, null);
      assert.match(await rejects(q("update subscriptions set plan_id = (select id from subscription_plans where code = 'MULTI_MODULES') where organization_id = $1", [ORG_DEMO])), /réservé/);
      assert.match(await rejects(q("select app.billing_create_invoice($1, 'MULTI_MODULES', 'MONTHLY', 'subscription')", [ORG_DEMO])), /réservé/);
      assert.match(await rejects(q("update subscriptions set plan_id = (select id from subscription_plans where code = 'MODULE_SCOLAIRE') where organization_id = $1", [GROUP])), /réservé/);
    });
  });

  test("sécurité : permissions et isolation (navigateur ignoré, contrôles en base)", async () => {
    await as(null, async (q) => {
      await setupGroup(q);
      await q("select set_subscription_components($1, array['school'])", [GROUP]);
      const [{ o }] = await q("select module4_overview($1) o", [GROUP]);
      assert.deepEqual(o.components, ["school"]);
      assert.equal(o.group.member, true);
      // Autre établissement : aucun accès au groupe ni à ses réglages.
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select set_subscription_components($1, array['school', 'training', 'university'])", [GROUP])), /Permission/);
      assert.match(await rejects(q("select create_component_space($1, 'school')", [GROUP])), /Permission/);
      assert.match(await rejects(q("select module4_overview($1)", [GROUP])), /Accès refusé/);
      assert.equal((await q("select count(*)::int n from organizations where id = $1", [GROUP]))[0].n, 0);
      assert.equal((await q("select count(*)::int n from subscriptions where organization_id = $1", [GROUP]))[0].n, 0);
      // Enseignant d'un autre établissement : idem.
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select set_subscription_components($1, array['school'])", [GROUP])), /Permission/);
    });
  });
});
