// Personnel : badges QR, tablette de pointage, cycle de vie.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, badgeToken, lessonNow, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const scan = async (q, code) => (await q("select scan_staff_badge($1, $2, 'test') as r", [ORG_DEMO, code]))[0].r;

describe("Badges", () => {
  test("régénérer un badge désactive l'ancien ; l'ancien QR est refusé", async () => {
    await as(null, async (q) => {
      const oldToken = await badgeToken(q, USERS.teacher2);
      const [staff] = await q("select id from staff_members where user_id = $1", [USERS.teacher2]);
      await switchTo(q, USERS.secretary);
      await q("select issue_staff_badge($1, 'Badge perdu')", [staff.id]);
      const badges = await q("select status, revoked_reason, number from staff_badges where staff_id = $1 order by issued_at, number", [staff.id]);
      assert.deepEqual(badges.map((b) => b.status).sort(), ["active", "revoked"]);
      assert.ok(badges.every((b) => /^BDG-DEMO-\d{2}-\d{5}$/.test(b.number)));
      assert.equal(badges.find((b) => b.status === "revoked").revoked_reason, "Badge perdu");

      await switchTo(q, USERS.kiosk);
      const refused = await scan(q, oldToken);
      assert.deepEqual([refused.result, refused.reason], ["rejected", "revoked_badge"]);
    });
  });

  test("seuls les profils autorisés gèrent les badges", async () => {
    await as(USERS.teacher, async (q) => {
      const [me] = await q("select id from staff_members where user_id = $1", [USERS.teacher]);
      assert.match(await rejects(q("select issue_staff_badge($1)", [me.id])), /row-level security/);
      const mine = await q("select status from staff_badges");
      assert.deepEqual(mine.map((b) => b.status), ["active"], "l'enseignant ne voit que son badge");
    });
    await as(USERS.accountant, async (q) => {
      assert.equal((await q("select id from staff_badges")).length, 1, "la comptabilité ne voit que son propre badge");
    });
  });

  test("désactiver un membre du personnel désactive son badge", async () => {
    await as(null, async (q) => {
      const token = await badgeToken(q, USERS.accountant);
      await switchTo(q, USERS.admin);
      await q("update staff_members set status = 'inactive', status_reason = 'Fin de contrat' where user_id = $1", [USERS.accountant]);
      await switchTo(q, USERS.kiosk);
      const refused = await scan(q, token);
      assert.equal(refused.reason, "revoked_badge");
    });
  });

  test("matricule du personnel attribué automatiquement et unique", async () => {
    await as(USERS.admin, async (q) => {
      const [a] = await q("insert into staff_members (organization_id, first_name, last_name, job_title) values ($1, 'Nina', 'ADJOBI', 'Surveillante') returning employee_number", [ORG_DEMO]);
      const [b] = await q("insert into staff_members (organization_id, first_name, last_name) values ($1, 'Paul', 'ESSIS') returning employee_number", [ORG_DEMO]);
      assert.match(a.employee_number, /^EMP-DEMO-\d{4}$/);
      assert.notEqual(a.employee_number, b.employee_number);
    });
  });
});

describe("Tablette de pointage", () => {
  test("arrivée, anti double-scan, départ ; tout est journalisé", async () => {
    await as(null, async (q) => {
      const token = await badgeToken(q, USERS.secretary);
      await switchTo(q, USERS.kiosk);
      const first = await scan(q, token);
      assert.deepEqual([first.result, first.kind], ["accepted", "arrival"]);
      const dup = await scan(q, token);
      assert.deepEqual([dup.result, dup.reason], ["rejected", "duplicate"]);

      await switchTo(q, null);
      await q("update organizations set settings = jsonb_set(settings, '{staff_attendance,duplicate_window_seconds}', '0') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.kiosk);
      const leave = await scan(q, token);
      assert.deepEqual([leave.result, leave.kind], ["accepted", "departure"]);

      await switchTo(q, null);
      await q("update organizations set settings = jsonb_set(settings, '{staff_attendance,track_departure}', 'false') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.kiosk);
      const again = await scan(q, token);
      assert.deepEqual([again.result, again.reason], ["rejected", "already_checked_in"]);

      await switchTo(q, USERS.director);
      const [att] = await q(
        "select a.arrived_at is not null as arrived, a.departed_at is not null as departed from staff_attendance a join staff_members s on s.id = a.staff_id where s.user_id = $1",
        [USERS.secretary],
      );
      assert.deepEqual(att, { arrived: true, departed: true });
      const scans = await q("select result, reason from badge_scans order by scanned_at, result");
      assert.equal(scans.length, 4);
      const audit = await q("select result from audit_logs where action = 'staff_attendance.scan' order by id");
      assert.deepEqual(audit.map((a) => a.result).sort(), ["denied", "denied", "success", "success"]);
    });
  });

  test("badge inconnu, badge d'un autre établissement, tablette non autorisée", async () => {
    await as(null, async (q) => {
      const [otherStaff] = await q(
        "insert into staff_members (organization_id, first_name, last_name) values ($1, 'Awa', 'SORO') returning id",
        [ORG_DEMOF],
      );
      const [otherBadge] = await q("insert into staff_badges (organization_id, staff_id) values ($1, $2) returning token", [ORG_DEMOF, otherStaff.id]);
      await switchTo(q, USERS.kiosk);
      assert.equal((await scan(q, "N'IMPORTE QUOI")).reason, "unknown_badge");
      const foreign = await scan(q, otherBadge.token);
      assert.deepEqual([foreign.result, foreign.reason], ["rejected", "other_organization"]);
      assert.equal(foreign.staff, null, "aucune information sur le personnel d'un autre établissement");
      // La tablette DEMO ne peut pas pointer pour DEMOF.
      assert.match(await rejects(q("select scan_staff_badge($1, $2)", [ORG_DEMOF, otherBadge.token])), /pas autorisée/);
    });
  });

  test("retard calculé sur le premier cours ; déverrouillage manuel réservé à l'administration", async () => {
    await as(null, async (q) => {
      const lesson = await lessonNow(q, { teacherUser: USERS.teacher2, className: "6e A", subjectCode: "FR" });
      await switchTo(q, USERS.teacher2);
      assert.match(await rejects(q("select unlock_lesson_manually($1, $2, 'Badge oublié')", [lesson.slotId, lesson.today])), /non autorisé/);
      await switchTo(q, USERS.director);
      assert.match(await rejects(q("select unlock_lesson_manually($1, $2, '')", [lesson.slotId, lesson.today])), /motif/);
      await q("select unlock_lesson_manually($1, $2, 'Badge oublié à la maison')", [lesson.slotId, lesson.today]);
      await switchTo(q, USERS.teacher2);
      const [row] = await q("select status, unlock_method from my_lessons($1, $1) where slot_id = $2", [lesson.today, lesson.slotId]);
      assert.deepEqual(row, { status: "unlocked", unlock_method: "manual" });
      await switchTo(q, null);
      const token = await badgeToken(q, USERS.teacher2);
      await switchTo(q, USERS.kiosk);
      const arrival = await scan(q, token);
      assert.equal(arrival.kind, "arrival");
      assert.ok(arrival.minutes_late >= 5, "arrivée après le début du premier cours = retard");
    });
  });
});

describe("Cycle de vie du personnel", () => {
  test("suppression définitive : archivage préalable, confirmation, permission", async () => {
    await as(null, async (q) => {
      const [staff] = await q("select id, employee_number from staff_members where user_id = $1", [USERS.accountant]);
      await switchTo(q, USERS.director);
      assert.match(await rejects(q("select delete_staff_member($1, $2)", [staff.id, staff.employee_number])), /staff\.delete/);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select delete_staff_member($1, $2)", [staff.id, staff.employee_number])), /Archivez/);
      await q("update staff_members set archived_at = now() where id = $1", [staff.id]);
      assert.match(await rejects(q("select delete_staff_member($1, 'X')", [staff.id])), /matricule exact/);
      await q("select delete_staff_member($1, $2)", [staff.id, staff.employee_number.toLowerCase()]);
      assert.equal((await q("select id from staff_members where id = $1", [staff.id])).length, 0);
      const [log] = await q("select action, actor_role, result from audit_logs where action = 'staff.delete' order by id desc limit 1");
      assert.deepEqual(log, { action: "staff.delete", actor_role: "Administrateur", result: "success" });
    });
  });
});
