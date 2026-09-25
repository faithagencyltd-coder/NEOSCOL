// MODULE 2 — FORMATION PROFESSIONNELLE : formations, sessions, groupes facultatifs,
// inscription et paiements, badges apprenants, scan unifié, assiduité, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, badgeToken, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const ADMIN_F = USERS.otherOrgAdmin; // administrateur du centre DEMOF
const TRAINER = "00000000-0000-4000-a000-000000000013"; // Koffi AKA, formateur (bureautique)
const KIOSK_F = "00000000-0000-4000-a000-000000000014"; // tablette du centre
const SESSION = "Bureautique — Session en cours";

const scan = async (q, code, org = ORG_DEMOF, room = null) =>
  (await q("select scan_badge($1, $2, 'test', $3) as r", [org, code, room]))[0].r;

/** Jeton du badge actif d'un apprenant (par nom de famille). */
async function learnerToken(q, lastName) {
  const [row] = await q(
    "select b.token, s.id from student_badges b join students s on s.id = b.student_id where s.last_name = $1 and b.status = 'active'",
    [lastName],
  );
  return row;
}

/**
 * Contexte système : un cours de la session Bureautique commence il y a
 * `startedMinutesAgo` minutes (négatif : commence bientôt). Les autres créneaux
 * du jour de la session et du formateur sont retirés.
 */
async function courseNow(q, startedMinutesAgo, { groupId = null, roomName = "Salle informatique B2" } = {}) {
  const [info] = await q(
    `select c.id as class_id, c.academic_year_id, cs.id as class_subject_id, cs.teacher_id, r.id as room_id,
            extract(isodow from (now() at time zone o.timezone))::int as weekday,
            greatest((now() at time zone o.timezone)::time - make_interval(mins => $2), time '00:00')::time as starts_at,
            least((now() at time zone o.timezone)::time + interval '90 minutes', time '23:59:59')::time as ends_at
     from classes c join organizations o on o.id = c.organization_id
     join class_subjects cs on cs.class_id = c.id join subjects s on s.id = cs.subject_id and s.code = 'WORD'
     join rooms r on r.organization_id = c.organization_id and r.name = $3
     where c.name = $1`,
    [SESSION, startedMinutesAgo, roomName],
  );
  await q("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3)", [info.weekday, info.class_id, info.teacher_id]);
  const [slot] = await q(
    `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, group_id, weekday, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [ORG_DEMOF, info.academic_year_id, info.class_id, info.class_subject_id, info.teacher_id, info.room_id, groupId, info.weekday, info.starts_at, info.ends_at],
  );
  return { ...info, slotId: slot.id };
}

/** Le temps ne s'écoule pas dans une transaction de test : on vieillit les scans pour sortir de l'anti double-scan. */
const ageScans = (q) => q("update badge_scans set scanned_at = scanned_at - interval '5 minutes' where organization_id = $1", [ORG_DEMOF]);

describe("Formation professionnelle — structure", () => {
  test("formations libres : création, champs de formation, désactivation, suppression si jamais utilisée", async () => {
    await as(ADMIN_F, async (q) => {
      const [p] = await q(
        `insert into programs (organization_id, name, code, kind, duration_hours, duration_label, training_level, admission_conditions,
                               certificate_title, syllabus, tuition_amount, registration_fee, default_installments)
         values ($1, 'Mécanique auto', 'MECA', 'training', 400, '6 mois', 'BEPC', 'Test d''entrée', 'CQP Mécanicien', 'Moteur ; freinage', 250000, 20000, 4)
         returning id, tuition_amount`,
        [ORG_DEMOF],
      );
      assert.equal(Number(p.tuition_amount), 250000);
      await q("update programs set is_active = false where id = $1", [p.id]);
      assert.match(
        await rejects(q("insert into classes (organization_id, academic_year_id, program_id, kind, name) select $1, id, $2, 'training_session', 'MECA S1' from academic_years where organization_id = $1 and is_current", [ORG_DEMOF, p.id])),
        /désactivée/,
      );
      await q("select delete_training_program($1)", [p.id]);
      assert.equal((await q("select id from programs where id = $1", [p.id])).length, 0, "formation jamais utilisée : supprimée");
      const [used] = await q("select id from programs where organization_id = $1 and code = 'BUREAU'", [ORG_DEMOF]);
      assert.match(await rejects(q("select delete_training_program($1)", [used.id])), /désactivez-la plutôt/);
      assert.match(
        await rejects(q("insert into classes (organization_id, academic_year_id, kind, name) select $1, id, 'training_session', 'Sans formation' from academic_years where organization_id = $1 and is_current", [ORG_DEMOF])),
        /formation de la session/,
      );
    });
  });

  test("centre SANS classes : groupes refusés, le reste fonctionne ; centre AVEC classes : groupes, capacité, emplois du temps parallèles", async () => {
    await as(ADMIN_F, async (q) => {
      const [session] = await q("select id, academic_year_id from classes where name = $1", [SESSION]);
      assert.match(await rejects(q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'G1')", [ORG_DEMOF, session.id])), /pas activés/);

      const cfg = (await q("select set_training_config($1, $2) c", [ORG_DEMOF, { groups_enabled: true, late_tolerance_minutes: 10 }]))[0].c;
      assert.equal(cfg.groups_enabled, true);
      assert.equal(cfg.late_tolerance_minutes, 10);
      assert.equal(cfg.open_before_minutes, 30, "réglage non fourni : conservé");
      const [g1] = await q("insert into training_groups (organization_id, class_id, name, capacity) values ($1, $2, 'Groupe A', 1) returning id", [ORG_DEMOF, session.id]);
      const [g2] = await q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'Groupe B') returning id", [ORG_DEMOF, session.id]);

      // Deux groupes peuvent avoir cours en même temps ; un cours de toute la session, non.
      const [cs] = await q("select cs.id, cs.teacher_id from class_subjects cs join subjects s on s.id = cs.subject_id where cs.class_id = $1 and s.code = 'EXCEL'", [session.id]);
      const [cs2] = await q("select cs.id from class_subjects cs join subjects s on s.id = cs.subject_id where cs.class_id = $1 and s.code = 'NET'", [session.id]);
      await q("delete from timetable_slots where class_id = $1 and weekday = 7", [session.id]);
      await q("insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, group_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6, 7, '09:00', '11:00')", [ORG_DEMOF, session.academic_year_id, session.id, cs.id, cs.teacher_id, g1.id]);
      await q("insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, group_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4, $5, 7, '09:00', '11:00')", [ORG_DEMOF, session.academic_year_id, session.id, cs2.id, g2.id]);
      assert.match(
        await rejects(q("insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4, 7, '10:00', '12:00')", [ORG_DEMOF, session.academic_year_id, session.id, cs2.id])),
        /groupe de la session a déjà un cours/,
      );
      assert.match(
        await rejects(q("insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, group_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4, $5, 7, '10:00', '12:00')", [ORG_DEMOF, session.academic_year_id, session.id, cs2.id, g1.id])),
        /timetable_no_class_overlap/,
        "même groupe, même heure : refusé",
      );

      // Inscription dans un groupe (capacité 1).
      const enroll = (last) => q("select enroll_learner($1, $2) r", [ORG_DEMOF, { student: { first_name: "Test", last_name: last }, session_id: session.id, group_id: g1.id }]);
      const [{ r }] = await enroll("GROUPEA");
      assert.equal((await q("select group_id from enrollments where id = $1", [r.enrollment_id]))[0].group_id, g1.id);
      assert.match(await rejects(enroll("GROUPEA2")), /Groupe complet/);

      // Un groupe d'une autre session est refusé.
      const [other] = await q("select id from classes where name = 'Couture — Session en cours'");
      assert.match(await rejects(q("select enroll_learner($1, $2)", [ORG_DEMOF, { student: { first_name: "X", last_name: "Y" }, session_id: other.id, group_id: g2.id }])), /n'appartient pas/);
    });
  });

  test("Module Scolaire inchangé : une classe ne peut toujours pas avoir deux cours en même temps", async () => {
    await as(USERS.admin, async (q) => {
      const [slot] = await q("select * from timetable_slots where organization_id = $1 limit 1", [ORG_DEMO]);
      assert.match(
        await rejects(q("insert into timetable_slots (organization_id, academic_year_id, class_id, weekday, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6)", [ORG_DEMO, slot.academic_year_id, slot.class_id, slot.weekday, slot.starts_at, slot.ends_at])),
        /timetable_no_class_overlap/,
      );
      assert.equal((await q("select settings ? 'training' t from organizations where id = $1", [ORG_DEMO]))[0].t, false);
      assert.match(await rejects(q("select set_training_config($1, '{}')", [ORG_DEMO])), /ne s'applique pas/);
    });
  });
});

describe("Formation professionnelle — inscription et paiements", () => {
  test("apprenant → formation → session → tarif → échéancier → versement → reste à payer", async () => {
    await as(ADMIN_F, async (q) => {
      const [session] = await q("select id from classes where name = $1", [SESSION]);
      const [{ r }] = await q("select enroll_learner($1, $2) r", [ORG_DEMOF, {
        student: { first_name: "Awa", last_name: "TESTFORMATION", sex: "F", phone: "+225 07 99 99 99 99", education_level: "BAC" },
        guardian: { first_name: "Mamadou", last_name: "TESTFORMATION", phone: "+225 07 88 88 88 88", relationship: "father" },
        session_id: session.id, plan: "installments", installments: 3, discount: 15000, discount_reason: "Bourse",
        payment: { amount: 50000, method: "mobile_money", reference: "OM-TEST-1" },
      }]);
      // 150 000 (formation) + 10 000 (inscription) - 15 000 (remise) = 145 000
      assert.equal(Number(r.total), 145000);
      assert.equal(Number(r.balance), 95000);
      const [inv] = await q("select total, status from invoices where id = $1", [r.invoice_id]);
      assert.deepEqual([Number(inv.total), inv.status], [145000, "issued"]);
      const inst = await q("select amount, label from installments where invoice_id = $1 order by sequence", [r.invoice_id]);
      assert.equal(inst.length, 3);
      assert.equal(inst.reduce((s, i) => s + Number(i.amount), 0), 145000, "échéances = total");
      const [st] = await q("select status, education_level, matricule from students where id = $1", [r.student_id]);
      assert.deepEqual([st.status, st.education_level], ["active", "BAC"]);
      assert.match(st.matricule, /^DEMOF-/);
      const [e] = await q("select status, program_id is not null as p from enrollments where id = $1", [r.enrollment_id]);
      assert.deepEqual([e.status, e.p], ["validated", true]);
      assert.equal((await q("select count(*)::int n from student_guardians where student_id = $1", [r.student_id]))[0].n, 1, "personne à contacter");

      // Paiement intégral : une seule échéance.
      const [{ r: full }] = await q("select enroll_learner($1, $2) r", [ORG_DEMOF, { student: { first_name: "B", last_name: "INTEGRAL" }, session_id: session.id, plan: "full", payment: { amount: 160000 } }]);
      assert.equal(Number(full.balance), 0);
      assert.equal((await q("select count(*)::int n from installments where invoice_id = $1", [full.invoice_id]))[0].n, 1);
      assert.match(await rejects(q("select enroll_learner($1, $2)", [ORG_DEMOF, { student: { first_name: "C", last_name: "REMISE" }, session_id: session.id, discount: 999999 }])), /remise dépasse/);
    });
  });

  test("capacité de session et session terminée", async () => {
    await as(ADMIN_F, async (q) => {
      const [session] = await q("select id from classes where name = $1", [SESSION]);
      const [{ n }] = await q("select count(*)::int n from enrollments where class_id = $1 and status in ('pending', 'validated')", [session.id]);
      await q("update classes set capacity = $2 where id = $1", [session.id, n]);
      assert.match(await rejects(q("select enroll_learner($1, $2)", [ORG_DEMOF, { student: { first_name: "D", last_name: "COMPLET" }, session_id: session.id }])), /Session complète/);
      assert.match(await rejects(q("update classes set capacity = 1 where id = $1", [session.id])), /Capacité trop faible/);
      await q("update classes set capacity = null, starts_on = current_date - 200, ends_on = current_date - 1 where id = $1", [session.id]);
      assert.match(await rejects(q("select enroll_learner($1, $2)", [ORG_DEMOF, { student: { first_name: "E", last_name: "TARD" }, session_id: session.id }])), /terminée/);
    });
  });

  test("permissions : la tablette et le formateur ne peuvent pas inscrire", async () => {
    for (const user of [KIOSK_F, TRAINER]) {
      await as(user, async (q) => {
        const [session] = await q("select id from classes where name = $1", [SESSION]);
        assert.ok(await rejects(q("select enroll_learner($1, $2)", [ORG_DEMOF, { student: { first_name: "F", last_name: "INTRUS" }, session_id: session.id }])));
      });
    }
  });
});

describe("Formation professionnelle — badges et scan", () => {
  test("entrée à l'heure, double scan, sortie, nouvelle entrée sans retard, temps de présence cumulé", async () => {
    await as(null, async (q) => {
      await courseNow(q, -10); // le cours commence dans 10 minutes
      const { token } = await learnerToken(q, "COULIBALY");
      await switchTo(q, KIOSK_F);
      const entry = await scan(q, `NEOSCOL-BADGE:${token}`);
      assert.deepEqual([entry.result, entry.kind, entry.profile, entry.status], ["accepted", "entry", "learner", "on_time"]);
      assert.match(entry.message, /À L'HEURE/);
      assert.equal(entry.learner.name, "Aminata COULIBALY");
      assert.equal(entry.formation, "Informatique bureautique");
      assert.equal(entry.session, SESSION);
      assert.equal(entry.course.subject, "Traitement de texte");
      assert.equal(entry.course.room, "Salle informatique B2");

      const dup = await scan(q, token);
      assert.deepEqual([dup.result, dup.reason], ["rejected", "duplicate"]);

      await switchTo(q, null);
      await ageScans(q);
      await q("update learner_attendance set entered_at = entered_at - interval '95 minutes' where exited_at is null");
      await switchTo(q, KIOSK_F);
      const exit = await scan(q, token);
      assert.deepEqual([exit.result, exit.kind], ["accepted", "exit"]);
      assert.equal(exit.period_minutes, 95);
      assert.match(exit.message, /Présence : 1 h 35/);

      await switchTo(q, null);
      await ageScans(q);
      await switchTo(q, KIOSK_F);
      const again = await scan(q, token);
      assert.deepEqual([again.kind, again.minutes_late], ["entry", 0], "ré-entrée : pas de retard");
      await switchTo(q, null);
      await ageScans(q);
      await q("update learner_attendance set entered_at = entered_at - interval '20 minutes' where exited_at is null");
      await switchTo(q, KIOSK_F);
      const exit2 = await scan(q, token);
      assert.equal(exit2.day_minutes, 115, "95 + 20 minutes : périodes additionnées");
      const scans = await q("select kind, result from badge_scans where student_id is not null order by scanned_at");
      assert.ok(scans.length >= 5, "tous les scans sont journalisés, y compris les refus");
    });
  });

  test("retard selon la règle du centre (EN RETARD — X MINUTES)", async () => {
    await as(null, async (q) => {
      await courseNow(q, 25);
      const { token } = await learnerToken(q, "KOUAKOU");
      await switchTo(q, KIOSK_F);
      const late = await scan(q, token);
      assert.equal(late.status, "late");
      assert.ok(late.minutes_late >= 25 && late.minutes_late <= 26, `retard ${late.minutes_late}`);
      assert.match(late.message, /EN RETARD — 2\d MINUTES/);
    });
    await as(null, async (q) => {
      await courseNow(q, 8);
      await switchTo(q, ADMIN_F);
      await q("select set_training_config($1, $2)", [ORG_DEMOF, { late_tolerance_minutes: 10 }]);
      const { token } = await learnerToken(q, "KOUAKOU");
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, token)).status, "on_time", "8 min < tolérance de 10 min");
    });
  });

  test("refus : QR inconnu, badge désactivé / remplacé, apprenant inactif, aucun cours, mauvaise salle", async () => {
    await as(null, async (q) => {
      const course = await courseNow(q, 0);
      const a = await learnerToken(q, "OUÉDRAOGO");
      const b = await learnerToken(q, "DIABATÉ");
      const c = await learnerToken(q, "TOURÉ");
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, "NEOSCOL-BADGE:ABCDEFGHJKLMNPQRSTUVWXYZ23456789")).reason, "unknown_badge");
      assert.equal((await scan(q, "n'importe quoi")).reason, "unknown_badge");

      // Badge perdu : remplacé ; l'ancien ne scanne plus, le nouveau oui ; historique conservé.
      await switchTo(q, ADMIN_F);
      const [{ id: newBadge }] = await q("select issue_student_badge($1, 'Badge perdu') id", [a.id]);
      const history = await q("select status, revoked_reason, replaces_badge_id from student_badges where student_id = $1 order by issued_at, number", [a.id]);
      assert.deepEqual(history.map((h) => h.status).sort(), ["active", "revoked"]);
      assert.equal(history.find((h) => h.status === "revoked").revoked_reason, "Badge perdu");
      assert.match(await rejects(q("update student_badges set status = 'active' where student_id = $1 and status = 'revoked'", [a.id])), /ne peut plus être modifié/);
      const [{ token: fresh }] = await q("select token from student_badges where id = $1", [newBadge]);
      await switchTo(q, KIOSK_F);
      const old = await scan(q, a.token);
      assert.deepEqual([old.result, old.reason], ["rejected", "revoked_badge"]);
      assert.equal(old.learner.name, "Salimata OUÉDRAOGO", "le nom est affiché pour orienter l'apprenant");
      assert.equal((await scan(q, fresh)).result, "accepted");

      // Apprenant désactivé : badge désactivé automatiquement.
      await switchTo(q, ADMIN_F);
      await q("update students set status = 'inactive', status_reason = 'Abandon' where id = $1", [b.id]);
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, b.token)).reason, "revoked_badge");

      // Mauvaise salle (tablette de l'atelier couture) puis aucun cours prévu.
      const [atelier] = await q("select id from rooms where name = 'Atelier couture'");
      const wrong = await scan(q, c.token, ORG_DEMOF, atelier.id);
      assert.deepEqual([wrong.result, wrong.reason], ["rejected", "wrong_room"]);
      assert.match(wrong.message, /salle Salle informatique B2/);
      await switchTo(q, null);
      await ageScans(q);
      await q("delete from timetable_slots where id = $1", [course.slotId]);
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, c.token)).reason, "no_course");

      // Réglage « entrée sans cours » : acceptée, hors cours.
      await switchTo(q, ADMIN_F);
      await q("select set_training_config($1, $2)", [ORG_DEMOF, { entry_without_course: true }]);
      await switchTo(q, KIOSK_F);
      const free = await scan(q, c.token);
      assert.deepEqual([free.result, free.kind], ["accepted", "entry"]);
      assert.match(free.message, /hors cours/);
    });
  });

  test("formateur : détecté automatiquement, « Bonjour … », cours et salle, FORMATEUR PRÉSENT", async () => {
    await as(null, async (q) => {
      await courseNow(q, 5);
      const token = await badgeToken(q, TRAINER);
      await switchTo(q, KIOSK_F);
      const r = await scan(q, `NEOSCOL-BADGE:${token}`);
      assert.deepEqual([r.result, r.profile, r.kind], ["accepted", "trainer", "arrival"]);
      assert.equal(r.greeting, "Bonjour Koffi");
      assert.equal(r.course.subject, "Traitement de texte");
      assert.equal(r.course.room, "Salle informatique B2");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from staff_attendance sa join staff_members s on s.id = sa.staff_id where s.user_id = $1", [TRAINER]))[0].n, 1);
      const [lu] = await q("select count(*)::int n from lesson_unlocks lu join staff_members s on s.id = lu.teacher_id where s.user_id = $1", [TRAINER]);
      assert.equal(lu.n, 1, "le cours est déverrouillé pour l'appel (système existant)");
    });
  });

  test("apprenant d'un groupe : seul le cours de SON groupe compte", async () => {
    await as(null, async (q) => {
      await switchTo(q, ADMIN_F);
      await q("select set_training_config($1, $2)", [ORG_DEMOF, { groups_enabled: true }]);
      const [session] = await q("select id from classes where name = $1", [SESSION]);
      const [ga] = await q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'Groupe A') returning id", [ORG_DEMOF, session.id]);
      const [gb] = await q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'Groupe B') returning id", [ORG_DEMOF, session.id]);
      const a = await learnerToken(q, "N'DRI");
      await q("update enrollments set group_id = $1 where student_id = $2", [ga.id, a.id]);
      await switchTo(q, null);
      await courseNow(q, 0, { groupId: gb.id });
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, a.token)).reason, "no_course", "cours du groupe B : refusé pour le groupe A");
      await switchTo(q, null);
      await ageScans(q);
      await courseNow(q, 0, { groupId: ga.id });
      await switchTo(q, KIOSK_F);
      const ok = await scan(q, a.token);
      assert.deepEqual([ok.result, ok.group], ["accepted", "Groupe A"]);
    });
  });
});

describe("Formation professionnelle — isolation multi-établissement", () => {
  test("un QR d'un établissement ne pointe jamais dans un autre ; données invisibles", async () => {
    await as(null, async (q) => {
      const { token } = await learnerToken(q, "COULIBALY");
      await switchTo(q, USERS.kiosk); // tablette du groupe scolaire DEMO
      const r = await scan(q, token, ORG_DEMO);
      assert.deepEqual([r.result, r.reason], ["rejected", "other_organization"]);
      assert.equal(r.learner, null, "aucune information de l'autre établissement");
      assert.match(await rejects(scan(q, token, ORG_DEMOF)), /pas autorisée/, "la tablette DEMO ne pointe pas pour DEMOF");
      await switchTo(q, USERS.admin);
      for (const table of ["student_badges", "learner_attendance", "training_groups", "internships", "learner_competencies", "training_competencies"]) {
        assert.equal((await q(`select count(*)::int n from ${table} where organization_id = $1`, [ORG_DEMOF]))[0].n, 0, table);
      }
      assert.match(await rejects(q("select training_dashboard($1)", [ORG_DEMOF])), /Permission/);
      const [student] = await q("select id from students where last_name = 'COULIBALY' and first_name = 'Aminata'");
      assert.equal(student, undefined);
    });
    // Un badge du personnel DEMO scanné sur la tablette du centre : autre établissement.
    await as(null, async (q) => {
      const token = await badgeToken(q, USERS.teacher);
      await switchTo(q, KIOSK_F);
      assert.equal((await scan(q, token)).reason, "other_organization");
    });
  });
});

describe("Formation professionnelle — assiduité, compétences, stages, statistiques", () => {
  test("assiduité : taux, présences, absences, retards, historique et cours suivis", async () => {
    await as(ADMIN_F, async (q) => {
      const [s] = await q("select id from students where last_name = 'COULIBALY'");
      const [{ a }] = await q("select learner_attendance_summary($1) a", [s.id]);
      assert.ok(a.expected > 0);
      assert.equal(a.attended + a.absences, a.expected);
      assert.ok(a.rate > 50 && a.rate <= 100);
      assert.ok(a.total_minutes > 0 && a.days_present > 0);
      assert.ok(a.history.length > 0 && a.history[0].entered_at);
      assert.deepEqual(a.courses.map((c) => c.subject).sort(), ["Internet et messagerie", "Tableur", "Traitement de texte"]);
    });
    await as(USERS.admin, async (q) => {
      const [s] = await q("select id from students where organization_id = $1 limit 1", [ORG_DEMO]);
      assert.ok(s);
    });
    await as(TRAINER, async (q) => {
      const [s] = await q("select s.id from students s join enrollments e on e.student_id = s.id join classes c on c.id = e.class_id where c.name = $1 limit 1", [SESSION]);
      assert.ok((await q("select learner_attendance_summary($1) a", [s.id]))[0].a, "le formateur voit l'assiduité de ses apprenants");
    });
  });

  test("compétences : le formateur évalue ses apprenants, pas ceux d'une autre session", async () => {
    await as(TRAINER, async (q) => {
      const [mine] = await q("select e.id, e.student_id, c.program_id from enrollments e join classes c on c.id = e.class_id where c.name = $1 limit 1", [SESSION]);
      const [comp] = await q("select id from training_competencies where program_id = $1 and name like 'Utiliser%'", [mine.program_id]);
      await q("insert into learner_competencies (organization_id, enrollment_id, student_id, competency_id, level) values ($1, $2, $3, $4, 'acquired')", [ORG_DEMOF, mine.id, mine.student_id, comp.id]);
      const [other] = await q("select e.id from enrollments e join classes c on c.id = e.class_id where c.name = 'Couture — Session en cours' limit 1");
      assert.equal(other, undefined, "le formateur ne voit pas les inscriptions des autres sessions");
    });
    await as(ADMIN_F, async (q) => {
      const [cout] = await q("select e.id, e.student_id from enrollments e join classes c on c.id = e.class_id where c.name = 'Couture — Session en cours' limit 1");
      const [bur] = await q("select id from training_competencies where name like 'Construire%'");
      assert.match(
        await rejects(q("insert into learner_competencies (organization_id, enrollment_id, student_id, competency_id, level) values ($1, $2, $3, $4, 'acquired')", [ORG_DEMOF, cout.id, cout.student_id, bur.id])),
        /n'appartient pas à la formation/,
      );
    });
  });

  test("stages : suivi et évaluation ; réservé aux profils autorisés", async () => {
    await as(ADMIN_F, async (q) => {
      const [i] = await q("select id from internships limit 1");
      await q("update internships set status = 'completed', evaluation_score = 16.5, evaluation_comment = 'Très bon stage' where id = $1", [i.id]);
      const [row] = await q("select evaluated_at is not null as e from internships where id = $1", [i.id]);
      assert.equal(row.e, true);
    });
    await as(KIOSK_F, async (q) => {
      assert.equal((await q("select id from internships")).length, 0);
    });
  });

  test("tableau de bord du jour et statistiques du centre", async () => {
    await as(null, async (q) => {
      await courseNow(q, 0);
      const { token } = await learnerToken(q, "COULIBALY");
      await switchTo(q, KIOSK_F);
      await scan(q, token);
      await switchTo(q, ADMIN_F);
      const [{ d }] = await q("select training_dashboard($1) d", [ORG_DEMOF]);
      assert.ok(d.learners.expected >= 6);
      assert.equal(d.learners.present, 1);
      assert.equal(d.learners.on_site, 1);
      assert.ok(d.by_formation.some((f) => f.name === "Informatique bureautique" && f.present === 1));
      assert.ok(d.trainers.expected >= 1);
      const [{ s }] = await q("select training_statistics($1) s", [ORG_DEMOF]);
      assert.equal(s.formations, 3);
      assert.equal(s.sessions.ongoing, 2);
      assert.ok(s.attendance_rate > 0);
      assert.ok(Number(s.finance.remaining) > 0, "reliquats");
      assert.ok(Number(s.finance.collected) > 0);
      assert.equal(s.badges_active, 11);
    });
    await as(TRAINER, async (q) => {
      const [{ s }] = await q("select training_statistics($1) s", [ORG_DEMOF]).catch(() => [{ s: null }]);
      assert.ok(s === null || s.finance === null, "sans droit finance : pas de montants");
    });
  });
});
