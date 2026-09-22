// Pédagogie : appel, saisie des notes, calcul et publication des bulletins.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool, rejects, USERS } from "./helpers.mjs";

after(() => pool.end());

const switchTo = async (q, user) => {
  await q("set local role authenticated");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
};

async function classInfo(q, name) {
  const [klass] = await q("select id from classes where name = $1", [name]);
  const students = await q(
    "select student_id from enrollments where class_id = $1 and status = 'validated' order by student_id",
    [klass.id],
  );
  return { id: klass.id, students: students.map((s) => s.student_id) };
}

describe("Appel", () => {
  test("l'enseignant fait l'appel de sa classe ; la famille est notifiée de l'absence", async () => {
    await as(null, async (q) => {
      const cls = await classInfo(q, "6e A");
      const [kofi] = await q("select id from students where first_name = 'Kofi' and last_name = 'BAMBA'");
      await switchTo(q, USERS.teacher);
      const records = cls.students.map((id) => ({ student_id: id, status: id === kofi.id ? "absent" : "present" }));
      const [{ record_attendance: session }] = await q(
        "select record_attendance($1, current_date, '14:00', '16:00', null, $2)",
        [cls.id, JSON.stringify(records)],
      );
      const rows = await q("select status from attendance_records where session_id = $1", [session]);
      assert.equal(rows.length, cls.students.length);
      await switchTo(q, USERS.parent);
      const notes = await q("select title from notifications where type = 'attendance.absent'");
      assert.ok(notes.length >= 1);
    });
  });

  test("impossible de faire l'appel d'une classe non affectée", async () => {
    await as(USERS.teacher, async (q) => {
      const [klass] = await q("select id from classes where name = '5e A'");
      assert.match(
        await rejects(q("select record_attendance($1, current_date, '14:00', '16:00', null, '[]')", [klass.id])),
        /row-level security/,
      );
    });
  });

  test("refaire l'appel ne supprime pas une justification", async () => {
    await as(null, async (q) => {
      const cls = await classInfo(q, "6e A");
      const target = cls.students[0];
      await switchTo(q, USERS.teacher);
      const [{ record_attendance: session }] = await q(
        "select record_attendance($1, current_date, '16:00', '17:00', null, $2)",
        [cls.id, JSON.stringify([{ student_id: target, status: "absent" }])],
      );
      await switchTo(q, USERS.secretary);
      await q(
        "update attendance_records set is_justified = true, justification = 'Certificat médical' where session_id = $1",
        [session],
      );
      await switchTo(q, USERS.teacher);
      await q("select record_attendance($1, current_date, '16:00', '17:00', null, $2)", [
        cls.id,
        JSON.stringify([{ student_id: target, status: "late", minutes_late: 10 }]),
      ]);
      const [row] = await q("select status, minutes_late, is_justified, justification from attendance_records where session_id = $1", [session]);
      assert.deepEqual(row, { status: "late", minutes_late: 10, is_justified: true, justification: "Certificat médical" });
    });
  });

  test("un enseignant ne peut pas justifier une absence", async () => {
    await as(USERS.teacher, async (q) => {
      const [record] = await q("select id from attendance_records where status = 'absent' limit 1");
      assert.match(
        await rejects(q("update attendance_records set is_justified = true where id = $1", [record.id])),
        /attendance\.justify/,
      );
    });
  });
});

describe("Saisie des notes", () => {
  test("l'enseignant saisit les notes de sa matière ; effacer une note la supprime", async () => {
    await as(USERS.teacher, async (q) => {
      const [assessment] = await q(
        `select a.id from assessments a join subjects s on s.id = a.subject_id
         join classes c on c.id = a.class_id where s.code = 'MATH' and c.name = '6e A' limit 1`,
      );
      const students = await q("select student_id from grades where assessment_id = $1 order by student_id limit 2", [assessment.id]);
      const [a, b] = students.map((s) => s.student_id);
      const [{ save_grades: saved }] = await q("select save_grades($1, $2)", [
        assessment.id,
        JSON.stringify([
          { student_id: a, score: "17.5" },
          { student_id: b, score: "", is_absent: false },
        ]),
      ]);
      assert.equal(saved, 1);
      const rows = await q("select student_id, score from grades where assessment_id = $1 and student_id = any($2)", [assessment.id, [a, b]]);
      assert.deepEqual(rows.map((r) => [r.student_id, Number(r.score)]), [[a, 17.5]]);
      assert.match(
        await rejects(q("select save_grades($1, $2)", [assessment.id, JSON.stringify([{ student_id: a, score: 25 }])])),
        /dépasse le barème/,
      );
    });
  });

  test("une enseignante ne peut pas noter une matière qu'elle n'enseigne pas", async () => {
    await as(USERS.teacher2, async (q) => {
      const [assessment] = await q(
        `select a.id, g.student_id from assessments a join subjects s on s.id = a.subject_id
         join grades g on g.assessment_id = a.id where s.code = 'MATH' limit 1`,
      );
      assert.match(
        await rejects(q("select save_grades($1, $2)", [assessment.id, JSON.stringify([{ student_id: assessment.student_id, score: 20 }])])),
        /row-level security/,
      );
    });
  });
});

describe("Bulletins", () => {
  test("calcul : moyenne générale pondérée et rang", async () => {
    await as(USERS.director, async (q) => {
      const [klass] = await q("select id from classes where name = '6e A'");
      const [period] = await q("select id from academic_periods where name = '1er trimestre'");
      const [{ compute_report_cards: count }] = await q("select compute_report_cards($1, $2)", [klass.id, period.id]);
      assert.equal(count, 6);
      const [kofi] = await q(
        `select rc.student_id, rc.average, rc.rank, rc.class_size, rc.data from report_cards rc
         join students s on s.id = rc.student_id where s.first_name = 'Kofi' and s.last_name = 'BAMBA'`,
      );
      // Recalcul indépendant en JavaScript à partir des notes brutes.
      const grades = await q(
        `select s.name as subject, cs.coefficient as subject_coef, a.coefficient as coef, a.max_score, g.score
         from grades g join assessments a on a.id = g.assessment_id
         join class_subjects cs on cs.id = a.class_subject_id join subjects s on s.id = a.subject_id
         where g.student_id = $1 and a.class_id = $2 and a.academic_period_id = $3 and g.score is not null`,
        [kofi.student_id, klass.id, period.id],
      );
      const bySubject = new Map();
      for (const g of grades) {
        const entry = bySubject.get(g.subject) ?? { sum: 0, weight: 0, coef: Number(g.subject_coef) };
        entry.sum += (Number(g.score) / Number(g.max_score)) * 20 * Number(g.coef);
        entry.weight += Number(g.coef);
        bySubject.set(g.subject, entry);
      }
      let total = 0;
      let weights = 0;
      for (const entry of bySubject.values()) {
        total += (entry.sum / entry.weight) * entry.coef;
        weights += entry.coef;
      }
      assert.equal(Number(kofi.average), Math.round((total / weights) * 100) / 100);
      assert.equal(kofi.class_size, 6);
      assert.ok(kofi.rank >= 1 && kofi.rank <= 6);
      const maths = kofi.data.subjects.find((s) => s.subject === "Mathématiques");
      const m = bySubject.get("Mathématiques");
      assert.equal(maths.average, Math.round((m.sum / m.weight) * 100) / 100);
      assert.equal(maths.coefficient, 4);
      const ranks = (await q("select rank from report_cards where class_id = $1 order by rank", [klass.id])).map((r) => r.rank);
      assert.equal(ranks[0], 1);
    });
  });

  test("seuls les profils autorisés calculent et publient", async () => {
    await as(null, async (q) => {
      const [klass] = await q("select id from classes where name = '6e A'");
      const [period] = await q("select id from academic_periods where name = '1er trimestre'");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select compute_report_cards($1, $2)", [klass.id, period.id])), /grades\.read/);
      await switchTo(q, USERS.director);
      await q("select compute_report_cards($1, $2)", [klass.id, period.id]);
      // Le secrétariat n'a pas report_cards.manage : aucune ligne modifiable.
      await switchTo(q, USERS.secretary);
      const updated = await q("update report_cards set status = 'published' where class_id = $1 returning id", [klass.id]);
      assert.equal(updated.length, 0);
      await switchTo(q, USERS.director);
      const published = await q("update report_cards set status = 'published' where class_id = $1 returning published_by", [klass.id]);
      assert.equal(published.length, 6);
      assert.equal(published[0].published_by, USERS.director);
      await switchTo(q, USERS.parent);
      const visible = await q("select id from report_cards");
      assert.equal(visible.length, 1, "le parent voit le bulletin publié de Kofi (Aya est en 5e A)");
    });
  });
});
