// P7e — Passage d'année : préparation de N+1 (idempotente), propositions selon
// les décisions annuelles, réinscriptions groupées, clôture (périodes
// verrouillées, année suivante en cours, fin de cycle), archive, droits.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

/** Décisions annuelles (contexte système) : premier élève de chaque classe citée. */
async function decide(q, decisions) {
  const out = {};
  for (const [className, code] of Object.entries(decisions)) {
    const [row] = await q(
      `select e.student_id, c.id as class_id, c.academic_year_id from enrollments e join classes c on c.id = e.class_id
        join academic_years y on y.id = c.academic_year_id and y.is_current
       where c.organization_id = $1 and c.name = $2 and e.status = 'validated'
       order by e.student_id limit 1`,
      [ORG_DEMO, className],
    );
    await q(
      `insert into annual_results (organization_id, student_id, class_id, academic_year_id, rules_snapshot, inputs, average, decision_code, decision_label)
       values ($1, $2, $3, $4, '{}', '{}', 12, $5, $5)`,
      [ORG_DEMO, row.student_id, row.class_id, row.academic_year_id, code],
    );
    out[className] = row.student_id;
  }
  return out;
}

describe("Préparer l'année suivante", () => {
  test("année, périodes, classes, matières et tarifs copiés ; idempotent ; droits", async () => {
    await as(USERS.admin, async (q) => {
      const [{ r }] = await q("select prepare_next_academic_year($1) as r", [ORG_DEMO]);
      assert.equal(r.year_name, "2027-2028");
      assert.equal(r.created_year, true);
      const [cur] = await q("select id from academic_years where organization_id = $1 and is_current", [ORG_DEMO]);
      const [{ n: curClasses }] = await q("select count(*)::int as n from classes where academic_year_id = $1 and kind = 'class' and archived_at is null", [cur.id]);
      assert.equal(r.classes, curClasses);
      const [y] = await q("select status, is_current, starts_on::text from academic_years where id = $1", [r.year_id]);
      assert.deepEqual(y, { status: "planned", is_current: false, starts_on: "2027-09-07" });
      const [{ a, b }] = await q(
        `select (select count(*)::int from class_subjects cs join classes c on c.id = cs.class_id where c.academic_year_id = $1) as a,
                (select count(*)::int from class_subjects cs join classes c on c.id = cs.class_id where c.academic_year_id = $2 and c.kind = 'class' and c.archived_at is null) as b`,
        [r.year_id, cur.id],
      );
      assert.equal(a, b, "matières (coefficients, enseignants) copiées");
      const [{ r: again }] = await q("select prepare_next_academic_year($1) as r", [ORG_DEMO]);
      assert.deepEqual([again.created_year, again.classes, again.periods, again.rates], [false, 0, 0, 0], "rien n'est dupliqué");

      for (const user of [USERS.teacher, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select prepare_next_academic_year($1)", [ORG_DEMO])), /Permission refusée/);
      }
    });
  });
});

describe("Propositions, réinscriptions et clôture", () => {
  test("propositions selon la décision annuelle ; réinscriptions en attente, sans doublon", async () => {
    await as(null, async (q) => {
      const ids = await decide(q, { "6e A": "promoted", "6e B": "repeat", "5e A": "excluded", "3e A": "promoted" });
      const [foreign] = await q("select id from students where organization_id = $1 limit 1", [ORG_DEMOF]);
      await switchTo(q, USERS.admin);
      await q("select prepare_next_academic_year($1)", [ORG_DEMO]);
      const props = await q("select p.*, (select name from classes where id = p.target_class_id) as target from year_transition_proposals($1) p", [ORG_DEMO]);
      const by = Object.fromEntries(props.map((p) => [p.student_id, p]));
      assert.deepEqual([by[ids["6e A"]].action, by[ids["6e A"]].target], ["promote", "5e A"], "6e A admis → 5e A");
      assert.deepEqual([by[ids["6e B"]].action, by[ids["6e B"]].target], ["repeat", "6e B"], "redoublement : même classe");
      assert.deepEqual([by[ids["5e A"]].action, by[ids["5e A"]].target], ["leave", null], "exclu : pas de classe");
      assert.deepEqual([by[ids["3e A"]].action, by[ids["3e A"]].target], ["graduate", null], "dernier niveau : fin de cycle");
      assert.ok(props.filter((p) => p.action === "undecided" && p.from_class.startsWith("6e")).every((p) => p.target_class_id), "sans décision : classe du niveau suivant suggérée");

      const [{ id: nextYear }] = await q("select id from academic_years where organization_id = $1 and name = '2027-2028'", [ORG_DEMO]);
      const [cur6A] = await q("select c.id from classes c join academic_years y on y.id = c.academic_year_id and y.is_current where c.organization_id = $1 and c.name = '6e A'", [ORG_DEMO]);
      const items = [
        { student_id: ids["6e A"], class_id: by[ids["6e A"]].target_class_id },
        { student_id: ids["6e B"], class_id: by[ids["6e B"]].target_class_id },
        { student_id: ids["5e A"], class_id: cur6A.id },
        { student_id: foreign.id, class_id: by[ids["6e A"]].target_class_id },
      ];
      const [{ r }] = await q("select create_reenrollments($1, $2::jsonb) as r", [ORG_DEMO, JSON.stringify(items)]);
      assert.equal(r.created, 2);
      assert.equal(r.skipped.length, 2, "classe hors N+1 et élève d'un autre établissement ignorés");
      const created = await q("select type, status, academic_year_id from enrollments where student_id = any($1) and academic_year_id = $2", [[ids["6e A"], ids["6e B"]], nextYear]);
      assert.ok(created.every((e) => e.type === "reenrollment" && e.status === "pending"));
      const [{ r: twice }] = await q("select create_reenrollments($1, $2::jsonb) as r", [ORG_DEMO, JSON.stringify(items.slice(0, 1))]);
      assert.equal(twice.created, 0, "pas de double réinscription");
      assert.match(twice.skipped[0].reason, /Déjà inscrit/);
      assert.ok((await q("select next_enrollment from year_transition_proposals($1) where student_id = $2", [ORG_DEMO, ids["6e A"]]))[0].next_enrollment);

      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select create_reenrollments($1, '[]'::jsonb)", [ORG_DEMO])), /Permission refusée/);
      assert.match(await rejects(q("select * from year_transition_proposals($1)", [ORG_DEMO])), /Permission refusée/);
    });
  });

  test("clôture : année suivante exigée, périodes verrouillées, fin de cycle → ancien élève, rien supprimé", async () => {
    await as(null, async (q) => {
      const ids = await decide(q, { "3e A": "promoted" });
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select close_academic_year($1)", [ORG_DEMO])), /Préparez d'abord/);
      await q("select prepare_next_academic_year($1)", [ORG_DEMO]);
      const [cur] = await q("select id, name from academic_years where organization_id = $1 and is_current", [ORG_DEMO]);
      const [{ n: before }] = await q("select count(*)::int as n from enrollments where academic_year_id = $1", [cur.id]);
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select close_academic_year($1)", [ORG_DEMO])), /Permission refusée/);
      await switchTo(q, USERS.admin);
      const [{ r }] = await q("select close_academic_year($1, true) as r", [ORG_DEMO]);
      assert.equal(r.current, "2027-2028");
      assert.ok(r.graduates >= 1);
      const years = await q("select name, status, is_current from academic_years where organization_id = $1 order by starts_on", [ORG_DEMO]);
      assert.deepEqual(years.slice(-2), [
        { name: cur.name, status: "closed", is_current: false },
        { name: "2027-2028", status: "active", is_current: true },
      ]);
      const [{ unlocked }] = await q("select count(*)::int as unlocked from academic_periods where academic_year_id = $1 and not is_locked", [cur.id]);
      assert.equal(unlocked, 0, "notes et présences de l'année close verrouillées");
      assert.equal((await q("select status from students where id = $1", [ids["3e A"]]))[0].status, "alumni");
      const [{ n: afterCount }] = await q("select count(*)::int as n from enrollments where academic_year_id = $1", [cur.id]);
      assert.equal(afterCount, before, "inscriptions de l'année close conservées");
      const archive = await q("select * from academic_year_archive($1, $2)", [ORG_DEMO, cur.id]);
      assert.ok(archive.length > 0 && archive.some((a) => a.average !== null), "archive lisible après clôture");
      const audit = await q("select action from audit_logs where action = 'academic.year_closed'");
      assert.equal(audit.length, 1);

      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select * from academic_year_archive($1, $2)", [ORG_DEMO, cur.id])), /Permission refusée/);
      assert.match(await rejects(q("select * from academic_year_archive($1, $2)", [ORG_DEMOF, cur.id])), /introuvable/);
    });
  });
});
