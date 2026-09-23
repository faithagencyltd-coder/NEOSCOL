// Pédagogie : appel, saisie des notes, calcul et publication des bulletins.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, badgeToken, lessonNow, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

async function classInfo(q, name) {
  const [klass] = await q("select id from classes where name = $1", [name]);
  const students = await q(
    "select student_id from enrollments where class_id = $1 and status = 'validated' order by student_id",
    [klass.id],
  );
  return { id: klass.id, students: students.map((s) => s.student_id) };
}

describe("Appel", () => {
  test("chaîne complète : cours verrouillé → scan du badge → appel → validation → famille notifiée", async () => {
    await as(null, async (q) => {
      const lesson = await lessonNow(q, { teacherUser: USERS.teacher, className: "6e A", subjectCode: "MATH" });
      const token = await badgeToken(q, USERS.teacher);
      const cls = await classInfo(q, "6e A");
      const [kofi] = await q("select id from students where first_name = 'Kofi' and last_name = 'BAMBA'");
      const records = cls.students.map((id) => ({ student_id: id, status: id === kofi.id ? "absent" : "present" }));

      await switchTo(q, USERS.teacher);
      const [before] = await q("select status from my_lessons($1, $1) where slot_id = $2", [lesson.today, lesson.slotId]);
      assert.equal(before.status, "pending", "En attente tant que le badge n'est pas scanné");
      assert.match(
        await rejects(q("select take_lesson_attendance($1, $2, $3)", [lesson.slotId, lesson.today, JSON.stringify(records)])),
        /Cours verrouillé/,
      );
      // Le professeur ne peut pas pointer lui-même (pas d'appel depuis chez lui).
      assert.match(await rejects(q("select scan_staff_badge($1, $2)", [ORG_DEMO, token])), /pas autorisée/);

      await switchTo(q, USERS.kiosk);
      const [{ scan_staff_badge: scan }] = await q("select scan_staff_badge($1, $2, 'test')", [ORG_DEMO, `NEOSCOL-BADGE:${token}`]);
      assert.equal(scan.result, "accepted");
      assert.equal(scan.kind, "arrival");
      assert.ok(scan.lesson, "le cours en cours est débloqué");
      assert.equal(scan.lesson.class, "6e A");

      await switchTo(q, USERS.teacher);
      const [unlocked] = await q("select status from my_lessons($1, $1) where slot_id = $2", [lesson.today, lesson.slotId]);
      assert.equal(unlocked.status, "unlocked", "Appel disponible");
      const [{ take_lesson_attendance: session }] = await q("select take_lesson_attendance($1, $2, $3)", [
        lesson.slotId, lesson.today, JSON.stringify(records),
      ]);
      await switchTo(q, USERS.parent);
      assert.equal((await q("select id from attendance_records where session_id = $1", [session])).length, 0, "brouillon invisible des familles");

      await switchTo(q, USERS.teacher);
      // Correction avant validation puis validation.
      await q("select take_lesson_attendance($1, $2, $3, true)", [
        lesson.slotId, lesson.today,
        JSON.stringify([{ student_id: kofi.id, status: "absent", comment: "Aucune nouvelle" }]),
      ]);
      const [validated] = await q("select status, validated_by from attendance_sessions where id = $1", [session]);
      assert.deepEqual(validated, { status: "validated", validated_by: USERS.teacher });
      assert.match(
        await rejects(q("select take_lesson_attendance($1, $2, $3)", [lesson.slotId, lesson.today, JSON.stringify(records)])),
        /validé/,
      );
      assert.match(
        await rejects(q("update attendance_records set status = 'present' where session_id = $1", [session])),
        /validé/,
      );

      await switchTo(q, USERS.parent);
      const visible = await q("select status from attendance_records where session_id = $1", [session]);
      assert.deepEqual(visible.map((r) => r.status), ["absent"]);
      const notes = await q("select body from notifications where type = 'attendance.absent' and data->>'attendance_record_id' is not null order by created_at desc limit 1");
      assert.match(notes[0].body, /Mathématiques/);

      // L'administration peut corriger un appel validé (audité).
      await switchTo(q, USERS.admin);
      await q("update attendance_records set status = 'late', minutes_late = 5 where session_id = $1 and student_id = $2", [session, kofi.id]);
      const audit = await q("select actor_role from audit_logs where entity_type = 'attendance_records' and action = 'attendance_records.update' order by id desc limit 1");
      assert.match(audit[0].actor_role, /Administrateur/);
    });
  });

  test("le déverrouillage ne vaut que pour le cours et l'enseignant concernés", async () => {
    await as(null, async (q) => {
      const lesson = await lessonNow(q, { teacherUser: USERS.teacher, className: "6e A", subjectCode: "MATH" });
      await switchTo(q, USERS.kiosk);
      await q("select scan_staff_badge($1, $2)", [ORG_DEMO, await (async () => {
        await switchTo(q, null);
        const token = await badgeToken(q, USERS.teacher);
        await switchTo(q, USERS.kiosk);
        return token;
      })()]);
      // Une autre enseignante ne peut pas faire l'appel de ce cours.
      await switchTo(q, USERS.teacher2);
      assert.match(
        await rejects(q("select take_lesson_attendance($1, $2, '[]')", [lesson.slotId, lesson.today])),
        /row-level security|pas affecté/,
      );
      // Pas d'appel pour une autre date que celle du cours.
      await switchTo(q, USERS.teacher);
      assert.match(
        await rejects(q("select take_lesson_attendance($1, $2::date - 7, '[]')", [lesson.slotId, lesson.today])),
        /jour du cours/,
      );
      // L'appel libre (hors emploi du temps) est refusé à l'enseignant.
      assert.match(
        await rejects(q("select record_attendance($1, $2, '07:00', '07:30', null, '[]')", [lesson.classId, lesson.today])),
        /emploi du temps/,
      );
    });
  });

  test("appel libre par l'administration : la justification est conservée", async () => {
    await as(null, async (q) => {
      const cls = await classInfo(q, "6e A");
      const target = cls.students[0];
      await switchTo(q, USERS.admin);
      const [{ record_attendance: session }] = await q(
        "select record_attendance($1, current_date, '16:00', '17:00', null, $2)",
        [cls.id, JSON.stringify([{ student_id: target, status: "absent" }])],
      );
      await switchTo(q, USERS.secretary);
      await q(
        "update attendance_records set is_justified = true, justification = 'Certificat médical' where session_id = $1",
        [session],
      );
      await switchTo(q, USERS.admin);
      await q("select record_attendance($1, current_date, '16:00', '17:00', null, $2)", [
        cls.id,
        JSON.stringify([{ student_id: target, status: "late", minutes_late: 10 }]),
      ]);
      const [row] = await q("select status, minutes_late, is_justified, justification from attendance_records where session_id = $1", [session]);
      assert.deepEqual(row, { status: "late", minutes_late: 10, is_justified: true, justification: "Certificat médical" });
      await q("select validate_attendance_session($1)", [session]);
      const [s] = await q("select status from attendance_sessions where id = $1", [session]);
      assert.equal(s.status, "validated");
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

  test("justification : dépôt par le parent → correction demandée → acceptation par l'administration", async () => {
    await as(null, async (q) => {
      const cls = await classInfo(q, "6e A");
      const [kofi] = await q("select id from students where first_name = 'Kofi' and last_name = 'BAMBA'");
      await switchTo(q, USERS.admin);
      const [{ record_attendance: session }] = await q(
        "select record_attendance($1, current_date, '13:00', '14:00', null, $2)",
        [cls.id, JSON.stringify(cls.students.map((id) => ({ student_id: id, status: id === kofi.id ? "absent" : "present" })))],
      );
      await q("select validate_attendance_session($1)", [session]);
      const record = { student_id: kofi.id, session_date: (await q("select current_date as d"))[0].d };
      const submitter = USERS.parent;
      await switchTo(q, submitter);
      const [{ submit_absence_justification: id }] = await q(
        "select submit_absence_justification($1, $2, $2, 'Rendez-vous médical')",
        [record.student_id, record.session_date],
      );
      // Un parent ne peut pas justifier pour un élève qui n'est pas son enfant.
      const stranger = cls.students.find((id) => id !== kofi.id);
      assert.match(
        await rejects(q("select submit_absence_justification($1, current_date, current_date, 'Tentative')", [stranger])),
        /ne pouvez pas justifier/,
      );
      await switchTo(q, USERS.secretary);
      const [pending] = await q("select status, submitted_via from absence_justifications where id = $1", [id]);
      assert.deepEqual(pending, { status: "pending", submitted_via: "portal" });
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select review_absence_justification($1, 'accepted')", [id])), /attendance\.justify/);
      await switchTo(q, USERS.secretary);
      assert.match(await rejects(q("select review_absence_justification($1, 'rejected')", [id])), /commentaire est obligatoire/);
      await q("select review_absence_justification($1, 'correction_requested', 'Merci de joindre le certificat')", [id]);
      await switchTo(q, submitter);
      await q("select submit_absence_justification($1, $2, $2, 'Rendez-vous médical (certificat joint)', null, $3)", [
        record.student_id, record.session_date, id,
      ]);
      await switchTo(q, USERS.secretary);
      const [{ review_absence_justification: justified }] = await q("select review_absence_justification($1, 'accepted')", [id]);
      assert.ok(justified >= 1);
      const [row] = await q(
        `select r.status, r.is_justified from attendance_records r join attendance_sessions s on s.id = r.session_id
         where r.student_id = $1 and s.session_date = $2 limit 1`,
        [record.student_id, record.session_date],
      );
      assert.deepEqual(row, { status: "excused", is_justified: true });
      await switchTo(q, USERS.teacher);
      const seen = await q("select status from absence_justifications where id = $1", [id]);
      assert.deepEqual(seen, [{ status: "accepted" }], "l'enseignant voit le statut sans pouvoir le modifier");
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
      await switchTo(q, null);
      await q("update organizations set settings = jsonb_set(settings, '{portal_restrictions,enabled}', 'false') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.parent);
      const visible = await q("select id from report_cards");
      assert.equal(visible.length, 1, "le parent voit le bulletin publié de Kofi (Aya est en 5e A)");
    });
  });
});
