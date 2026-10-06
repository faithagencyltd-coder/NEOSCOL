// Super Admin SA-2 à SA-5 : tableau de bord, alertes de sécurité, supervision
// (réservés à la plateforme, sans secret) ; assistance et incidents (droits,
// isolation entre établissements, notes internes, notifications).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

describe("Centre de contrôle de la plateforme", () => {
  test("tableau de bord, alertes, supervision : réservés à la plateforme, données réelles, aucun secret", async () => {
    await as(USERS.superadmin, async (q) => {
      const d = (await one(q, "select platform_dashboard() d")).d;
      const orgs = (await one(q, "select count(*)::int n from organizations")).n;
      assert.equal(d.organizations.total, orgs, "nombre réel d'établissements");
      assert.ok(Array.isArray(d.alerts) && Array.isArray(d.expiring));
      const a = (await one(q, "select platform_security_alerts(7) a")).a;
      for (const key of ["repeated_failures", "denied", "spraying", "new_devices", "many_addresses", "changes"]) assert.ok(Array.isArray(a[key]), key);
      const h = (await one(q, "select platform_service_health() h")).h;
      assert.ok(h.database.size_bytes > 0);
      assert.ok(!JSON.stringify(h).includes("secret"), "aucune clé ni secret dans la supervision");
      assert.ok((await one(q, "select health_ping() t")).t);
      for (const user of [USERS.admin, USERS.parent]) {
        await switchTo(q, user);
        for (const fn of ["platform_dashboard()", "platform_security_alerts(7)", "platform_service_health()", "platform_support_overview()"]) {
          assert.match(await rejects(q(`select ${fn}`)), /Réservé/, `${fn} refusé`);
        }
      }
    });
  });

  test("détection : même adresse sur plusieurs comptes, nouvel appareil, modification de rôle", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      for (let i = 0; i < 6; i++) await q("insert into auth_login_attempts (identifier_hash, ip_hash, kind) values (encode(sha256(convert_to($1, 'UTF8')), 'hex'), encode(sha256('ip-attaque'), 'hex'), 'failure')", [`compte-${i}`]);
      await q("insert into audit_logs (actor_id, actor_email, action, result, metadata, created_at) values ($1, 'direction@demo.neoscol.app', 'auth.login', 'success', '{\"user_agent\":\"Ancien\",\"ip\":\"1\"}', now() - interval '2 days')", [USERS.director]);
      await q("insert into audit_logs (actor_id, actor_email, action, result, metadata) values ($1, 'direction@demo.neoscol.app', 'auth.login', 'success', '{\"user_agent\":\"Mozilla Android Chrome/1\",\"ip\":\"2\"}')", [USERS.director]);
      await q("insert into audit_logs (organization_id, actor_id, actor_email, action, summary) values ($1, $2, 'admin@demo.neoscol.app', 'membership_roles.insert', 'rôle ajouté')", [ORG_DEMO, USERS.admin]);
      await switchTo(q, USERS.superadmin);
      const a = (await one(q, "select platform_security_alerts(7) a")).a;
      assert.ok(a.spraying.some((s) => s.accounts >= 6), "attaque probable : une adresse, plusieurs comptes");
      assert.ok(a.new_devices.some((n) => n.device.includes("Android")), "nouvel appareil repéré");
      assert.ok(a.changes.some((c) => c.action === "membership_roles.insert"), "modification sensible listée");
      assert.equal(a.changes.find((c) => c.action === "membership_roles.insert").summary, null, "détail métier d'une école non exposé");
    });
  });
});

describe("Assistance et incidents", () => {
  test("demande d'un établissement : visible par l'auteur, les responsables et la plateforme ; jamais par un autre établissement", async () => {
    await as(USERS.secretary, async (q) => {
      const id = (await one(q, "select create_support_ticket($1, 'connexion', 'high', 'Connexion impossible', 'Les parents ne peuvent plus se connecter.') id", [ORG_DEMO])).id;
      assert.match(await rejects(q("select create_support_ticket($1, 'connexion', 'high', 'Test intrus', 'Pas mon établissement')", [ORG_DEMOF])), /non autorisé/);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select id from support_tickets where id = $1", [id])).length, 1, "responsable (paramètres) : visible");
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from support_tickets where id = $1", [id])).length, 0, "autre membre sans droit : invisible");
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from support_tickets where id = $1", [id])).length, 0, "autre établissement : invisible");
      assert.match(await rejects(q("select add_support_message($1, 'intrusion')", [id])), /introuvable/);

      await switchTo(q, USERS.superadmin);
      await q("select add_support_message($1, 'Note interne : vérifier la passerelle', true)", [id]);
      await q("select add_support_message($1, 'Nous regardons tout de suite.')", [id]);
      await q("select platform_update_ticket($1, 'resolved', 'high', true)", [id]);
      const t = await one(q, "select status, assigned_to, resolved_at from support_tickets where id = $1", [id]);
      assert.deepEqual([t.status, t.assigned_to, Boolean(t.resolved_at)], ["resolved", USERS.superadmin, true]);
      const ov = (await one(q, "select platform_support_overview() o")).o;
      assert.ok(ov.resolved_30d >= 1);

      await switchTo(q, USERS.secretary);
      const msgs = await q("select body, author_side from support_ticket_messages where ticket_id = $1 order by created_at", [id]);
      assert.deepEqual(msgs.map((m) => m.body), ["Nous regardons tout de suite."], "note interne invisible pour l'établissement");
      const notes = await q("select title from notifications where user_id = $1 and type = 'support' and link like $2 order by created_at", [USERS.secretary, `%${id}`]);
      assert.equal(notes.length, 2, "auteur prévenu de la réponse et de la résolution");
      await q("select add_support_message($1, 'Toujours bloqué chez certains parents.')", [id]);
      assert.equal((await one(q, "select status from support_tickets where id = $1", [id])).status, "open", "réponse de l'établissement : demande rouverte");
      assert.match(await rejects(q("select platform_update_ticket($1, 'closed', 'low', false)", [id])), /Réservé/);
      assert.match(await rejects(q("update support_tickets set status = 'closed' where id = $1", [id])), /permission denied/);
    });
  });

  test("incident de la plateforme : déclaré par la plateforme seulement", async () => {
    await as(USERS.superadmin, async (q) => {
      const id = (await one(q, "select platform_create_incident(null, 'notifications', 'critical', 'Envoi des SMS interrompu', 'Le fournisseur ne répond plus.') id")).id;
      assert.equal((await one(q, "select kind, status from support_tickets where id = $1", [id])).kind, "incident");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_create_incident(null, 'bug', 'low', 'Faux incident', 'Pas autorisé')")), /Réservé/);
      assert.equal((await q("select id from support_tickets where id = $1", [id])).length, 0, "incident interne invisible des établissements");
    });
  });
});
