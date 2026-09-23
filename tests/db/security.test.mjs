// Tests de sécurité et d'invariants exécutés contre un vrai PostgreSQL.
// Pré-requis : `npm run db:reset` (émulation Supabase + migrations + seed).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, USERS } from "./helpers.mjs";

after(() => pool.end());

// Les restrictions d'impayé (actives dans la démo pour Kofi) sont testées dans
// portal.test.mjs ; ici on vérifie les portées « normales ».
const liftRestrictions = (q) =>
  q("update organizations set settings = jsonb_set(settings, '{portal_restrictions,enabled}', 'false') where id = $1", [ORG_DEMO]);

const count = (rows) => Number(rows[0].count);

describe("Isolation multi-établissements", () => {
  test("un administrateur ne voit que son établissement", async () => {
    await as(USERS.otherOrgAdmin, async (q) => {
      const orgs = await q("select id from organizations");
      assert.deepEqual(orgs.map((o) => o.id), [ORG_DEMOF]);
      assert.equal(count(await q("select count(*) from students where organization_id = $1", [ORG_DEMO])), 0);
      assert.equal(count(await q("select count(*) from students")), 1);
      assert.equal(count(await q("select count(*) from payments")), 0);
      assert.equal(count(await q("select count(*) from audit_logs where organization_id = $1", [ORG_DEMO])), 0);
    });
  });

  test("impossible d'écrire dans un autre établissement", async () => {
    await as(USERS.otherOrgAdmin, async (q) => {
      const message = await rejects(
        q("insert into students (organization_id, first_name, last_name) values ($1, 'Intrus', 'TEST')", [ORG_DEMO]),
      );
      assert.match(message, /row-level security/);
      const updated = await q("update students set notes = 'x' where organization_id = $1 returning id", [ORG_DEMO]);
      assert.equal(updated.length, 0);
    });
  });

  test("clé étrangère composite : pas de rattachement inter-établissements", async () => {
    const message = await rejects(
      as(null, async (q) => {
        const [demofStudent] = await q("select id from students where organization_id = $1", [ORG_DEMOF]);
        const [demoYear] = await q("select id from academic_years where organization_id = $1", [ORG_DEMO]);
        await q(
          "insert into enrollments (organization_id, student_id, academic_year_id) values ($1, $2, $3)",
          [ORG_DEMO, demofStudent.id, demoYear.id],
        );
      }),
    );
    assert.match(message, /foreign key/);
  });

  test("le visiteur anonyme n'accède à aucune table", async () => {
    await as("anon", async (q) => {
      assert.match(await rejects(q("select count(*) from students")), /permission denied/);
      assert.match(await rejects(q("select count(*) from organizations")), /permission denied/);
    });
  });

  test("le super administrateur n'a pas d'accès implicite aux élèves", async () => {
    await as(USERS.superadmin, async (q) => {
      assert.equal((await q("select id from organizations")).length, 2);
      assert.equal(count(await q("select count(*) from students")), 0);
    });
  });
});

describe("Portées par rôle", () => {
  test("le parent ne voit que ses enfants", async () => {
    await as(USERS.parent, async (q) => {
      const students = await q("select first_name from students order by first_name");
      assert.deepEqual(students.map((s) => s.first_name), ["Aya", "Kofi"]);
      const guardians = await q("select id from guardians");
      assert.equal(guardians.length, 1, "le parent ne voit que sa propre fiche");
      const invoices = await q("select distinct student_id from invoices");
      assert.equal(invoices.length, 2);
      const payments = await q("select count(*) from payments");
      assert.ok(count(payments) >= 1);
    });
  });

  test("l'élève ne voit que son propre dossier", async () => {
    await as(null, async (q) => {
      await liftRestrictions(q);
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.student, role: "authenticated" }),
      ]);
      const students = await q("select first_name, last_name from students");
      assert.deepEqual(students, [{ first_name: "Kofi", last_name: "BAMBA" }]);
      const grades = await q("select distinct student_id from grades");
      assert.equal(grades.length, 1);
    });
  });

  test("les notes non publiées sont invisibles pour les familles", async () => {
    await as(null, async (q) => {
      await liftRestrictions(q);
      const hidden = await q(
        "update assessments set is_published = false where title = 'Interrogation écrite' returning id",
      );
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.parent, role: "authenticated" }),
      ]);
      const ids = hidden.map((a) => a.id);
      assert.equal(count(await q("select count(*) from grades where assessment_id = any($1)", [ids])), 0);
      assert.ok(count(await q("select count(*) from grades")) > 0, "les notes publiées restent visibles");
    });
  });

  test("l'enseignant ne voit que les élèves de ses classes", async () => {
    await as(USERS.teacher, async (q) => {
      const classes = await q(
        "select distinct c.name from enrollments e join classes c on c.id = e.class_id order by 1",
      );
      assert.deepEqual(classes.map((c) => c.name), ["6e A", "6e B"]);
      const students = count(await q("select count(*) from students"));
      assert.equal(students, 12);
      assert.equal(count(await q("select count(*) from payments")), 0, "aucun accès aux finances");
      assert.equal(count(await q("select count(*) from guardians")), 0);
    });
  });

  test("l'enseignant ne peut saisir des notes que dans ses matières", async () => {
    await as(USERS.teacher2, async (q) => {
      const [mathAssessment] = await q(
        `select a.id from assessments a join subjects s on s.id = a.subject_id where s.code = 'MATH' limit 1`,
      );
      assert.ok(mathAssessment, "l'enseignante voit les évaluations de sa classe (professeure principale ou matière)");
      const updated = await q("update grades set score = 20 where assessment_id = $1 returning id", [mathAssessment.id]);
      assert.equal(updated.length, 0);
    });
  });

  test("le comptable gère les paiements mais n'accède pas aux notes", async () => {
    await as(USERS.accountant, async (q) => {
      assert.equal(count(await q("select count(*) from grades")), 0);
      assert.ok(count(await q("select count(*) from payments")) > 0);
      const updated = await q("update grades set score = 20 returning id");
      assert.equal(updated.length, 0);
    });
  });

  test("le secrétariat ne peut pas valider une inscription", async () => {
    await as(USERS.secretary, async (q) => {
      const message = await rejects(
        q("update enrollments set status = 'validated' where status = 'pending'"),
      );
      assert.match(message, /enrollments\.validate/);
    });
  });

  test("la direction valide une inscription et l'élève devient actif", async () => {
    await as(USERS.director, async (q) => {
      const [row] = await q(
        "update enrollments set status = 'validated' where status = 'pending' returning student_id, decided_by",
      );
      assert.equal(row.decided_by, USERS.director);
      const [student] = await q("select status from students where id = $1", [row.student_id]);
      assert.equal(student.status, "active");
    });
  });

  test("pas d'escalade de privilèges par attribution de rôle", async () => {
    await as(null, async (q) => {
      // On donne users.manage à la direction pour le test, sans roles.manage.
      await q(
        `insert into role_permissions (role_id, permission_code)
         select id, 'users.manage' from roles where organization_id = $1 and key = 'director'`,
        [ORG_DEMO],
      );
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.director, role: "authenticated" }),
      ]);
      const message = await rejects(
        q(
          `insert into membership_roles (organization_id, membership_id, role_id)
           select $1, m.id, r.id from memberships m, roles r
           where m.organization_id = $1 and m.user_id = $2 and r.organization_id = $1 and r.key = 'org_admin'`,
          [ORG_DEMO, USERS.secretary],
        ),
      );
      assert.match(message, /permissions que vous ne possédez pas/);
    });
  });

  test("un utilisateur ne peut pas réactiver son compte désactivé", async () => {
    await as(USERS.teacher, async (q) => {
      assert.match(await rejects(q("update profiles set is_active = true where id = $1", [USERS.teacher])), /permission denied/);
    });
  });

  test("un compte suspendu perd tout accès", async () => {
    await as(null, async (q) => {
      await q("update memberships set status = 'suspended' where user_id = $1", [USERS.accountant]);
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.accountant, role: "authenticated" }),
      ]);
      assert.equal(count(await q("select count(*) from payments")), 0);
      assert.equal(count(await q("select count(*) from organizations")), 0);
    });
  });
});

describe("Invariants métier", () => {
  test("matricule généré, unique et non modifiable", async () => {
    await as(USERS.secretary, async (q) => {
      const [student] = await q(
        "insert into students (organization_id, first_name, last_name, matricule) values ($1, 'Test', 'MATRICULE', 'PIRATE') returning id, matricule",
        [ORG_DEMO],
      );
      assert.match(student.matricule, /^DEMO-\d{2}-\d{5}$/);
      assert.match(
        await rejects(q("update students set matricule = 'X' where id = $1", [student.id])),
        /permanent/,
      );
    });
  });

  test("paiement : reliquat calculé, dépassement refusé, suppression impossible", async () => {
    await as(USERS.accountant, async (q) => {
      const [invoice] = await q(
        "select invoice_id, balance from invoice_balances where payment_status = 'partial' order by number limit 1",
      );
      const [payment] = await q(
        "insert into payments (organization_id, invoice_id, amount, method) values ($1, $2, 1000, 'cash') returning number, balance_after, received_by_name",
        [ORG_DEMO, invoice.invoice_id],
      );
      assert.match(payment.number, /^REC-DEMO-\d{2}-\d{6}$/);
      assert.equal(Number(payment.balance_after), Number(invoice.balance) - 1000);
      assert.equal(payment.received_by_name, "Serge YAO");
      assert.match(
        await rejects(
          q("insert into payments (organization_id, invoice_id, amount, method) values ($1, $2, 99999999, 'cash')", [
            ORG_DEMO,
            invoice.invoice_id,
          ]),
        ),
        /dépasse le reliquat/,
      );
      const deleted = await q("delete from payments returning id");
      assert.equal(deleted.length, 0);
      assert.match(
        await rejects(q("update payments set amount = 1 where number = $1", [payment.number])),
        /ne peut pas être modifié/,
      );
    });
  });

  test("note supérieure au barème refusée ; période verrouillée figée", async () => {
    await as(USERS.teacher, async (q) => {
      const [grade] = await q(
        `select g.id from grades g join assessments a on a.id = g.assessment_id
         join subjects s on s.id = a.subject_id where s.code = 'MATH' limit 1`,
      );
      assert.match(await rejects(q("update grades set score = 25 where id = $1", [grade.id])), /dépasse le barème/);
    });
    await as(null, async (q) => {
      await q("update academic_periods set is_locked = true where name = '1er trimestre'");
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: USERS.teacher, role: "authenticated" }),
      ]);
      const [grade] = await q("select id from grades limit 1");
      assert.match(await rejects(q("update grades set score = 10 where id = $1", [grade.id])), /verrouillée/);
    });
  });

  test("emploi du temps : conflit enseignant détecté", async () => {
    await as(null, async (q) => {
      const [slot] = await q(
        "select * from timetable_slots where teacher_id is not null order by weekday, starts_at limit 1",
      );
      const [otherClass] = await q("select id from classes where name = '6e B'");
      // La 6e B est libérée ce jour-là : seul le conflit ENSEIGNANT peut être levé.
      await q("delete from timetable_slots where class_id = $1 and weekday = $2", [otherClass.id, slot.weekday]);
      const message = await rejects(
        q(
          `insert into timetable_slots (organization_id, academic_year_id, class_id, teacher_id, weekday, starts_at, ends_at)
           values ($1, $2, $3, $4, $5, '09:00', '11:00')`,
          [ORG_DEMO, slot.academic_year_id, otherClass.id, slot.teacher_id, slot.weekday],
        ),
      );
      assert.match(message, /timetable_no_teacher_overlap/);
    });
  });

  test("journal d'audit inaltérable et alimenté", async () => {
    await as(USERS.admin, async (q) => {
      assert.ok(count(await q("select count(*) from audit_logs")) > 0);
      assert.match(await rejects(q("delete from audit_logs")), /permission denied/);
    });
    await as(null, async (q) => {
      assert.match(await rejects(q("update audit_logs set action = 'x'")), /inaltérable/);
    });
  });

  test("notifications créées pour la famille lors d'un paiement", async () => {
    await as(null, async (q) => {
      const rows = await q(
        "select count(*) from notifications where user_id = $1 and type = 'payment.received'",
        [USERS.parent],
      );
      assert.ok(count(rows) >= 1);
    });
  });
});

describe("Vérification publique et recherche", () => {
  test("un document émis se vérifie sans exposer de données personnelles", async () => {
    let code;
    await as(null, async (q) => {
      const [student] = await q("select id from students where first_name = 'Kofi'");
      const [doc] = await q(
        `insert into issued_documents (organization_id, kind, title, student_id)
         values ($1, 'school_certificate', 'Certificat de scolarité', $2) returning verification_code`,
        [ORG_DEMO, student.id],
      );
      code = doc.verification_code;
      await q("set local role anon");
      const [result] = await q("select * from verify_document($1)", [code]);
      assert.equal(result.status, "valid");
      assert.equal(result.holder, "K. BAMBA");
      assert.equal(result.organization_name, "Groupe Scolaire Démo NéoScol");
      assert.deepEqual(Object.keys(result).sort(), [
        "expires_at", "holder", "issued_at", "kind", "number", "organization_city", "organization_name", "status", "title",
      ]);
    });
    await as("anon", async (q) => {
      const [unknown] = await q("select status from verify_document('INCONNU')");
      assert.equal(unknown.status, "not_found");
    });
  });

  test("la recherche globale respecte la RLS", async () => {
    await as(USERS.secretary, async (q) => {
      const rows = await q("select * from global_search($1, 'bamba')", [ORG_DEMO]);
      assert.ok(rows.some((r) => r.entity_type === "student"));
    });
    await as(USERS.teacher2, async (q) => {
      const rows = await q("select * from global_search($1, 'bamba')", [ORG_DEMO]);
      assert.ok(rows.every((r) => r.entity_type === "student"), "pas de parents ni de paiements pour l'enseignante");
    });
    await as(USERS.otherOrgAdmin, async (q) => {
      const rows = await q("select * from global_search($1, 'bamba')", [ORG_DEMO]);
      assert.equal(rows.length, 0);
    });
  });

  test("le tableau de bord n'expose que les indicateurs autorisés", async () => {
    await as(USERS.accountant, async (q) => {
      const [{ dashboard_overview: d }] = await q("select dashboard_overview($1)", [ORG_DEMO]);
      assert.ok("outstanding_total" in d);
      assert.ok(!("average_by_class" in d));
    });
    await as(USERS.admin, async (q) => {
      const [{ dashboard_overview: d }] = await q("select dashboard_overview($1)", [ORG_DEMO]);
      assert.equal(d.students_active, 24, "le prospect en attente n'est pas compté");
      assert.equal(d.enrollments_pending, 1);
    });
    await as(USERS.otherOrgAdmin, async (q) => {
      assert.match(await rejects(q("select dashboard_overview($1)", [ORG_DEMO])), /non autorisé/);
    });
  });

  test("la synthèse des factures suit les droits financiers", async () => {
    await as(USERS.accountant, async (q) => {
      const rows = await q("select payment_status, invoices from invoice_status_summary($1) order by 1", [ORG_DEMO]);
      assert.deepEqual(
        rows.map((r) => [r.payment_status, Number(r.invoices)]),
        [["paid", 6], ["partial", 12], ["unpaid", 6]],
      );
    });
    await as(USERS.teacher, async (q) => {
      assert.equal((await q("select * from invoice_status_summary($1)", [ORG_DEMO])).length, 0);
    });
  });
});
