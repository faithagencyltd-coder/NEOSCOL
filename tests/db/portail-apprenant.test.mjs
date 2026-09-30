// Portail apprenant : fiche de l'établissement, classe / formation et historique
// scolaire de TOUTES les années, strictement bornés au dossier du compte.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const myStudent = async (q) => (await q("select (app.my_portal_student_ids())[1] as id"))[0].id;

describe("Portail : dossier scolaire", () => {
  test("élève : établissement, classe, années d'inscription, résultats annuels VALIDÉS seulement, années importées", async () => {
    await as(null, async (q) => {
      const [{ id: studentId }] = await q("select id from students where user_id = $1", [USERS.student]);
      const [{ year, klass }] = await q(
        "select e.academic_year_id as year, e.class_id as klass from enrollments e where e.student_id = $1 and e.status = 'validated' limit 1",
        [studentId],
      );
      await q(
        `insert into annual_results (organization_id, student_id, class_id, academic_year_id, rules_snapshot, inputs, average, rank, decision_label, status)
         values ($1, $2, $3, $4, '{}', '{}', 13.5, 4, 'Admis(e) en classe supérieure', 'draft')`,
        [ORG_DEMO, studentId, klass, year],
      );
      await q("insert into student_history (organization_id, student_id, year_label, class_name, average, decision) values ($1, $2, '2024-2025', 'CM2', 14.2, 'Admis')", [ORG_DEMO, studentId]);

      await switchTo(q, USERS.student);
      assert.equal(await myStudent(q), studentId);
      let [{ r }] = await q("select public.portal_school_record($1) as r", [studentId]);
      assert.equal(r.organization.name.length > 0, true);
      assert.ok(r.organization.current_year, "année en cours");
      assert.equal(r.years[0].class.length > 0, true, "classe de l'année");
      assert.equal(r.years[0].result, null, "résultat en brouillon : jamais montré");
      assert.deepEqual(r.history.map((h) => [h.year_label, h.class]), [["2024-2025", "CM2"]]);

      await switchTo(q, null);
      await q("update annual_results set status = 'validated' where student_id = $1", [studentId]);
      await switchTo(q, USERS.student);
      [{ r }] = await q("select public.portal_school_record($1) as r", [studentId]);
      assert.equal(Number(r.years[0].result.average), 13.5);
      assert.equal(r.years[0].result.decision, "Admis(e) en classe supérieure");
    });
  });

  test("parent : dossier de son enfant ; autres comptes : refus", async () => {
    await as(null, async (q) => {
      const [{ id: studentId }] = await q("select id from students where user_id = $1", [USERS.student]);
      await switchTo(q, USERS.parent);
      const children = (await q("select app.my_portal_student_ids() as ids"))[0].ids;
      const [{ r }] = await q("select public.portal_school_record($1) as r", [children[0]]);
      assert.ok(r.student.matricule);
      if (!children.includes(studentId)) {
        assert.match(await rejects(q("select public.portal_school_record($1)", [studentId])), /Dossier introuvable/);
      }
      for (const user of [USERS.teacher, USERS.otherOrgAdmin, USERS.teacher2]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select public.portal_school_record($1)", [studentId])), /Dossier introuvable/);
      }
      await switchTo(q, "anon");
    });
  });
});
