// Super Admin SA-1 : équipe et rôles (propriétaire, administrateur, lecture
// seule garantie en base), journal global, contrôle des modules par niveau.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

describe("Équipe Super Admin", () => {
  test("rôles : seul un propriétaire gère l'équipe ; il reste toujours un propriétaire", async () => {
    await as(USERS.superadmin, async (q) => {
      assert.equal((await one(q, "select my_platform_role() r")).r, "owner", "les comptes existants deviennent propriétaires");
      await q("select platform_add_team_member($1, 'admin')", [USERS.director]);
      await q("select platform_add_team_member($1, 'viewer')", [USERS.secretary]);
      assert.match(await rejects(q("select platform_add_team_member($1, 'viewer')", [USERS.secretary])), /déjà/);
      assert.match(await rejects(q("select platform_add_team_member($1, 'chef')", [USERS.accountant])), /Rôle inconnu/);
      const team = await q("select user_id, role from platform_team()");
      assert.equal(team.length, 3);

      await switchTo(q, USERS.director);
      assert.equal((await one(q, "select is_platform_admin() a")).a, true, "administrateur : accès complet");
      assert.match(await rejects(q("select platform_add_team_member($1, 'viewer')", [USERS.accountant])), /propriétaire/, "un administrateur ne gère pas l'équipe");
      assert.match(await rejects(q("select platform_set_team_role($1, 'viewer')", [USERS.superadmin])), /propriétaire/);

      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_team()")), /Réservé/, "hors équipe : refusé");
      assert.equal((await one(q, "select my_platform_role() r")).r, null);

      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_set_team_role($1, 'admin')", [USERS.superadmin])), /au moins un propriétaire/);
      assert.match(await rejects(q("select platform_remove_team_member($1, 'départ')", [USERS.superadmin])), /au moins un propriétaire/);
      assert.match(await rejects(q("select platform_remove_team_member($1, '')", [USERS.director])), /motif/);
      await q("select platform_set_team_role($1, 'owner')", [USERS.director]);
      await q("select platform_set_team_role($1, 'admin')", [USERS.superadmin]);
      assert.equal((await one(q, "select my_platform_role() r")).r, "admin", "rétrogradation possible quand un autre propriétaire existe");
      await switchTo(q, USERS.director);
      await q("select platform_remove_team_member($1, 'Fin de mission')", [USERS.secretary]);
      assert.equal((await one(q, "select count(*)::int n from profiles where id = $1", [USERS.secretary])).n, 1, "le compte lui-même est conservé");
      const log = await q("select action from audit_logs where action like 'platform.team_%' order by id");
      assert.deepEqual(log.map((r) => r.action), ["platform.team_member_added", "platform.team_member_added", "platform.team_role_changed", "platform.team_role_changed", "platform.team_member_removed"]);
    });
  });

  test("lecture seule : consulte la console, toute écriture est refusée par la base", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_add_team_member($1, 'viewer')", [USERS.secretary]);
      await switchTo(q, USERS.secretary);
      assert.equal((await one(q, "select my_platform_role() r")).r, "viewer");
      assert.match(await rejects(q("select platform_set_feature_rule('assistant', 'global', null, false, 'Test lecture')")), /Réservé/, "écriture par fonction refusée");
      assert.match(await rejects(q("select platform_set_org_features($1, '{\"assistant\": false}', 'test')", [ORG_DEMO])), /Réservé/);
      assert.equal((await q("update organizations set name = 'X' where id = $1 returning id", [ORG_DEMOF])).length, 0, "modification directe d'un établissement : aucune ligne");
    });
  });
});

describe("Lecture seule (transaction en lecture seule, comme les lectures de l'application)", () => {
  test("le membre lecture seule consulte tout, sans pouvoir écrire", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("insert into platform_admins (user_id, role) values ($1, 'viewer')", [USERS.secretary]);
      await client.query("set transaction read only");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.secretary, role: "authenticated" })]);
      const q = async (sql, params) => (await client.query(sql, params)).rows;
      assert.equal((await q("select is_platform_admin() a"))[0].a, true);
      assert.ok((await q("select * from platform_overview()")).length >= 3, "tableau des établissements visible");
      assert.ok((await q("select * from platform_team()")).length >= 2, "équipe visible");
      await q("select * from platform_activity_log()");
      await assert.rejects(q("select platform_set_feature_rule('assistant', 'global', null, false, 'Test lecture')"), /read-only/);
    } finally {
      await client.query("rollback").catch(() => {});
      client.release();
    }
  });
});

describe("Journal global", () => {
  test("filtres et confidentialité : le détail métier d'une école reste masqué", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      await q("insert into audit_logs (organization_id, actor_email, action, summary) values ($1, 'secretariat@demo.neoscol.app', 'student.created', 'Élève créé : Aya Koné')", [ORG_DEMO]);
      await q("insert into audit_logs (organization_id, actor_email, action, summary, result) values ($1, 'x@y.z', 'auth.login', 'Connexion refusée', 'failure')", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      const rows = await q("select * from platform_activity_log(p_org => $1, p_limit => 5)", [ORG_DEMO]);
      const student = rows.find((r) => r.action === "student.created");
      assert.equal(student.summary, null, "détail métier masqué");
      assert.equal(student.details_hidden, true);
      assert.equal(student.organization_name.length > 0, true);
      const login = rows.find((r) => r.action === "auth.login");
      assert.equal(login.summary, "Connexion refusée", "événement de sécurité détaillé");
      assert.equal(login.severity, "high");
      const high = await q("select * from platform_activity_log(p_severity => 'high', p_org => $1)", [ORG_DEMO]);
      assert.ok(high.every((r) => r.severity === "high"));
      const actor = await q("select * from platform_activity_log(p_actor => 'secretariat@', p_category => 'student')");
      assert.ok(actor.length >= 1 && actor.every((r) => r.category === "student"));
      assert.ok(Number(rows[0].total) >= 2, "total pour la pagination");
      assert.match(await rejects(q("select * from platform_activity_log(p_severity => 'grave')")), /Gravité/);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select * from platform_activity_log()")), /Réservé/, "réservé à la plateforme");
    });
  });
});

describe("Contrôle des modules", () => {
  test("plateforme, pays, type : le niveau le plus précis l'emporte ; historique", async () => {
    await as(USERS.superadmin, async (q) => {
      const locked = async (org) => (await one(q, "select platform_locked_features(o) l from organizations o where id = $1", [org])).l;
      assert.deepEqual(await locked(ORG_DEMO), {});
      await q("select platform_set_feature_rule('assistant', 'global', null, false, 'Ouverture progressive')");
      assert.deepEqual(await locked(ORG_DEMO), { assistant: false }, "arrêt global");
      const country = (await one(q, "select country from organizations where id = $1", [ORG_DEMO])).country;
      await q("select platform_set_feature_rule('assistant', 'country', $1, true, 'Pilote pays')", [country]);
      assert.deepEqual(await locked(ORG_DEMO), {}, "pays pilote rouvert malgré l'arrêt global");
      await q("select platform_set_feature_rule('assistant', 'org_type', 'vocational_center', false, 'Pas encore pour la formation')");
      assert.deepEqual(await locked(ORG_DEMOF), { assistant: false }, "le type l'emporte sur le pays");
      assert.equal((await one(q, "select app.org_feature_enabled($1, 'assistant') e", [ORG_DEMOF])).e, false, "appliqué aussi côté base");
      assert.equal((await one(q, "select app.org_feature_enabled($1, 'assistant') e", [ORG_DEMO])).e, true);
      const impact = await one(q, "select * from platform_feature_impact() where feature_key = 'assistant'");
      assert.ok(Number(impact.locked) >= 1);
      await q("select platform_set_feature_rule('assistant', 'org_type', 'vocational_center', null, 'Retrait de la règle')");
      assert.deepEqual(await locked(ORG_DEMOF), country === (await one(q, "select country from organizations where id = $1", [ORG_DEMOF])).country ? {} : { assistant: false });
      assert.match(await rejects(q("select platform_set_feature_rule('inconnu', 'global', null, false, 'x x x')")), /inconnue/);
      assert.match(await rejects(q("select platform_set_feature_rule('assistant', 'country', 'ZZ', false, 'x x x')")), /Pays inconnu/);
      assert.match(await rejects(q("select platform_set_feature_rule('assistant', 'global', null, false, '')")), /motif/);
      assert.equal((await one(q, "select count(*)::int n from audit_logs where action like 'platform.feature_rule%'")).n, 4, "chaque changement est journalisé");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_set_feature_rule('assistant', 'global', null, true, 'x x x')")), /Réservé/);
      assert.equal((await q("select * from platform_feature_rules")).length, 0, "règles invisibles hors plateforme");
    });
  });
});
