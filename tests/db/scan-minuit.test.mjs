// Correctif « minuit » : un cours qui commence juste après minuit se débloque
// dans la fenêtre d'ouverture, sans repasser à la veille ; pas de faux retard.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, badgeToken, ORG_DEMO, pool, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Scan des badges autour de minuit", () => {
  test("cours à 00:05 : scan à 00:00 accepté et cours débloqué, sans retard", async () => {
    await as(null, async (q) => {
      const [info] = await q(
        `select cs.id as class_subject_id, cs.class_id, cs.teacher_id, c.academic_year_id, o.timezone,
                greatest(y.starts_on, current_date + 1) as day
         from class_subjects cs join classes c on c.id = cs.class_id join academic_years y on y.id = c.academic_year_id
         join organizations o on o.id = c.organization_id join staff_members st on st.id = cs.teacher_id
         where st.user_id = $1 and c.organization_id = $2 and y.is_current limit 1`,
        [USERS.teacher, ORG_DEMO],
      );
      const [{ wd }] = await q("select extract(isodow from $1::date)::int as wd", [info.day]);
      await q("delete from timetable_slots where weekday = $1 and (teacher_id = $2 or class_id = $3)", [wd, info.teacher_id, info.class_id]);
      await q(
        `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, weekday, starts_at, ends_at)
         values ($1, $2, $3, $4, $5, $6, '00:05', '01:00')`,
        [ORG_DEMO, info.academic_year_id, info.class_id, info.class_subject_id, info.teacher_id, wd],
      );
      const token = await badgeToken(q, USERS.teacher);
      const at = (hhmm) => q("select ($1::date + $2::time) at time zone $3 as t", [info.day, hhmm, info.timezone]).then((r) => r[0].t);
      // Tablette de pointage (droit staff_attendance.scan), heure simulée.
      const scanAt = await at("00:00");
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.kiosk, role: "authenticated" })]);
      const [{ r }] = await q("select public.scan_staff_badge_core($1, $2, 'test', $3) as r", [ORG_DEMO, `NEOSCOL-BADGE:${token}`, scanAt]);
      assert.equal(r.result, "accepted");
      assert.ok(r.lesson, "cours de 00:05 débloqué à 00:00 (fenêtre de 15 min ramenée à minuit)");
      const [att] = await q("select minutes_late from staff_attendance where staff_id = $1 and work_date = $2", [info.teacher_id, info.day]);
      assert.equal(att.minutes_late, 0, "arrivée avant le cours : aucun retard");
    });
  });
});
