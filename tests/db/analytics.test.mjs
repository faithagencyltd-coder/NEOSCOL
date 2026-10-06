// Analytics (console Super Admin) : enregistrement par le serveur seulement,
// visiteurs qui reviennent (avec consentement), protection des sessions,
// réglages (désactivation, clics), usage des établissements (membres seulement),
// lecture réservée à la plateforme, purge selon la durée de conservation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];
const hex = (c) => c.repeat(64);
const session = (id, visitor, extra = {}) => JSON.stringify({ id, visitor, consented: false, device: "mobile", os: "android", browser: "chrome", country: "CI", city: "Abidjan", locale: "fr", ...extra });
const ev = (list) => JSON.stringify(list);

describe("Analytics", () => {
  test("enregistrement : sessions, pages, clics, durée, conversion ; visiteur qui revient ; session protégée", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      await q("update analytics_settings set enabled = true, track_clicks = true, track_duration = true where id = 1");
      const s1 = randomUUID();
      await q("select record_analytics($1, $2)", [session(s1, hex("a"), { consented: true }), ev([
        { type: "pageview", path: "/", n: 1 },
        { type: "click", path: "/", label: "Demander une démo", target: null },
        { type: "pageview", path: "/tarifs", n: 2 },
        { type: "leave", path: "/", duration_ms: 12000 },
        { type: "conversion", path: "/contact", label: "demo_request" },
      ])]);
      const row = await one(q, "select pages, entry_path, exit_path, converted, consented, is_returning from analytics_sessions where id = $1", [s1]);
      assert.deepEqual([row.pages, row.entry_path, row.exit_path, row.converted, row.consented, row.is_returning], [2, "/", "/tarifs", true, true, false]);
      assert.equal((await one(q, "select count(*)::int n from analytics_events where session_id = $1", [s1])).n, 5);

      // Le même visiteur (consentement) revenu un autre jour.
      await q("update analytics_sessions set day = current_date - 3 where id = $1", [s1]);
      const s2 = randomUUID();
      await q("select record_analytics($1, $2)", [session(s2, hex("a"), { consented: true }), ev([{ type: "pageview", path: "/", n: 1 }])]);
      assert.equal((await one(q, "select is_returning from analytics_sessions where id = $1", [s2])).is_returning, true);

      // Identifiant de session réutilisé par un autre visiteur : ignoré.
      await q("select record_analytics($1, $2)", [session(s2, hex("b")), ev([{ type: "pageview", path: "/pirate", n: 1 }])]);
      assert.equal((await one(q, "select count(*)::int n from analytics_events where session_id = $1 and path = '/pirate'", [s2])).n, 0);

      // Signe de vie d'une session inconnue : rien n'est créé.
      const ghost = randomUUID();
      await q("select record_analytics($1, '[]'::jsonb)", [session(ghost, hex("c"))]);
      assert.equal((await one(q, "select count(*)::int n from analytics_sessions where id = $1", [ghost])).n, 0);

      // Réglages : clics désactivés, puis mesure désactivée.
      await q("update analytics_settings set track_clicks = false where id = 1");
      const s3 = randomUUID();
      await q("select record_analytics($1, $2)", [session(s3, hex("d")), ev([{ type: "pageview", path: "/", n: 1 }, { type: "click", path: "/", label: "Tarifs" }])]);
      assert.equal((await one(q, "select count(*)::int n from analytics_events where session_id = $1 and type = 'click'", [s3])).n, 0, "clics non enregistrés");
      await q("update analytics_settings set enabled = false where id = 1");
      const s4 = randomUUID();
      await q("select record_analytics($1, $2)", [session(s4, hex("e")), ev([{ type: "pageview", path: "/", n: 1 }])]);
      assert.equal((await one(q, "select count(*)::int n from analytics_sessions where id = $1", [s4])).n, 0, "mesure désactivée");
    });
  });

  test("droits : écriture réservée au serveur ; lecture et réglages réservés à la plateforme", async () => {
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select record_analytics('{}'::jsonb, '[]'::jsonb)")), /permission denied/);
      assert.match(await rejects(q("select record_app_usage($1, $2, 'eleves')", [ORG_DEMO, USERS.admin])), /permission denied/);
      assert.match(await rejects(q("select platform_analytics_overview(current_date - 7, current_date, '', '')")), /Réservé à l'administration/);
      assert.match(await rejects(q("select platform_analytics_organizations(current_date - 7, current_date, '')")), /Réservé à l'administration/);
      assert.match(await rejects(q("select platform_save_analytics_settings(false, false, false, false, false, 13)")), /Réservé à l'administration/);
      assert.equal((await q("select * from analytics_sessions")).length, 0, "aucune session lisible par un établissement");
    });
    await as(USERS.superadmin, async (q) => {
      const o = (await one(q, "select platform_analytics_overview(current_date - 29, current_date, '', '') o")).o;
      assert.ok("realtime" in o && "by_day" in o && o.by_day.length === 30);
      assert.match(await rejects(q("select platform_save_analytics_settings(true, true, true, true, true, 40)")), /entre 1 et 25/);
      await q("select platform_save_analytics_settings(true, true, true, true, true, 13)");
    });
  });

  test("usage des établissements : membres seulement ; synthèse par établissement ; purge", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      await q("update analytics_settings set enabled = true, track_app_usage = true, retention_months = 13 where id = 1");
      await q("select record_app_usage($1, $2, 'eleves')", [ORG_DEMO, USERS.admin]);
      await q("select record_app_usage($1, $2, 'eleves')", [ORG_DEMO, USERS.admin]);
      await q("select record_app_usage($1, $2, 'eleves')", [ORG_DEMO, USERS.otherOrgAdmin]);
      const views = await one(q, "select coalesce(sum(views), 0)::int v from analytics_app_usage where organization_id = $1 and module = 'eleves' and day = current_date and user_id = $2", [ORG_DEMO, USERS.admin]);
      assert.ok(views.v >= 2);
      assert.equal((await one(q, "select count(*)::int n from analytics_app_usage where organization_id = $1 and user_id = $2", [ORG_DEMO, USERS.otherOrgAdmin])).n, 0, "non-membre ignoré");
      await q("update organizations set is_demo = false where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      const s = (await one(q, "select platform_analytics_organizations(current_date - 6, current_date, '') s")).s;
      const demo = s.rows.find((r) => r.id === ORG_DEMO);
      assert.ok(demo && demo.page_views >= 2 && demo.top_modules.includes("eleves"));
      assert.ok(s.modules.some((m) => m.module === "eleves"));
      await switchTo(q, null);
      const old = randomUUID();
      await q("insert into analytics_sessions (id, visitor, day, device, os, browser) values ($1, $2, current_date - interval '14 months', 'desktop', 'windows', 'edge')", [old, hex("f")]);
      await switchTo(q, USERS.superadmin);
      const purged = (await one(q, "select platform_purge_analytics() p")).p;
      assert.ok(purged.sessions >= 1);
      await switchTo(q, null);
      assert.equal((await one(q, "select count(*)::int n from analytics_sessions where id = $1", [old])).n, 0);
    });
  });
});
