// Tests de sécurité et d'invariants exécutés contre un vrai PostgreSQL.
// Pré-requis : `npm run db:reset` (émulation Supabase + migrations + seed).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

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
      // Tout ce qui est visible appartient à SON établissement (apprenants, paiements du centre).
      assert.ok(count(await q("select count(*) from students")) >= 1);
      assert.equal(count(await q("select count(*) from students where organization_id <> $1", [ORG_DEMOF])), 0);
      assert.equal(count(await q("select count(*) from payments where organization_id <> $1", [ORG_DEMOF])), 0);
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

  test("aucune table ne fuit vers l'autre établissement (lecture, dans les deux sens)", async () => {
    const tables = await as(null, (q) =>
      q(`select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
          where c.table_schema = 'public' and c.column_name = 'organization_id' order by 1`),
    );
    assert.ok(tables.length > 40, `tables multi-établissements trouvées : ${tables.length}`);
    for (const [user, foreign] of [[USERS.otherOrgAdmin, ORG_DEMO], [USERS.admin, ORG_DEMOF]]) {
      await as(user, async (q) => {
        for (const { table_name } of tables) {
          try {
            const [{ count: n }] = await q(`select count(*) from public."${table_name}" where organization_id = $1`, [foreign]);
            assert.equal(Number(n), 0, `${table_name} : ${n} ligne(s) de l'autre établissement visibles`);
          } catch (error) {
            if (!/permission denied/.test(String(error.message))) throw error;
          }
        }
      });
    }
  });

  test("écritures inter-établissements refusées : dépenses, personnel, fichiers, notifications, documents, annonces", async () => {
    await as(USERS.otherOrgAdmin, async (q) => {
      const attempts = [
        ["expenses", "insert into expenses (organization_id, label, amount, spent_on, category_id) select $1, 'x', 1, current_date, id from expense_categories where organization_id = $1 limit 1"],
        ["staff_members", "insert into staff_members (organization_id, first_name, last_name) values ($1, 'X', 'Y')"],
        ["file_objects", "insert into file_objects (organization_id, bucket, path, owner_type, file_name, mime_type, size_bytes, content) values ($1, 'database', '10000000-0000-4000-a000-000000000001/organization/x', 'organization', 'x.png', 'image/png', 4, decode('89504e47', 'hex'))"],
        ["notifications", "insert into notifications (organization_id, user_id, type, title) values ($1, auth.uid(), 'x', 'x')"],
        ["announcements", "insert into announcements (organization_id, title, body, published_at) values ($1, 'x', 'y', now())"],
        ["document_templates", "insert into document_templates (organization_id, kind, name) values ($1, 'custom', 'x')"],
        ["fee_types", "insert into fee_types (organization_id, name, code) values ($1, 'x', 'X')"],
      ];
      for (const [table, sql] of attempts) {
        let refused = false;
        try {
          const rows = await q(sql, [ORG_DEMO]);
          refused = rows.length === 0 && table === "expenses"; // aucune catégorie visible : rien à insérer
        } catch (error) {
          refused = /row-level security|permission denied|violates/.test(String(error.message));
        }
        assert.ok(refused, `${table} : écriture inter-établissements acceptée`);
      }
      // Mises à jour / suppressions : aucune ligne atteinte.
      for (const table of ["expenses", "staff_members", "issued_documents", "notifications", "audit_logs", "invoices", "payments"]) {
        try {
          const rows = await q(`delete from public."${table}" where organization_id = $1 returning 1`, [ORG_DEMO]);
          assert.equal(rows.length, 0, `${table} : suppression inter-établissements`);
        } catch (error) {
          assert.match(String(error.message), /permission denied|row-level security|interdit|immuable|ne peut/i, `${table} : ${error.message}`);
        }
      }
    });
  });

  test("le visiteur anonyme n'accède à aucune table", async () => {
    await as("anon", async (q) => {
      assert.match(await rejects(q("select count(*) from students")), /permission denied/);
      assert.match(await rejects(q("select count(*) from organizations")), /permission denied/);
    });
  });

  test("le super administrateur n'a pas d'accès implicite aux élèves", async () => {
    await as(USERS.superadmin, async (q) => {
      assert.equal((await q("select id from organizations")).length, 3);
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

describe("Plateforme (Super administrateur)", () => {
  test("création d'un établissement et de son administrateur réservée à la plateforme", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select * from platform_overview()")), /plateforme/);
      assert.match(await rejects(q("select create_organization('Pirate', 'PIR', 'pirate', 'high_school')")), /plateforme/);
      assert.equal((await q("select is_platform_admin() as a"))[0].a, false);

      await switchTo(q, USERS.superadmin);
      const [{ create_organization: orgId }] = await q("select create_organization('Lycée Test Audit', 'LTA', 'lycee-test-audit', 'high_school', 'Yamoussoukro')");
      const overview = await q("select name, status from platform_overview() where id = $1", [orgId]);
      assert.deepEqual(overview, [{ name: "Lycée Test Audit", status: "active" }]);
      await q("select platform_add_org_admin($1, $2)", [orgId, USERS.teacher2]);

      // Le nouvel administrateur ne voit que son établissement.
      await switchTo(q, USERS.teacher2);
      assert.ok((await q("select my_permissions($1) as p", [orgId]))[0].p.includes("settings.manage"));
      // Rôles provisionnés automatiquement
      assert.ok((await q("select count(*)::int n from roles where organization_id = $1", [orgId]))[0].n >= 9);
      assert.equal((await q("select count(*)::int n from students where organization_id = $1", [orgId]))[0].n, 0);
      // Et l'administrateur de A ne voit rien de B.
      await switchTo(q, USERS.admin);
      assert.equal((await q("select id from organizations where id = $1", [orgId])).length, 0);
      await switchTo(q, USERS.teacher2);
      assert.match(await rejects(q("select platform_add_org_admin($1, $2)", [orgId, USERS.parent])), /plateforme/);
    });
  });
});

describe("Rapports", () => {
  test("agrégats réservés à reports.read (finances : reports.finance), jamais inter-établissements", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      const [{ report_section: effectifs }] = await q("select report_section($1, 'effectifs')", [ORG_DEMO]);
      assert.ok(effectifs.total > 0 && effectifs.rows.length >= 4);
      const [{ report_section: finances }] = await q("select report_section($1, 'finances')", [ORG_DEMO]);
      assert.ok(finances.rows.length > 0 && Array.isArray(finances.par_mois));
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select report_section($1, 'effectifs')", [ORG_DEMO])), /reports\.read/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select report_section($1, 'resultats')", [ORG_DEMO])), /reports\.read/);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select report_section($1, 'finances')", [ORG_DEMO])), /reports/);
    });
  });
});

describe("Communication", () => {
  test("messagerie : contacts limités par rôle, réponses des familles, notifications", async () => {
    await as(null, async (q) => {
      // L'enseignant (maths 6e A / 6e B) peut écrire aux familles de SES élèves (Kofi, 6e A) mais pas d'Aya (5e A).
      await switchTo(q, USERS.teacher);
      const contacts = await q("select user_id, kind from message_contacts($1)", [ORG_DEMO]);
      assert.ok(contacts.some((c) => c.user_id === USERS.parent), "parent de Kofi joignable");
      assert.ok(contacts.some((c) => c.user_id === USERS.director), "personnel joignable");
      const [{ start_thread: thread }] = await q("select start_thread($1, 'Devoir de maths', 'Bonjour, Kofi doit rendre son devoir.', $2)", [ORG_DEMO, [USERS.parent]]);
      // Aucun destinataire hors de ses contacts (élève d'une autre organisation).
      assert.match(await rejects(q("select start_thread($1, 'x', 'y', $2)", [ORG_DEMO, [USERS.otherOrgAdmin]])), /contacts autorisés/);

      await switchTo(q, USERS.parent);
      const [notif] = await q("select link from notifications where type = 'message.received' and data->>'thread_id' = $1", [thread]);
      assert.equal(notif.link, `/portail/messages?fil=${thread}`);
      await q("insert into messages (organization_id, thread_id, body) values ($1, $2, 'Merci, c''est noté.')", [ORG_DEMO, thread]);
      assert.equal((await q("select id from messages where thread_id = $1", [thread])).length, 2);
      assert.match(await rejects(q("select start_thread($1, 'x', 'y', $2)", [ORG_DEMO, [USERS.teacher]])), /communication\.message/);

      // Personne d'autre ne lit la conversation.
      await switchTo(q, USERS.accountant);
      assert.equal((await q("select id from messages where thread_id = $1", [thread])).length, 0);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from message_threads where id = $1", [thread])).length, 0);
    });
  });

  test("annonce publiée : notification des seuls destinataires ciblés", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.director);
      const [c5a] = await q("select id from classes where name = '5e A'");
      await q(
        "insert into announcements (organization_id, title, body, audience, published_at) values ($1, 'Sortie 5e A', 'Sortie au musée jeudi.', $2, now())",
        [ORG_DEMO, JSON.stringify({ personas: ["parent"], class_ids: [c5a.id] })],
      );
      await switchTo(q, null);
      const recipients = (await q("select user_id from notifications where type = 'announcement.published' and title like '%Sortie 5e A%'")).map((r) => r.user_id);
      assert.ok(recipients.includes(USERS.parent), "mère d'Aya (5e A) notifiée");
      assert.ok(!recipients.includes(USERS.teacher) && !recipients.includes(USERS.student), "enseignant et élève non ciblés");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("insert into announcements (organization_id, title, body, published_at) values ($1, 'x', 'y', now())", [ORG_DEMO])), /row-level security/);
    });
  });
});

describe("Frais et tarifs", () => {
  test("échéancier contrôlé en base ; seuls les gestionnaires des frais modifient les tarifs", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.accountant);
      const [{ id: year }] = await q("select id from academic_years where organization_id = $1 and is_current", [ORG_DEMO]);
      const [{ id: fee }] = await q("select id from fee_types where organization_id = $1 and code = 'CANT'", [ORG_DEMO]);
      const insert = (plan) =>
        q("insert into fee_rates (organization_id, academic_year_id, fee_type_id, amount, installment_plan) values ($1, $2, $3, 30000, $4) returning id", [ORG_DEMO, year, fee, JSON.stringify(plan)]);
      assert.match(await rejects(insert([{ label: "T1", due_on: "2026-10-01", percent: 50 }, { label: "T2", due_on: "2027-01-01", percent: 40 }])), /100 %/);
      assert.match(await rejects(insert([{ label: "T1", due_on: "2027-01-01", percent: 50 }, { label: "T2", due_on: "2026-10-01", percent: 50 }])), /chronologique/);
      const [{ id }] = await insert([{ label: "T1", due_on: "2026-10-01", percent: 50 }, { label: "T2", due_on: "2027-01-01", percent: 50 }]);
      assert.ok(id);
      // Secrétariat : lecture seule sur les tarifs.
      await switchTo(q, USERS.secretary);
      assert.equal((await q("update fee_rates set amount = 1 where id = $1 returning id", [id])).length, 0);
      // Autre établissement : invisible.
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from fee_rates where id = $1", [id])).length, 0);
    });
  });
});

describe("Document Studio", () => {
  test("modèles : écriture réservée à documents.templates.manage, isolés par établissement", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.director);
      const [{ id }] = await q(
        "insert into document_templates (organization_id, kind, name, layout) values ($1, 'custom', 'Autorisation de sortie', $2) returning id",
        [ORG_DEMO, JSON.stringify({ title: "AUTORISATION DE SORTIE", body: "{{eleve.prenom}} est autorisé(e) à sortir.", closing: "" })],
      );
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from document_templates where id = $1", [id])).length, 1, "lecture par les membres");
      assert.equal((await q("update document_templates set name = 'x' where id = $1 returning id", [id])).length, 0);
      assert.match(await rejects(q("insert into document_templates (organization_id, kind, name) values ($1, 'custom', 'x')", [ORG_DEMO])), /row-level security/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from document_templates where id = $1", [id])).length, 0);
      // Identité : un autre établissement ne modifie pas la charte graphique.
      assert.equal((await q("update organization_branding set primary_color = '#000000' where organization_id = $1 returning organization_id", [ORG_DEMO])).length, 0);
    });
  });
});

describe("Dossier 360° et périmètre enseignant", () => {
  test("enseignant : ses classes uniquement ; discipline gérée par l'administration, visible de la famille", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.teacher);
      const [{ my_class_ids: mine }] = await q("select my_class_ids($1)", [ORG_DEMO]);
      const names = (await q("select name from classes where id = any($1::uuid[]) order by name", [mine])).map((r) => r.name);
      assert.ok(names.includes("6e A"), "classe enseignée présente");
      assert.ok(!names.includes("5e A"), "classe non enseignée absente");
      const [kofi] = await q("select id from students where first_name = 'Kofi'");
      assert.match(await rejects(q("insert into conduct_records (organization_id, student_id, kind, title) values ($1, $2, 'reward', 'Bravo')", [ORG_DEMO, kofi.id])), /row-level security/);

      await switchTo(q, USERS.director);
      await q("insert into conduct_records (organization_id, student_id, kind, title) values ($1, $2, 'reward', 'Tableau d''honneur')", [ORG_DEMO, kofi.id]);
      await q("insert into student_previous_schools (organization_id, student_id, school_name, to_year) values ($1, $2, 'EPP Cocody', 2025)", [ORG_DEMO, kofi.id]);

      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from conduct_records where student_id = $1", [kofi.id])).length, 0);
      assert.equal((await q("select id from student_previous_schools where student_id = $1", [kofi.id])).length, 0);
      const [{ my_class_ids: other }] = await q("select my_class_ids($1)", [ORG_DEMO]);
      assert.equal(other.length, 0);
    });
  });
});

describe("Recherche globale", () => {
  test("enseignant : seules ses classes apparaissent dans la recherche", async () => {
    await as(USERS.teacher, async (q) => {
      const classes = (await q("select title from global_search($1, 'e A', 50) where entity_type = 'class'", [ORG_DEMO])).map((r) => r.title);
      assert.ok(classes.includes("6e A"), "classe enseignée trouvée");
      assert.ok(!classes.includes("5e A"), "classe non enseignée masquée");
    });
    await as(USERS.director, async (q) => {
      const classes = (await q("select title from global_search($1, 'e A', 50) where entity_type = 'class'", [ORG_DEMO])).map((r) => r.title);
      assert.ok(classes.includes("5e A"), "direction : toutes les classes");
    });
  });
});

describe("Université (LMD)", () => {
  test("crédits par unité d'enseignement et relevés du semestre isolés des autres établissements", async () => {
    await as("00000000-0000-4000-a000-000000000012", async (q) => {
      const [{ total }] = await q("select sum(s.credits)::int as total from class_subjects cs join subjects s on s.id = cs.subject_id join classes c on c.id = cs.class_id where c.name = 'L1 Informatique'");
      assert.equal(total, 30, "30 crédits ECTS au semestre");
      assert.equal((await q("select id from report_cards where status = 'published'")).length, 10);
      assert.equal((await q("select id from students where organization_id = $1", [ORG_DEMO])).length, 0);
    });
    await as(USERS.admin, async (q) => {
      assert.equal((await q("select rc.id from report_cards rc join classes c on c.id = rc.class_id where c.name = 'L1 Informatique'")).length, 0);
    });
  });
});
