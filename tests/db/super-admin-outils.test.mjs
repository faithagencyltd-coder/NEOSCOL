// Super Admin SA-6 à SA-11 : analyses, suivi commercial, fiche établissement et
// comptes (suspension), audience du site, maintenance et versions,
// confidentialité (registre, export réservé aux propriétaires, sans secret).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

describe("Analyses et suivi commercial", () => {
  test("croissance : séries réelles, réservées à la plateforme", async () => {
    await as(USERS.superadmin, async (q) => {
      const g = (await one(q, "select platform_growth(12) g")).g;
      assert.equal(g.months.length, 12);
      assert.ok("revenue" in g.months[0] && "active_organizations_30d" in g.activity);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_growth(12)")), /Réservé/);
    });
  });

  test("prospect : suivi, historique, « gagné » exige l'établissement créé", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      const lead = (await one(q, "insert into site_leads (kind, full_name, email, country) values ('demo', 'Awa Test', 'awa@exemple.ci', 'CI') returning id")).id;
      await switchTo(q, USERS.superadmin);
      await q("select platform_crm_update_lead($1, 'contacted', true, 'Rappeler', current_date + 2, null, 'call', 'Premier appel : intéressée')", [lead]);
      assert.match(await rejects(q("select platform_crm_update_lead($1, 'won', false, null, null, null, 'note', '')", [lead])), /établissement créé/);
      await q("select platform_crm_update_lead($1, 'won', false, null, null, $2, 'note', 'Contrat signé')", [lead, ORG_DEMO]);
      const l = await one(q, "select status, assigned_to, organization_id from site_leads where id = $1", [lead]);
      assert.deepEqual([l.status, l.assigned_to, l.organization_id], ["won", USERS.superadmin, ORG_DEMO]);
      const events = await q("select kind from site_lead_events where lead_id = $1 order by created_at", [lead]);
      assert.deepEqual(events.map((e) => e.kind), ["status", "call", "status", "note"]);
      const r = (await one(q, "select platform_crm_report(current_date - 1, current_date) r")).r;
      assert.ok(r.won >= 1);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select * from site_lead_events where lead_id = $1", [lead])).length, 0, "historique invisible hors plateforme");
    });
  });
});

describe("Fiche établissement et comptes", () => {
  test("fiche sans donnée d'élève, recherche de compte, suspension motivée qui coupe l'accès", async () => {
    await as(USERS.superadmin, async (q) => {
      const p = (await one(q, "select platform_organization_profile($1) p", [ORG_DEMO])).p;
      assert.ok(p.counts.students > 0 && Array.isArray(p.members));
      assert.ok(!JSON.stringify(p).includes("birth_date"), "aucune donnée d'élève");
      const found = (await one(q, "select platform_user_search('secretariat@') r")).r;
      assert.equal(found[0].email, "secretariat@demo.neoscol.app");
      assert.equal((await one(q, "select jsonb_array_length(platform_user_search('ab')) n")).n, 0, "3 caractères minimum");
      assert.match(await rejects(q("select platform_set_user_active($1, false, 'test')", [USERS.superadmin])), /propre compte/);
      assert.match(await rejects(q("select platform_set_user_active($1, false, '')", [USERS.secretary])), /motif/);
      await q("select platform_set_user_active($1, false, 'Compte compromis')", [USERS.secretary]);
      await switchTo(q, USERS.secretary);
      assert.equal((await one(q, "select cardinality(app.member_org_ids()) n")).n, 0, "compte suspendu : plus aucun accès");
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_user_active($1, true, 'Vérifié avec la direction')", [USERS.secretary]);
      await switchTo(q, USERS.secretary);
      assert.ok((await one(q, "select cardinality(app.member_org_ids()) n")).n >= 1, "réactivé");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_set_user_active($1, false, 'intrusion')", [USERS.teacher])), /Réservé/);
    });
  });
});

describe("Audience, maintenance, versions", () => {
  test("visites : écrites seulement par le serveur, statistiques réservées à la plateforme", async () => {
    await as("anon", async (q) => {
      assert.match(await rejects(q("select record_site_visit('/', null, 'mobile', 'fr', null, repeat('a', 64))")), /permission denied/);
    });
    await as(null, async (q) => {
      await q("set local role service_role");
      await q("select record_site_visit('/tarifs', 'google.com', 'mobile', 'fr', 'CI', repeat('b', 64))");
      await q("select record_site_visit('/', null, 'desktop', 'fr', null, repeat('b', 64))");
      await switchTo(q, USERS.superadmin);
      const s = (await one(q, "select platform_visitor_stats(current_date, current_date) s")).s;
      assert.ok(s.views >= 2 && s.visitors >= 1);
      assert.ok(s.referrers.some((r) => r.source === "google.com"));
      await switchTo(q, USERS.admin);
      assert.equal((await q("select * from site_visits")).length, 0, "visites invisibles hors plateforme");
    });
  });

  test("maintenance : réglée par la plateforme, état public ; versions enregistrées par le serveur", async () => {
    await as(USERS.superadmin, async (q) => {
      assert.match(await rejects(q("select platform_set_maintenance(true, 'Mise à jour', now() - interval '1 hour', 'test')")), /futur/);
      await q("select platform_set_maintenance(true, 'Mise à jour de la base, retour à 14 h.', now() + interval '1 hour', 'Mise à jour planifiée')");
      await switchTo(q, "anon");
      await q("set local role anon");
      assert.equal((await one(q, "select maintenance_state() m")).m.enabled, true, "état lisible par tous");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_set_maintenance(false, null, null, 'intrusion')")), /Réservé/);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_maintenance(false, null, null, 'Fin de la maintenance')");
      assert.equal((await one(q, "select maintenance_state() m")).m.enabled, false);
      assert.match(await rejects(q("select record_release('9.9.9', 'abc', now())")), /permission denied/);
      await switchTo(q, null);
      await q("set local role service_role");
      await q("select record_release('9.9.9', 'abc', now())");
      await switchTo(q, USERS.superadmin);
      assert.ok((await q("select * from platform_release_history()")).some((r) => r.version === "9.9.9"));
    });
  });
});

describe("Confidentialité", () => {
  test("registre des demandes ; export réservé aux propriétaires, journalisé, sans secret", async () => {
    await as(USERS.superadmin, async (q) => {
      const id = (await one(q, "select platform_save_privacy_request(null, $1, 'Parent Koné', 'kone@exemple.ci', 'access', 'Demande la copie des données de son enfant', null, null) id", [ORG_DEMO])).id;
      const r = await one(q, "select due_at - current_date as days, status from privacy_requests where id = $1", [id]);
      assert.deepEqual([r.days, r.status], [30, "received"]);
      await q("select platform_save_privacy_request($1, null, 'x', null, 'access', 'xxxxx', 'completed', 'Copie envoyée')", [id]);
      assert.equal((await one(q, "select status from privacy_requests where id = $1", [id])).status, "completed");

      assert.match(await rejects(q("select platform_begin_org_export($1, '')", [ORG_DEMO])), /motif/);
      const startedAt = (await one(q, "select now() t")).t;
      const tables = (await one(q, "select platform_begin_org_export($1, 'Demande écrite de la direction') t", [ORG_DEMO])).t;
      assert.ok("students" in tables && "invoices" in tables);
      const columns = Object.values(tables).flat();
      assert.ok(!columns.some((c) => /secret|token|hash|password|ciphertext/i.test(c)), "aucune colonne secrète exportable");
      assert.ok(!("audit_logs" in tables));
      await switchTo(q, null);
      assert.equal((await one(q, "select count(*)::int n from audit_logs where action = 'platform.org_export' and organization_id = $1 and created_at >= $2", [ORG_DEMO, startedAt])).n, 1, "export journalisé");

      await q("insert into platform_admins (user_id, role) values ($1, 'admin')", [USERS.director]);
      await switchTo(q, USERS.director);
      assert.match(await rejects(q("select platform_begin_org_export($1, 'Test administrateur')", [ORG_DEMO])), /propriétaire/, "un administrateur ne peut pas exporter");
    });
  });
});
