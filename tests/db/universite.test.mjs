// MODULE 3 — UNIVERSITÉ : réglages, structure, inscriptions, résultats (compensation,
// rattrapage), délibérations (historique), mémoires/soutenances, diplômes, scan,
// rôles universitaires et isolation multi-établissement.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const ORG_U = "10000000-0000-4000-a000-000000000003";
const U = {
  admin: "00000000-0000-4000-a000-000000000012",
  student: "00000000-0000-4000-a000-000000000015",
  professor: "00000000-0000-4000-a000-000000000016",
  registrar: "00000000-0000-4000-a000-000000000017",
  kiosk: "00000000-0000-4000-a000-000000000018",
};

const ids = async (q) => {
  const [r] = await q(
    `select c.id as class_id, p1.id as s1, p2.id as s2, c.program_id
     from classes c join academic_periods p1 on p1.academic_year_id = c.academic_year_id and p1.sequence = 1
     join academic_periods p2 on p2.academic_year_id = c.academic_year_id and p2.sequence = 2
     where c.code = 'L1INF'`,
  );
  return r;
};
const studentByName = async (q, last) => (await q("select s.id, e.id as enrollment_id from students s join enrollments e on e.student_id = s.id where s.organization_id = $1 and s.last_name = $2", [ORG_U, last]))[0];

describe("Université — réglages et structure", () => {
  test("réglages par défaut, validation, permission ; refusé hors enseignement supérieur", async () => {
    await as(U.admin, async (q) => {
      const [{ c }] = await q("select set_university_config($1, $2) c", [ORG_U, { establishment_kind: "institut", features: { ranking: true }, rules: { retake_rule: "replace" } }]);
      assert.equal(c.establishment_kind, "institut");
      assert.equal(c.features.ranking, true);
      assert.equal(c.features.faculties, true, "autres fonctionnalités conservées");
      assert.equal(c.rules.retake_rule, "replace");
      assert.equal(c.rules.pass_mark, 10);
      assert.match(await rejects(q("select set_university_config($1, $2)", [ORG_U, { rules: { pass_mark: 25 } }])), /entre 0 et 20/);
      assert.match(await rejects(q("select set_university_config($1, $2)", [ORG_U, { features: { coiffure: true } }])), /inconnue/);
      assert.match(await rejects(q("select set_university_config($1, $2)", [ORG_U, { establishment_kind: "lycee" }])), /inconnu/);
    });
    await as(U.professor, async (q) => {
      assert.match(await rejects(q("select set_university_config($1, '{}')", [ORG_U])), /settings\.manage/);
    });
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select set_university_config($1, '{}')", [ORG_DEMO])), /ne s'applique pas/);
      assert.match(await rejects(q("insert into faculties (organization_id, name, code) values ($1, 'Faculté X', 'FX')", [ORG_DEMO])), /enseignement supérieur/);
    });
  });

  test("facultés et départements facultatifs ; cohérence faculté / département / filière", async () => {
    await as(U.admin, async (q) => {
      await q("select set_university_config($1, $2)", [ORG_U, { features: { faculties: false, departments: false } }]);
      assert.match(await rejects(q("insert into faculties (organization_id, name, code) values ($1, 'École d''ingénieurs', 'EI')", [ORG_U])), /pas activées/);
      assert.match(await rejects(q("insert into departments (organization_id, name, code) values ($1, 'Département Z', 'DZ')", [ORG_U])), /pas activés/);
      // Petit établissement : Établissement → Filières directement.
      await q("insert into programs (organization_id, name, code, kind, degree_title) values ($1, 'Licence Gestion', 'LGEST', 'degree', 'Licence en Gestion')", [ORG_U]);
      await q("select set_university_config($1, $2)", [ORG_U, { features: { faculties: true, departments: true } }]);
      const [fdse] = await q("select id from faculties where code = 'FDSE'");
      const [dinfo] = await q("select id from departments where code = 'DINFO'");
      assert.match(await rejects(q("insert into programs (organization_id, name, code, kind, faculty_id, department_id) values ($1, 'X', 'XX', 'degree', $2, $3)", [ORG_U, fdse.id, dinfo.id])), /n'appartient pas à la faculté/);
      const [p] = await q("insert into programs (organization_id, name, code, kind, department_id) values ($1, 'Licence Réseaux', 'LRES', 'degree', $2) returning faculty_id", [ORG_U, dinfo.id]);
      assert.ok(p.faculty_id, "faculté déduite du département");
    });
  });

  test("groupes facultatifs pour les promotions ; parcours cohérent avec la filière", async () => {
    await as(U.admin, async (q) => {
      const { class_id } = await ids(q);
      assert.match(await rejects(q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'Groupe A')", [ORG_U, class_id])), /groupes ne sont pas activés/);
      await q("select set_university_config($1, $2)", [ORG_U, { features: { groups: true } }]);
      await q("insert into training_groups (organization_id, class_id, name) values ($1, $2, 'Groupe TD1')", [ORG_U, class_id]);
      const [droit] = await q("select id from programs where code = 'LDROIT'");
      const [gl] = await q("select id from program_tracks where code = 'GL'");
      const s = await studentByName(q, "ZADI");
      assert.match(await rejects(q("update enrollments set program_id = $1, track_id = $2 where id = $3", [droit.id, gl.id, s.enrollment_id])), /parcours n'appartient pas/);
    });
  });
});

describe("Université — inscriptions et résultats", () => {
  test("inscription pédagogique séparée : UE du programme d'études, inscription administrative validée exigée", async () => {
    await as(U.registrar, async (q) => {
      const { s1 } = await ids(q);
      const s = await studentByName(q, "ZADI");
      const regs = await q("select tu.code from course_registrations cr join teaching_units tu on tu.id = cr.teaching_unit_id where cr.enrollment_id = $1 and cr.academic_period_id = $2 order by 1", [s.enrollment_id, s1]);
      assert.deepEqual(regs.map((r) => r.code), ["UE-INF11", "UE-MAT11", "UE-TRA11", "UE-WEB11"]);
      assert.equal((await q("select register_curriculum($1, $2) n", [s.enrollment_id, s1]))[0].n, 0, "idempotent");
      await q("update course_registrations set status = 'exempted' where enrollment_id = $1 and teaching_unit_id = (select id from teaching_units where code = 'UE-TRA11')", [s.enrollment_id]);
      const [{ id: yid }] = await q("select academic_year_id id from enrollments where id = $1", [s.enrollment_id]);
      const [pending] = await q("insert into enrollments (organization_id, student_id, academic_year_id, type, status) values ($1, $2, $3, 'reenrollment', 'draft') returning id", [ORG_U, s.id, yid]);
      assert.match(await rejects(q("insert into course_registrations (organization_id, enrollment_id, student_id, academic_period_id, teaching_unit_id) select $1, $2, $3, $4, id from teaching_units where code = 'UE-INF11'", [ORG_U, pending.id, s.id, s1])), /validée/);
    });
  });

  test("moyennes, crédits, compensation, rattrapage selon la règle configurée, classement facultatif", async () => {
    await as(U.admin, async (q) => {
      const { class_id, s1 } = await ids(q);
      await q("select deliberation_reopen(id, 'Test du rattrapage') from deliberations where class_id = $1 and academic_period_id = $2", [class_id, s1]);
      const failing = await studentByName(q, "CISSÉ");
      const before = (await q("select average, credits_earned, validated, retake_needed from semester_results where enrollment_id = $1 and academic_period_id = $2", [failing.enrollment_id, s1]))[0];
      assert.equal(before.validated, false);
      assert.equal(before.retake_needed, true);
      // Session de rattrapage : 15/20 dans chaque matière.
      for (const cs of await q("select cs.id, cs.subject_id from class_subjects cs join subjects s on s.id = cs.subject_id join teaching_units tu on tu.id = s.teaching_unit_id where cs.class_id = $1 and tu.semester_no = 1", [class_id])) {
        const [a] = await q("insert into assessments (organization_id, class_subject_id, academic_period_id, title, kind, assessed_on, coefficient, max_score) values ($1, $2, $3, 'Rattrapage', 'retake', current_date, 1, 20) returning id", [ORG_U, cs.id, s1]);
        await q("insert into grades (organization_id, assessment_id, student_id, score) values ($1, $2, $3, 15)", [ORG_U, a.id, failing.id]);
      }
      await q("select compute_university_results($1, $2)", [class_id, s1]);
      const after = (await q("select average, credits_earned, credits_total, validated, has_retake from semester_results where enrollment_id = $1 and academic_period_id = $2", [failing.enrollment_id, s1]))[0];
      assert.equal(after.validated, true, "semestre validé après rattrapage (meilleure note)");
      assert.equal(Number(after.credits_earned), Number(after.credits_total));
      assert.equal(after.has_retake, true);
      const [ue] = await q("select session1_average, retake_average, average from ue_results ur join teaching_units tu on tu.id = ur.teaching_unit_id where ur.enrollment_id = $1 and tu.code = 'UE-INF11'", [failing.enrollment_id]);
      assert.ok(Number(ue.retake_average) === 15 && Number(ue.average) >= Number(ue.session1_average));
      // Règle « plafonnée à 10 » : la note de rattrapage est plafonnée.
      await q("select set_university_config($1, $2)", [ORG_U, { rules: { retake_rule: "cap", retake_cap: 10 }, features: { ranking: true } }]);
      await q("select compute_university_results($1, $2)", [class_id, s1]);
      const [capped] = await q("select average from ue_results ur join teaching_units tu on tu.id = ur.teaching_unit_id where ur.enrollment_id = $1 and tu.code = 'UE-INF11'", [failing.enrollment_id]);
      assert.ok(Number(capped.average) <= 10, `plafond appliqué (${capped.average})`);
      const ranked = await q("select rank, population from semester_results where class_id = $1 and academic_period_id = $2 and rank is not null", [class_id, s1]);
      assert.equal(ranked.length, 10, "classement activé");
      // Sans compensation : un semestre avec une UE ratée n'est pas validé.
      await q("select set_university_config($1, $2)", [ORG_U, { rules: { retake_rule: "best", semester_compensation: false } }]);
      await q("select compute_university_results($1, $2)", [class_id, s1]);
      const comp = await q("select count(*)::int n from semester_results where class_id = $1 and academic_period_id = $2 and compensated", [class_id, s1]);
      assert.equal(comp[0].n, 0, "aucune compensation si désactivée");
    });
  });

  test("délibération : décisions versionnées (historique), clôture, publication, réouverture motivée", async () => {
    await as(U.admin, async (q) => {
      const { class_id, s1 } = await ids(q);
      const [d] = await q("select id from deliberations where class_id = $1 and academic_period_id = $2", [class_id, s1]);
      await q("select deliberation_reopen($1, 'Correction de décision')", [d.id]);
      const s = await studentByName(q, "KEITA");
      await q("select deliberation_decide($1, $2, 'Admis(e) par décision du jury', 'Assiduité exemplaire', true)", [d.id, s.id]);
      await q("select deliberation_decide($1, $2, 'Admis(e) par décision du jury', 'Rectification', true)", [d.id, s.id]);
      const history = await q("select version, is_current, decision from deliberation_decisions where deliberation_id = $1 and student_id = $2 order by version", [d.id, s.id]);
      assert.deepEqual(history.map((h) => [h.version, h.is_current]), [[1, false], [2, false], [3, true]], "historique conservé");
      // Aucune écriture directe (RLS) ; et même en contexte système, l'historique est protégé.
      assert.equal((await q("update deliberation_decisions set decision = 'X' where deliberation_id = $1 returning id", [d.id])).length, 0);
      await switchTo(q, null);
      assert.match(await rejects(q("update deliberation_decisions set decision = 'X' where deliberation_id = $1 and student_id = $2 and version = 1", [d.id, s.id])), /jamais modifiée/);
      assert.match(await rejects(q("delete from deliberation_decisions where deliberation_id = $1", [d.id])), /conservé/);
      await switchTo(q, U.admin);
      await q("select deliberation_close($1)", [d.id]);
      const [sr] = await q("select decision, validated, published_at is not null p, credits_earned, credits_total from semester_results where enrollment_id = $1 and academic_period_id = $2", [s.enrollment_id, s1]);
      assert.equal(sr.decision, "Admis(e) par décision du jury");
      assert.equal(sr.validated, true, "crédits validés par le jury");
      assert.equal(sr.p, true);
      assert.match(await rejects(q("select deliberation_decide($1, $2, 'Ajourné(e)')", [d.id, s.id])), /close/);
      assert.match(await rejects(q("select compute_university_results($1, $2)", [class_id, s1])), /close/);
      assert.match(await rejects(q("select deliberation_reopen($1, 'x')", [d.id])), /Motif/);
    });
  });

  test("portail étudiant : uniquement SES résultats publiés ; l'enseignant responsable de filière voit sa filière", async () => {
    await as(U.student, async (q) => {
      const rows = await q("select student_id from semester_results");
      assert.ok(rows.length >= 1);
      const [me] = await q("select id from students where user_id = $1", [U.student]);
      assert.ok(rows.every((r) => r.student_id === me.id), "aucun résultat d'un autre étudiant");
      assert.ok((await q("select id from ue_results")).every(Boolean));
      assert.equal((await q("select id from deliberations")).length, 0, "pas d'accès aux délibérations");
      assert.match(await rejects(q("select compute_university_results(id, (select id from academic_periods where sequence = 1 and academic_year_id = classes.academic_year_id)) from classes where code = 'L1INF'")), /deliberations\.manage|introuvable/);
    });
    await as(U.professor, async (q) => {
      assert.equal((await q("select distinct class_id from semester_results")).length, 1, "responsable de la filière LINFO : ses promotions");
      assert.ok((await q("select id from deliberations")).length >= 1);
      assert.match(await rejects(q("select deliberation_decide(id, (select student_id from deliberation_decisions limit 1), 'X') from deliberations limit 1")), /deliberations\.manage/);
    });
  });
});

describe("Université — mémoires, soutenances, diplômes", () => {
  test("soutenance tenue avec note → mémoire soutenu ; réservé à theses.manage", async () => {
    await as(U.registrar, async (q) => {
      const [d] = await q("select id, thesis_id from defenses limit 1");
      await q("update defenses set status = 'held', grade = 16, mention = 'Très bien', decision = 'Admis(e)' where id = $1", [d.id]);
      const [t] = await q("select status, grade from theses where id = $1", [d.thesis_id]);
      assert.deepEqual([t.status, Number(t.grade)], ["defended", 16]);
    });
    await as(U.professor, async (q) => {
      assert.equal((await q("select id from theses")).length, 0, "l'enseignant ne voit que les mémoires qu'il dirige");
      assert.equal((await q("update theses set grade = 20 returning id")).length, 0, "aucune écriture sans theses.manage");
    });
  });

  test("diplôme : numéro automatique, non modifiable, révocation motivée, historique ; accès", async () => {
    await as(U.registrar, async (q) => {
      const s = await studentByName(q, "YAPI");
      const [dip] = await q("insert into student_diplomas (organization_id, student_id, kind, title, year_label, source) values ($1, $2, 'diploma', 'Licence en Informatique', '2026-2027', 'app') returning id, number, status", [ORG_U, s.id]);
      assert.match(dip.number, /^DIP-DEMOU-\d{2}-\d{5}$/);
      assert.match(await rejects(q("update student_diplomas set title = 'Master' where id = $1", [dip.id])), /ne peut pas être modifié/);
      assert.match(await rejects(q("update student_diplomas set status = 'revoked' where id = $1", [dip.id])), /Motif/);
      await q("update student_diplomas set status = 'revoked', revoked_reason = 'Erreur de filière' where id = $1", [dip.id]);
      assert.match(await rejects(q("update student_diplomas set status = 'issued' where id = $1", [dip.id])), /révoqué/);
    });
    await as(U.professor, async (q) => {
      assert.ok(await rejects(q("insert into student_diplomas (organization_id, student_id, kind, title, source) select $1, id, 'diploma', 'Faux', 'app' from students limit 1", [ORG_U])));
    });
  });

  test("diplôme révoqué → document émis révoqué en cascade (vérification en ligne) ; aucune révocation hors diplôme sans documents.revoke", async () => {
    await as(U.registrar, async (q) => {
      assert.equal((await q("select app.has_permission($1, 'documents.revoke') ok", [ORG_U]))[0].ok, false, "scolarité sans documents.revoke");
      const s = await studentByName(q, "YAPI");
      const [dip] = await q("insert into student_diplomas (organization_id, student_id, kind, title, source) values ($1, $2, 'diploma', 'Licence en Informatique', 'app') returning id", [ORG_U, s.id]);
      const insertDoc = (kind, subjectType, subjectId) =>
        q(
          "insert into issued_documents (organization_id, kind, title, student_id, subject_type, subject_id, data, content_hash) values ($1, $2, 'Test', $3, $4, $5, '{}'::jsonb, encode(sha256(random()::text::bytea), 'hex')) returning id, status",
          [ORG_U, kind, s.id, subjectType, subjectId],
        );
      const [doc] = await insertDoc("diploma", "diploma", dip.id);
      const [other] = await insertDoc("university_transcript", "student", s.id);
      assert.equal(doc.status, "valid");
      assert.match(await rejects(q("update issued_documents set status = 'revoked', revoked_reason = 'x' where id = $1", [other.id])), /documents\.revoke/);
      await q("update student_diplomas set status = 'revoked', revoked_reason = 'Fraude constatée' where id = $1", [dip.id]);
      const [after] = await q("select status, revoked_reason, revoked_at is not null as dated from issued_documents where id = $1", [doc.id]);
      assert.deepEqual(after, { status: "revoked", revoked_reason: "Fraude constatée", dated: true });
      assert.equal((await q("select status from issued_documents where id = $1", [other.id]))[0].status, "valid", "les autres documents ne sont pas touchés");
    });
  });
});

describe("Université — scan, isolation", () => {
  test("scan : étudiant reconnu dans son contexte (filière, niveau, cours, salle), sortie anticipée ; enseignant", async () => {
    await as(null, async (q) => {
      const [info] = await q(
        `select cs.id, cs.teacher_id, c.academic_year_id, c.id as class_id,
                extract(isodow from now() at time zone o.timezone)::int wd,
                greatest((now() at time zone o.timezone)::time - interval '5 minutes', time '00:00')::time s,
                least((now() at time zone o.timezone) + interval '90 minutes', date_trunc('day', now() at time zone o.timezone) + interval '23:59')::time e
         from class_subjects cs join classes c on c.id = cs.class_id join organizations o on o.id = c.organization_id
         join subjects su on su.id = cs.subject_id where c.code = 'L1INF' and su.code = 'INF101'`,
      );
      await q("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3)", [info.wd, info.class_id, info.teacher_id]);
      await q("insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at, session_type) values ($1, $2, $3, $4, $5, (select id from rooms where name = 'Amphithéâtre A'), $6, $7, $8, 'cm')", [ORG_U, info.academic_year_id, info.class_id, info.id, info.teacher_id, info.wd, info.s, info.e]);
      const [{ token }] = await q("select b.token from student_badges b join students s on s.id = b.student_id where s.user_id = $1 and b.status = 'active'", [U.student]);
      await switchTo(q, U.kiosk);
      const entry = (await q("select scan_badge($1, $2) r", [ORG_U, token]))[0].r;
      assert.deepEqual([entry.result, entry.kind, entry.profile], ["accepted", "entry", "learner"]);
      assert.equal(entry.formation, "Licence Informatique");
      assert.equal(entry.level, "Licence 1");
      assert.equal(entry.course.subject, "Algorithmique et programmation");
      assert.equal(entry.course.room, "Amphithéâtre A");
      await switchTo(q, null);
      await q("update badge_scans set scanned_at = scanned_at - interval '5 minutes' where organization_id = $1", [ORG_U]);
      await switchTo(q, U.kiosk);
      const exit = (await q("select scan_badge($1, $2) r", [ORG_U, token]))[0].r;
      assert.equal(exit.kind, "exit");
      assert.ok(exit.early_exit_minutes > 0, "sortie avant la fin du cours");
      assert.match(exit.message, /Sortie anticipée/);
      await switchTo(q, null);
      const [{ token: teacherToken }] = await q("select token from staff_badges where staff_id = $1 and status = 'active'", [info.teacher_id]);
      await switchTo(q, U.kiosk);
      const t = (await q("select scan_badge($1, $2) r", [ORG_U, teacherToken]))[0].r;
      assert.equal(t.profile, "trainer");
      assert.equal(t.course.subject, "Algorithmique et programmation");
    });
  });

  test("isolation : aucun accès croisé entre établissements", async () => {
    await as(USERS.admin, async (q) => {
      for (const table of ["faculties", "departments", "program_tracks", "teaching_units", "course_registrations", "ue_results", "semester_results", "deliberations", "deliberation_decisions", "theses", "defenses", "academic_cycles", "exam_sessions"]) {
        assert.equal((await q(`select count(*)::int n from ${table} where organization_id = $1`, [ORG_U]))[0].n, 0, table);
      }
      assert.match(await rejects(q("select university_statistics($1)", [ORG_U])), /Permission|supérieur/);
      const [cls] = await q("select id from classes where organization_id = $1 limit 1", [ORG_DEMO]);
      assert.match(await rejects(q("select compute_university_results($1, (select id from academic_periods where organization_id = $2 limit 1))", [cls.id, ORG_DEMO])), /universitaire/);
    });
    await as(U.admin, async (q) => {
      assert.equal((await q("select count(*)::int n from students where organization_id = $1", [ORG_DEMO]))[0].n, 0);
      const [{ s }] = await q("select university_statistics($1) s", [ORG_U]);
      assert.ok(s.students_enrolled >= 10 && s.faculties === 2 && s.diplomas >= 1);
      assert.ok(Number(s.finance.remaining) > 0, "reliquats");
    });
  });
});
