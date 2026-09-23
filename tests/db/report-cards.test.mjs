// Notes validées/verrouillées, bulletin configurable, recalcul automatique, aperçu.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

async function mathsAssessment(q) {
  const [row] = await q(
    `select a.id, a.class_id, a.academic_period_id from assessments a join subjects s on s.id = a.subject_id
     join classes c on c.id = a.class_id where s.code = 'MATH' and c.name = '6e A' order by a.assessed_on limit 1`,
  );
  return row;
}

describe("Validation des notes", () => {
  test("brouillon → validé → verrouillé ; seule l'administration rouvre", async () => {
    await as(null, async (q) => {
      const assessment = await mathsAssessment(q);
      const [grade] = await q("select student_id from grades where assessment_id = $1 limit 1", [assessment.id]);
      await switchTo(q, USERS.teacher);
      await q("update assessments set grades_status = 'validated' where id = $1", [assessment.id]);
      const [validated] = await q("select grades_status, grades_validated_by from assessments where id = $1", [assessment.id]);
      assert.deepEqual(validated, { grades_status: "validated", grades_validated_by: USERS.teacher });
      assert.match(
        await rejects(q("select save_grades($1, $2)", [assessment.id, JSON.stringify([{ student_id: grade.student_id, score: 12 }])])),
        /validées et verrouillées/,
      );
      assert.match(await rejects(q("update assessments set coefficient = 5 where id = $1", [assessment.id])), /verrouillés/);
      assert.match(await rejects(q("update assessments set grades_status = 'draft' where id = $1", [assessment.id])), /administration/);

      await switchTo(q, USERS.director);
      await q("update assessments set grades_status = 'draft' where id = $1", [assessment.id]);
      await switchTo(q, USERS.teacher);
      await q("select save_grades($1, $2)", [assessment.id, JSON.stringify([{ student_id: grade.student_id, score: 12 }])]);
      await switchTo(q, USERS.admin);
      const [history] = await q("select count(*)::int as n from audit_logs where entity_type = 'grades' and entity_id is not null");
      assert.ok(history.n > 0, "historique des notes dans le journal d'audit");
    });
  });

  test("sans verrouillage configuré, l'enseignant peut corriger une note validée", async () => {
    await as(null, async (q) => {
      const assessment = await mathsAssessment(q);
      const [grade] = await q("select student_id from grades where assessment_id = $1 limit 1", [assessment.id]);
      await q("update organizations set settings = jsonb_set(settings, '{grading,lock_after_validation}', 'false') where id = $1", [ORG_DEMO]);
      await q("update assessments set grades_status = 'validated' where id = $1", [assessment.id]);
      await switchTo(q, USERS.teacher);
      await q("select save_grades($1, $2)", [assessment.id, JSON.stringify([{ student_id: grade.student_id, score: 11 }])]);
    });
  });
});

describe("Bulletin configurable", () => {
  test("mode « colonnes » : moyennes par colonne pondérées, ordre des matières, mentions", async () => {
    await as(null, async (q) => {
      const assessment = await mathsAssessment(q);
      await switchTo(q, USERS.director);
      await q(
        `update report_card_settings set config = config
           || '{"calculation":"columns","columns":[{"key":"interro1","label":"INTERRO 1","kinds":["test"],"weight":1},{"key":"devoir","label":"DEVOIR","kinds":["homework"],"weight":3}]}'::jsonb
         where organization_id = $1`,
        [ORG_DEMO],
      );
      await q("update class_subjects set sort_order = -1 where class_id = $1 and subject_id = (select id from subjects where code = 'FR' and organization_id = $2)", [assessment.class_id, ORG_DEMO]);
      await q("select compute_report_cards($1, $2)", [assessment.class_id, assessment.academic_period_id]);
      const [kofi] = await q(
        `select rc.student_id, rc.data from report_cards rc join students s on s.id = rc.student_id
         where s.first_name = 'Kofi' and rc.class_id = $1`,
        [assessment.class_id],
      );
      assert.equal(kofi.data.subjects[0].subject, "Français", "ordre des matières configuré");
      assert.deepEqual(kofi.data.columns.map((c) => c.label), ["INTERRO 1", "DEVOIR"]);

      // Recalcul indépendant de la moyenne de mathématiques.
      const rows = await q(
        `select a.kind, a.coefficient, a.max_score, g.score from grades g join assessments a on a.id = g.assessment_id
         join subjects s on s.id = a.subject_id
         where g.student_id = $1 and a.class_id = $2 and a.academic_period_id = $3 and s.code = 'MATH' and g.score is not null`,
        [kofi.student_id, assessment.class_id, assessment.academic_period_id],
      );
      const colAvg = (kind) => {
        const list = rows.filter((r) => r.kind === kind);
        if (!list.length) return null;
        const sum = list.reduce((acc, r) => acc + (Number(r.score) / Number(r.max_score)) * 20 * Number(r.coefficient), 0);
        return sum / list.reduce((acc, r) => acc + Number(r.coefficient), 0);
      };
      const interro = colAvg("test");
      const devoir = colAvg("homework");
      const expected = (interro * 1 + devoir * 3) / 4;
      const maths = kofi.data.subjects.find((s) => s.subject === "Mathématiques");
      assert.equal(maths.average, Math.round(expected * 100) / 100);
      assert.equal(maths.columns.interro1, Math.round(interro * 100) / 100);
      assert.ok(typeof maths.mention === "string");
      assert.ok(kofi.data.proposed_decision);
    });
  });

  test("les moyennes se recalculent automatiquement ; un bulletin publié reste figé", async () => {
    await as(null, async (q) => {
      const assessment = await mathsAssessment(q);
      await switchTo(q, USERS.director);
      await q("select compute_report_cards($1, $2)", [assessment.class_id, assessment.academic_period_id]);
      const [target] = await q(
        "select student_id, average from report_cards where class_id = $1 and academic_period_id = $2 order by student_id limit 1",
        [assessment.class_id, assessment.academic_period_id],
      );
      const [other] = await q(
        "select student_id, average from report_cards where class_id = $1 and academic_period_id = $2 order by student_id desc limit 1",
        [assessment.class_id, assessment.academic_period_id],
      );
      await q("update report_cards set status = 'published' where student_id = $1 and class_id = $2", [other.student_id, assessment.class_id]);

      const [current] = await q("select score from grades where assessment_id = $1 and student_id = $2", [assessment.id, target.student_id]);
      const newScore = Number(current.score) >= 10 ? 0 : 20;
      await switchTo(q, USERS.teacher);
      await q("select save_grades($1, $2)", [
        assessment.id,
        JSON.stringify([{ student_id: target.student_id, score: newScore }, { student_id: other.student_id, score: 0 }]),
      ]);
      const [after] = await q("select average from report_cards where student_id = $1 and class_id = $2", [target.student_id, assessment.class_id]);
      assert.notEqual(after.average, target.average, "note modifiée → moyenne recalculée, sans action manuelle");
      const [frozen] = await q("select average from report_cards where student_id = $1 and class_id = $2", [other.student_id, assessment.class_id]);
      assert.equal(frozen.average, other.average);

      // Changement de coefficient de matière → recalcul.
      await switchTo(q, USERS.admin);
      const before = (await q("select average from report_cards where student_id = $1 and class_id = $2", [target.student_id, assessment.class_id]))[0].average;
      await q("update class_subjects set coefficient = 10 where class_id = $1 and subject_id = (select id from subjects where code = 'MATH' and organization_id = $2)", [assessment.class_id, ORG_DEMO]);
      const [changed] = await q("select average, data from report_cards where student_id = $1 and class_id = $2", [target.student_id, assessment.class_id]);
      assert.notEqual(changed.average, before);
      assert.equal(changed.data.subjects.find((s) => s.subject === "Mathématiques").coefficient, 10);
    });
  });

  test("configuration : validation serveur et droits", async () => {
    await as(USERS.director, async (q) => {
      assert.match(
        await rejects(q(`update report_card_settings set config = config || '{"columns":[{"key":"a","label":"A"},{"key":"a","label":"B"}]}'::jsonb`)),
        /double/,
      );
      assert.match(
        await rejects(q(`update report_card_settings set config = config || '{"primary_color":"bleu"}'::jsonb`)),
        /Couleur/,
      );
    });
    await as(USERS.teacher, async (q) => {
      const updated = await q(`update report_card_settings set config = config || '{"title":"X"}'::jsonb returning organization_id`);
      assert.equal(updated.length, 0, "l'enseignant ne configure pas le bulletin");
    });
  });

  test("aperçu : l'enseignant voit sa classe, pas les autres", async () => {
    await as(null, async (q) => {
      const assessment = await mathsAssessment(q);
      const [other] = await q("select id from classes where name = '5e A'");
      await switchTo(q, USERS.teacher);
      const preview = await q("select student_id, data from preview_report_cards($1, $2)", [assessment.class_id, assessment.academic_period_id]);
      assert.equal(preview.length, 6);
      assert.equal((await q("select id from report_cards where status = 'draft' and data = '{}'::jsonb")).length, 0);
      assert.match(await rejects(q("select * from preview_report_cards($1, $2)", [other.id, assessment.academic_period_id])), /non autorisé/);
    });
  });
});
