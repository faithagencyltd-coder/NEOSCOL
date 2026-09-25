// MODULE 1 — SCOLAIRE : niveaux configurables, séries du lycée, matières, isolation, permissions.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const ORG_UNIV = "10000000-0000-4000-a000-000000000003";
const LABEL = { maternelle: "Maternelle", primaire: "Primaire", college: "Collège", lycee: "Lycée" };

async function configure(q, levels, tracks = ["general"], org = ORG_DEMO) {
  const [{ c }] = await q("select public.set_school_config($1, $2, $3) c", [org, levels, tracks]);
  return c;
}
const levelsOf = async (q, org = ORG_DEMO) => (await q("select settings->'school'->'levels' l from organizations where id = $1", [org]))[0].l;
const insertLevel = (q, cycle, name, org = ORG_DEMO) =>
  q("insert into levels (organization_id, name, school_cycle, cycle, sequence) values ($1, $2, $3, $4, 50)", [org, name, cycle, LABEL[cycle]]);

describe("Module Scolaire", () => {
  test("établissements existants : configuration par défaut compatible, formations et universités non concernées", async () => {
    await as(null, async (q) => {
      assert.deepEqual(await levelsOf(q), ["maternelle", "primaire", "college", "lycee"], "groupe scolaire DEMO : parcours complet");
      assert.equal((await q("select count(*)::int n from levels where organization_id = $1 and school_cycle = 'college'", [ORG_DEMO]))[0].n, 4, "6e→3e classés Collège");
      assert.equal(await levelsOf(q, ORG_DEMOF), null, "centre de formation : hors Module Scolaire");
      assert.equal(await levelsOf(q, ORG_UNIV), null, "université : hors Module Scolaire");
      assert.equal((await q("select count(*)::int n from levels where organization_id = $1 and school_cycle is not null", [ORG_UNIV]))[0].n, 0);
    });
  });

  for (const [n, levels] of [
    [1, ["maternelle"]],
    [2, ["primaire"]],
    [3, ["college"]],
    [4, ["lycee"]],
    [5, ["college", "lycee"]],
    [6, ["maternelle", "primaire"]],
    [7, ["maternelle", "primaire", "college", "lycee"]],
  ]) {
    test(`TEST ${n} — ${levels.map((l) => LABEL[l]).join(" + ")} : seuls ces niveaux sont utilisables, rien n'est supprimé`, async () => {
      await as(USERS.admin, async (q) => {
        const classesBefore = (await q("select count(*)::int n from classes where organization_id = $1", [ORG_DEMO]))[0].n;
        const cfg = await configure(q, [...levels].reverse(), ["general"]);
        assert.deepEqual(cfg.levels, levels, "ordre naturel conservé");
        assert.deepEqual(cfg.lycee_tracks, levels.includes("lycee") ? ["general"] : []);
        for (const cycle of Object.keys(LABEL)) {
          if (levels.includes(cycle)) {
            await insertLevel(q, cycle, `Test ${cycle}`);
          } else {
            assert.match(await rejects(insertLevel(q, cycle, `Test ${cycle}`)), /n'est pas activé/, `${cycle} refusé`);
          }
        }
        // Les classes du collège existantes restent intactes, même si le collège est désactivé.
        assert.equal((await q("select count(*)::int n from classes where organization_id = $1", [ORG_DEMO]))[0].n, classesBefore);
        const [{ id: year }] = await q("select id from academic_years where organization_id = $1 and is_current", [ORG_DEMO]);
        const [{ id: sixieme }] = await q("select id from levels where organization_id = $1 and name = 'Sixième'", [ORG_DEMO]);
        const newClass = q("insert into classes (organization_id, academic_year_id, level_id, name) values ($1, $2, $3, 'Test 6e Z')", [ORG_DEMO, year, sixieme]);
        if (levels.includes("college")) await newClass;
        else assert.match(await rejects(newClass), /Collège/);
      });
    });
  }

  test("TEST 8 — lycée technique : séries configurables (F1…G3), matières liées au niveau et à la série", async () => {
    await as(USERS.admin, async (q) => {
      await configure(q, ["lycee"], ["technical"]);
      const series = ["F1", "F2", "F3", "F4", "EAA", "G1", "G2", "G3"];
      for (const code of series) {
        await q("insert into programs (organization_id, code, name, kind, school_cycle, track_type) values ($1, $2, $3, 'track', 'lycee', 'technical')", [ORG_DEMO, code, `Série ${code}`]);
      }
      assert.match(
        await rejects(q("insert into programs (organization_id, code, name, kind, school_cycle, track_type) values ($1, 'C', 'Série C', 'track', 'lycee', 'general')", [ORG_DEMO])),
        /général n'est pas activé/,
      );
      // Renommer, désactiver, réactiver : configuration propre à l'établissement.
      await q("update programs set name = 'F4 — Génie civil' where organization_id = $1 and code = 'F4'", [ORG_DEMO]);
      await q("update programs set is_active = false where organization_id = $1 and code = 'EAA'", [ORG_DEMO]);
      const rows = await q("select code, name, is_active from programs where organization_id = $1 and track_type = 'technical' order by code", [ORG_DEMO]);
      assert.equal(rows.length, 8);
      assert.equal(rows.find((r) => r.code === "F4").name, "F4 — Génie civil");
      assert.equal(rows.find((r) => r.code === "EAA").is_active, false);
      // Matières : une matière de F4 et une matière du primaire ne se mélangent pas.
      const [{ id: f4 }] = await q("select id from programs where organization_id = $1 and code = 'F4'", [ORG_DEMO]);
      await q("insert into subjects (organization_id, code, name, program_id, school_cycles) values ($1, 'RDM', 'Résistance des matériaux', $2, '{lycee}')", [ORG_DEMO, f4]);
      await q("insert into subjects (organization_id, code, name, school_cycles) values ($1, 'EVEIL', 'Éveil scientifique', '{primaire}')", [ORG_DEMO]);
      const [rdm] = await q("select school_cycles, program_id from subjects where organization_id = $1 and code = 'RDM'", [ORG_DEMO]);
      assert.deepEqual([rdm.school_cycles, rdm.program_id], [["lycee"], f4]);
      assert.match(await rejects(q("insert into subjects (organization_id, code, name, school_cycles) values ($1, 'X1', 'X', '{universite}')", [ORG_DEMO])), /check|violates/);
      assert.deepEqual((await q("select school_cycles from subjects where organization_id = $1 and code = 'MATH'", [ORG_DEMO]))[0]?.school_cycles ?? [], [], "matières existantes : tous les niveaux");
    });
  });

  test("TEST 9 et 13 — deux établissements, deux configurations, jamais mélangées", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ id: primaryOrg }] = await q("select public.create_organization('École Primaire Test', 'EPT1', 'ecole-primaire-test', 'primary_school') as id");
      assert.deepEqual(await levelsOf(q, primaryOrg), ["maternelle", "primaire"], "école primaire : maternelle + primaire par défaut");
      await q("select public.platform_add_org_admin($1, $2)", [primaryOrg, USERS.otherOrgAdmin]);
      await switchTo(q, USERS.otherOrgAdmin);
      await configure(q, ["primaire"], [], primaryOrg);
      assert.match(await rejects(configure(q, ["lycee"], ["technical"], ORG_DEMO)), /settings\.manage/, "B ne configure pas A");
      assert.equal((await q("select id from organizations where id = $1", [ORG_DEMO])).length, 0, "B ne lit pas la configuration de A");
      assert.equal((await q("select id from levels where organization_id = $1", [ORG_DEMO])).length, 0);
      await switchTo(q, USERS.admin);
      await configure(q, ["college", "lycee"], ["general", "technical"]);
      assert.equal((await q("select id from organizations where id = $1", [primaryOrg])).length, 0, "A ne lit pas la configuration de B");
      await switchTo(q, null);
      assert.deepEqual(await levelsOf(q, primaryOrg), ["primaire"]);
      assert.deepEqual(await levelsOf(q, ORG_DEMO), ["college", "lycee"]);
    });
  });

  test("TEST 12 — permissions : seule la direction (settings.manage) choisit les niveaux ; valeurs toujours valides", async () => {
    await as(USERS.teacher, async (q) => {
      assert.match(await rejects(configure(q, ["primaire"])), /settings\.manage/);
    });
    await as(USERS.accountant, async (q) => {
      assert.match(await rejects(configure(q, ["primaire"])), /settings\.manage/);
    });
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(configure(q, [])), /au moins un niveau/);
      assert.match(await rejects(configure(q, ["lycee"], [])), /général, technique/);
      assert.match(await rejects(configure(q, ["universite"])), /inconnu/);
      // Même en écrivant directement les réglages, la configuration reste valide.
      assert.match(
        await rejects(q(`update organizations set settings = jsonb_set(settings, '{school,levels}', '[]') where id = $1`, [ORG_DEMO])),
        /Module Scolaire invalide/,
      );
      const [{ n }] = await q("select count(*)::int n from audit_logs where action = 'settings.school_levels' and organization_id = $1", [ORG_DEMO]);
      await configure(q, ["primaire", "college"]);
      assert.equal((await q("select count(*)::int n from audit_logs where action = 'settings.school_levels' and organization_id = $1", [ORG_DEMO]))[0].n, n + 1, "changement tracé");
    });
    await as(USERS.otherOrgAdmin, async (q) => {
      assert.match(await rejects(configure(q, ["primaire"], [], ORG_DEMOF)), /ne s'applique pas/, "centre de formation : refusé");
    });
  });

  test("abonnement : Module Scolaire par défaut pour les écoles ; ancienne formule renouvelable au même prix", async () => {
    await as(USERS.superadmin, async (q) => {
      for (const type of ["primary_school", "middle_school", "high_school", "school_complex"]) {
        const [{ id }] = await q("select public.create_organization($1, $2, $3, $4) as id", [`Test ${type}`, `T${type.slice(0, 4).toUpperCase()}`, `test-${type.replace("_", "-")}`, type]);
        const [s] = await q("select p.code, s.monthly_price from subscriptions s join subscription_plans p on p.id = s.plan_id where s.organization_id = $1", [id]);
        assert.deepEqual([s.code, s.monthly_price], ["MODULE_SCOLAIRE", 15000], type);
      }
      // Établissement déjà abonné à Maternelle & Primaire (8 000) : sa facture de renouvellement reste possible et au même prix.
      await switchTo(q, null);
      await q(
        `update subscriptions s set plan_id = p.id, monthly_price = 8000, annual_price = 67200, status = 'ACTIVE', is_demo = false,
                current_period_start = now() - interval '25 days', current_period_end = now() + interval '5 days', trial_start = null, trial_end = null
           from subscription_plans p where p.code = 'MATERNELLE_PRIMAIRE' and s.organization_id = $1`,
        [ORG_DEMO],
      );
      await switchTo(q, USERS.superadmin);
      const [{ id: inv }] = await q("select public.platform_issue_invoice($1, 'MATERNELLE_PRIMAIRE', 'MONTHLY') id", [ORG_DEMO]);
      assert.equal((await q("select amount from subscription_invoices where id = $1", [inv]))[0].amount, 8000);
      assert.match(await rejects(q("select public.platform_issue_invoice($1, 'MATERNELLE_PRIMAIRE', 'MONTHLY')", [ORG_DEMOF])), /indisponible/, "nouvelle souscription impossible");
    });
  });
});
