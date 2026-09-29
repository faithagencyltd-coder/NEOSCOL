// P7f — Hors ligne : pointage et appel saisis sans réseau, synchronisés à leur
// heure réelle, sans double enregistrement ; fenêtre de 72 h ; droits inchangés.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { as, badgeToken, lessonNow, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Pointage hors ligne", () => {
  test("enregistré à l'heure de capture, rejeu sans doublon, fenêtre de 72 h, tablette autorisée uniquement", async () => {
    await as(null, async (q) => {
      const token = await badgeToken(q, USERS.director);
      const [staff] = await q("select s.id from staff_members s where s.user_id = $1", [USERS.director]);
      await q("delete from staff_attendance where staff_id = $1", [staff.id]);
      const [{ at }] = await q("select (now() - interval '20 minutes') as at");
      const id = randomUUID();

      await switchTo(q, USERS.kiosk);
      const [{ r }] = await q("select sync_offline_staff_scan($1, $2, $3, $4, 'tablette') as r", [ORG_DEMO, id, `NEOSCOL-BADGE:${token}`, at]);
      assert.equal(r.result, "accepted");
      assert.equal(r.kind, "arrival");
      assert.equal(r.offline, true);
      await switchTo(q, null);
      const [att] = await q("select arrived_at from staff_attendance where staff_id = $1", [staff.id]);
      assert.equal(att.arrived_at.getTime(), at.getTime(), "arrivée à l'heure réelle du scan, pas à l'heure de synchronisation");
      const [scan] = await q("select scanned_at, captured_offline from badge_scans where staff_id = $1 order by scanned_at desc limit 1", [staff.id]);
      assert.deepEqual([scan.scanned_at.getTime(), scan.captured_offline], [at.getTime(), true]);

      // Rejeu (réseau coupé pendant la réponse) : même résultat, aucun second pointage.
      await switchTo(q, USERS.kiosk);
      const [{ r: again }] = await q("select sync_offline_staff_scan($1, $2, $3, $4) as r", [ORG_DEMO, id, `NEOSCOL-BADGE:${token}`, at]);
      assert.equal(again.duplicate, true);
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int as n from staff_attendance where staff_id = $1", [staff.id]))[0].n, 1);

      await switchTo(q, USERS.kiosk);
      assert.match(await rejects(q("select sync_offline_staff_scan($1, $2, $3, now() - interval '4 days')", [ORG_DEMO, randomUUID(), token])), /plus de 72 h/);
      assert.match(await rejects(q("select sync_offline_staff_scan($1, $2, $3, now() + interval '1 hour')", [ORG_DEMO, randomUUID(), token])), /futur/);
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select sync_offline_staff_scan($1, $2, $3, now())", [ORG_DEMO, randomUUID(), token])), /pas autorisée/);
    });
  });

  test("badge dynamique capturé hors ligne : valide à l'heure de capture, rejeu du même code refusé", async () => {
    await as(null, async (q) => {
      const [b] = await q("select b.id, b.token from staff_badges b join staff_members s on s.id = b.staff_id where s.user_id = $1 and b.status = 'active'", [USERS.director]);
      const [{ w, at }] = await q("select floor(extract(epoch from now() - interval '15 minutes') / 30)::bigint as w, now() - interval '15 minutes' as at");
      const [{ sig }] = await q("select app.badge_signature($1, 'S', $2, $3) as sig", [b.token, b.id, w]);
      const code = `NEOSCOL-DYN:S:${b.id}:${w}:${sig}`;
      await switchTo(q, USERS.kiosk);
      const [{ r }] = await q("select sync_offline_staff_scan($1, $2, $3, $4) as r", [ORG_DEMO, randomUUID(), code, at]);
      assert.notEqual(r.reason, "expired", "code valide à l'heure de capture");
      assert.ok(["accepted", "rejected"].includes(r.result));
      const [{ r: replay }] = await q("select sync_offline_staff_scan($1, $2, $3, $4) as r", [ORG_DEMO, randomUUID(), code, at]);
      assert.equal(replay.result, "rejected", "même code dynamique réutilisé : refusé (anti-rejeu)");
      // En ligne, ce code capturé il y a 15 min serait expiré.
      assert.equal((await q("select scan_staff_badge($1, $2) as r", [ORG_DEMO, code]))[0].r.result, "rejected");
    });
  });
});

describe("Appel hors ligne", () => {
  test("appel validé hors ligne : droits de l'enseignant, rejeu sans double notification", async () => {
    await as(null, async (q) => {
      const lesson = await lessonNow(q, { teacherUser: USERS.teacher, className: "6e A", subjectCode: "MATH" });
      await q(
        `insert into lesson_unlocks (organization_id, timetable_slot_id, lesson_date, class_id, teacher_id, starts_at, ends_at, method, reason)
         select organization_id, id, $2, class_id, teacher_id, starts_at, ends_at, 'manual', 'Test hors ligne' from timetable_slots where id = $1`,
        [lesson.slotId, lesson.today],
      );
      const pupils = await q("select student_id from enrollments where class_id = $1 and status = 'validated'", [lesson.classId]);
      const records = pupils.map((p, i) => ({ student_id: p.student_id, status: i === 0 ? "absent" : "present" }));
      const id = randomUUID();

      await switchTo(q, USERS.teacher2);
      assert.ok(await rejects(q("select sync_offline_lesson_attendance($1, $2, $3, $4, true, now())", [randomUUID(), lesson.slotId, lesson.today, JSON.stringify(records)])), "autre enseignant refusé");

      await switchTo(q, USERS.teacher);
      const [{ r }] = await q("select sync_offline_lesson_attendance($1, $2, $3, $4, true, now() - interval '5 minutes') as r", [id, lesson.slotId, lesson.today, JSON.stringify(records)]);
      assert.equal(r.validated, true);
      const [{ n: notices }] = await q("select count(*)::int as n from notifications where created_at > now() - interval '1 minute'");
      const [{ r: again }] = await q("select sync_offline_lesson_attendance($1, $2, $3, $4, true, now()) as r", [id, lesson.slotId, lesson.today, JSON.stringify(records)]);
      assert.equal(again.duplicate, true);
      assert.equal((await q("select count(*)::int as n from notifications where created_at > now() - interval '1 minute'"))[0].n, notices, "aucune notification en double");
      assert.equal((await q("select status from attendance_sessions where timetable_slot_id = $1", [lesson.slotId]))[0].status, "validated");
      assert.match(await rejects(q("select sync_offline_lesson_attendance($1, $2, $3, $4, false, now() - interval '5 days')", [randomUUID(), lesson.slotId, lesson.today, "[]"])), /plus de 72 h/);
    });
  });
});
