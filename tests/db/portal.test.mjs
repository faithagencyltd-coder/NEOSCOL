// Portails (restrictions d'impayé, comptes), finance (dépenses, rappels),
// cycle de vie des élèves, fichiers, audit.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const kofiId = async (q) => (await q("select id from students where first_name = 'Kofi' and last_name = 'BAMBA'"))[0].id;

describe("Restrictions en cas d'impayé", () => {
  test("parent : notes et bulletins restreints, présences TOUJOURS visibles, puis rétablis dès le paiement", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.director);
      const [period] = await q("select id from academic_periods where name = '1er trimestre'");
      const [klass] = await q("select id from classes where name = '6e A'");
      await q("select compute_report_cards($1, $2)", [klass.id, period.id]);
      await q("update report_cards set status = 'published' where class_id = $1", [klass.id]);

      await switchTo(q, USERS.parent);
      const [{ portal_status: status }] = await q("select portal_status($1)", [kofi]);
      assert.equal(status.restricted, true);
      assert.equal(status.features.attendance, false, "les présences ne sont jamais restreintes");
      assert.equal(Number(status.overdue_amount), 97000);
      assert.equal((await q("select id from grades where student_id = $1", [kofi])).length, 0);
      assert.equal((await q("select id from report_cards where student_id = $1", [kofi])).length, 0);
      assert.ok((await q("select id from attendance_records where student_id = $1", [kofi])).length > 0, "présences visibles");
      assert.ok((await q("select id from invoices where student_id = $1", [kofi])).length > 0, "informations d'impayé visibles");
      assert.ok((await q("select id from students where id = $1", [kofi])).length === 1, "aucune donnée supprimée");

      // Paiement enregistré à l'administration → rétabli IMMÉDIATEMENT.
      await switchTo(q, USERS.accountant);
      const [invoice] = await q("select id from invoices where student_id = $1 and status = 'issued'", [kofi]);
      await q("insert into payments (organization_id, invoice_id, amount, method) values ($1, $2, 97000, 'cash')", [ORG_DEMO, invoice.id]);

      await switchTo(q, USERS.parent);
      assert.equal((await q("select portal_status($1) as s", [kofi]))[0].s.restricted, false);
      assert.ok((await q("select id from grades where student_id = $1", [kofi])).length > 0);
      assert.equal((await q("select id from report_cards where student_id = $1", [kofi])).length, 1);
      const restored = await q("select title from notifications where type = 'portal.restored' and data->>'student_id' = $1", [kofi]);
      assert.equal(restored.length, 1);
    });
  });

  test("l'élève subit les mêmes restrictions ; dérogation par l'administration", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.student);
      assert.equal((await q("select id from grades")).length, 0);
      assert.ok((await q("select id from attendance_records")).length > 0);
      assert.match(
        await rejects(q("insert into portal_access_overrides (student_id, organization_id, mode, reason) values ($1, $2, 'unrestricted', 'Test')", [kofi, ORG_DEMO])),
        /row-level security/,
      );
      await switchTo(q, USERS.secretary);
      await q("insert into portal_access_overrides (student_id, organization_id, mode, reason) values ($1, $2, 'unrestricted', 'Échéancier accordé')", [kofi, ORG_DEMO]);
      await switchTo(q, USERS.student);
      assert.ok((await q("select id from grades")).length > 0, "dérogation appliquée immédiatement");
      await switchTo(q, USERS.admin);
      const [log] = await q("select action from audit_logs where entity_type = 'portal_access_overrides' order by id desc limit 1");
      assert.equal(log.action, "portal_access_overrides.insert");
    });
  });

  test("les appels non validés ne sont pas visibles des familles", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      const [klass] = await q("select id from classes where name = '6e A'");
      await switchTo(q, USERS.admin);
      const [{ record_attendance: session }] = await q(
        "select record_attendance($1, current_date, '17:00', '18:00', null, $2)",
        [klass.id, JSON.stringify([{ student_id: kofi, status: "absent" }])],
      );
      await switchTo(q, USERS.parent);
      assert.equal((await q("select id from attendance_records where session_id = $1", [session])).length, 0);
    });
  });
});

describe("Comptes portail", () => {
  test("activation par le secrétariat (portal_access.manage), refusée à la comptabilité", async () => {
    await as(null, async (q) => {
      const [guardian] = await q(
        "select g.id from guardians g where g.user_id is null and g.organization_id = $1 order by g.last_name limit 1",
        [ORG_DEMO],
      );
      const newUser = "00000000-0000-4000-a000-0000000000aa";
      await q("insert into auth.users (id, phone, email) values ($1, '+2250799999999', null)", [newUser]);
      await switchTo(q, USERS.accountant);
      assert.match(await rejects(q("select grant_portal_access('guardian', $1, $2)", [guardian.id, newUser])), /portal_access\.manage/);
      await switchTo(q, USERS.secretary);
      await q("select grant_portal_access('guardian', $1, $2)", [guardian.id, newUser]);
      await switchTo(q, newUser);
      const kids = await q("select id from students");
      assert.equal(kids.length, 1, "le nouveau parent voit son enfant");
      await switchTo(q, USERS.secretary);
      await q("select set_portal_account_status('guardian', $1, false)", [guardian.id]);
      await switchTo(q, newUser);
      assert.equal((await q("select id from students")).length, 0, "compte suspendu : plus d'accès");
    });
  });
});

describe("Rappels et notifications d'impayés", () => {
  test("rappels d'impayé envoyés une fois par intervalle ; réservés aux finances", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select send_invoice_reminders($1)", [ORG_DEMO])), /finance\.invoices\.manage/);
      await switchTo(q, USERS.accountant);
      const [{ send_invoice_reminders: first }] = await q("select send_invoice_reminders($1)", [ORG_DEMO]);
      assert.ok(first.overdue >= 1);
      const [{ send_invoice_reminders: second }] = await q("select send_invoice_reminders($1)", [ORG_DEMO]);
      assert.equal(second.overdue, 0, "pas de doublon dans l'intervalle");
      await switchTo(q, USERS.parent);
      const [notice] = await q("select title, body from notifications where type = 'invoice.overdue'");
      assert.match(notice.title, /Impayé : 97 000 FCFA en retard/);
      assert.match(notice.body, /reste dû 205 000 FCFA/);
      assert.match(notice.body, /présences restent consultables/);
      assert.ok((await q("select id from invoice_reminders")).length >= 1, "historique visible par la famille");
    });
  });

  test("une facture émise est notifiée à la famille", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.accountant);
      const [invoice] = await q("insert into invoices (organization_id, student_id, due_on) values ($1, $2, current_date + 30) returning id", [ORG_DEMO, kofi]);
      await q("insert into invoice_lines (organization_id, invoice_id, description, unit_amount) values ($1, $2, 'Tenue scolaire', 15000)", [ORG_DEMO, invoice.id]);
      await q("update invoices set status = 'issued' where id = $1", [invoice.id]);
      await switchTo(q, USERS.parent);
      const [notice] = await q("select title from notifications where type = 'invoice.issued'");
      assert.match(notice.title, /^Nouvelle facture FAC-DEMO-/);
    });
  });
});

describe("Dépenses", () => {
  test("enregistrer, annuler (motif), supprimer selon permissions, justificatif protégé", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.accountant);
      const [category] = await q("select id from expense_categories where name = 'Transport'");
      const [file] = await q(
        "insert into file_objects (organization_id, bucket, path, owner_type, file_name, mime_type, size_bytes, content) values ($1, 'database', $2, 'expense', 'recu.pdf', 'application/pdf', 4, '\\x25504446') returning id, sha256",
        [ORG_DEMO, `${ORG_DEMO}/expense/recu.pdf`],
      );
      assert.match(file.sha256, /^[0-9a-f]{64}$/);
      const [expense] = await q(
        "insert into expenses (organization_id, category_id, label, amount, supplier, payment_method, receipt_file_id) values ($1, $2, 'Carburant du car scolaire', 30000, 'Station Démo', 'cash', $3) returning id, number",
        [ORG_DEMO, category.id, file.id],
      );
      assert.match(expense.number, /^DEP-DEMO-\d{2}-\d{5}$/);
      const [linked] = await q("select owner_id from file_objects where id = $1", [file.id]);
      assert.equal(linked.owner_id, expense.id);
      await q("update expenses set amount = 32000 where id = $1", [expense.id]);
      assert.match(await rejects(q("update expenses set status = 'cancelled' where id = $1", [expense.id])), /cancelled_reason|motif/);
      await q("update expenses set status = 'cancelled', cancelled_reason = 'Doublon' where id = $1", [expense.id]);
      assert.match(await rejects(q("update expenses set amount = 1 where id = $1", [expense.id])), /annulée/);
      assert.equal((await q("delete from expenses where id = $1 returning id", [expense.id])).length, 0, "suppression refusée à la comptabilité");

      await switchTo(q, USERS.parent);
      assert.equal((await q("select id from file_objects where id = $1", [file.id])).length, 0);
      assert.equal((await q("select id from expenses")).length, 0);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from expenses")).length, 0);

      await switchTo(q, USERS.admin);
      assert.equal((await q("delete from expenses where id = $1 returning id", [expense.id])).length, 1);
      const [log] = await q("select actor_role from audit_logs where action = 'expenses.delete' order by id desc limit 1");
      assert.equal(log.actor_role, "Administrateur");
    });
  });
});

describe("Cycle de vie des élèves", () => {
  test("retrait : statut, motif, inscription annulée ; audit", async () => {
    await as(null, async (q) => {
      const [student] = await q("select s.id from students s join enrollments e on e.student_id = s.id where s.first_name <> 'Kofi' and e.status = 'validated' and s.organization_id = $1 limit 1", [ORG_DEMO]);
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select change_student_status($1, 'withdrawn', 'Déménagement')", [student.id])), /students\.archive/);
      await switchTo(q, USERS.secretary);
      await q("select change_student_status($1, 'withdrawn', 'Déménagement')", [student.id]);
      const [row] = await q("select status, status_reason from students where id = $1", [student.id]);
      assert.deepEqual(row, { status: "withdrawn", status_reason: "Déménagement" });
      assert.equal((await q("select id from enrollments where student_id = $1 and status = 'validated'", [student.id])).length, 0);
      await switchTo(q, USERS.admin);
      const [log] = await q("select action, result from audit_logs where action = 'student.status_withdrawn' limit 1");
      assert.deepEqual(log, { action: "student.status_withdrawn", result: "success" });
    });
  });

  test("suppression définitive contrôlée : archivage, confirmation, pièces financières conservées", async () => {
    await as(null, async (q) => {
      const [prospect] = await q("select id, matricule from students where first_name = 'Prisca' and status = 'prospect'");
      const kofi = await kofiId(q);
      const [kofiRow] = await q("select matricule from students where id = $1", [kofi]);
      await switchTo(q, USERS.secretary);
      assert.match(await rejects(q("select delete_student($1, $2)", [prospect.id, prospect.matricule])), /students\.delete/);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select delete_student($1, $2)", [prospect.id, prospect.matricule])), /Archivez/);
      await q("update students set archived_at = now() where id = any($1)", [[prospect.id, kofi]]);
      assert.match(await rejects(q("select delete_student($1, 'MAUVAIS')", [prospect.id])), /matricule exact/);
      assert.match(await rejects(q("select delete_student($1, $2)", [kofi, kofiRow.matricule])), /conservation/);
      await q("select delete_student($1, $2)", [prospect.id, prospect.matricule]);
      assert.equal((await q("select id from students where id = $1", [prospect.id])).length, 0);
      const [log] = await q("select actor_role, summary from audit_logs where action = 'student.delete' limit 1");
      assert.match(log.summary, /Prisca/);
      assert.equal(log.actor_role, "Administrateur");
    });
  });
});

describe("Audit applicatif", () => {
  test("log_event enregistre le rôle et le résultat", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.teacher);
      await q("select log_event('document.download_denied', $1, 'report_cards', null, 'Téléchargement refusé', '{}', 'denied')", [ORG_DEMO]);
      assert.match(await rejects(q("select log_event('hack.x', $1)", [ORG_DEMO])), /non autorisée/);
      await switchTo(q, USERS.admin);
      const [log] = await q("select actor_role, result from audit_logs where action = 'document.download_denied'");
      assert.deepEqual(log, { actor_role: "Enseignant / Formateur", result: "denied" });
    });
  });
});

describe("Documents émis", () => {
  test("révocation motivée par documents.revoke ; le document reste figé", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.secretary);
      const [doc] = await q(
        "insert into issued_documents (organization_id, kind, title, student_id, subject_type, subject_id, data) values ($1, 'school_certificate', 'Certificat', $2, 'student', $2, '{}') returning id, number",
        [ORG_DEMO, kofi],
      );
      assert.match(doc.number, /^DOC-DEMO-\d{2}-\d{6}$/);
      assert.match(await rejects(q("update issued_documents set title = 'Autre' where id = $1", [doc.id])), /ne peut pas être modifié/);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("update issued_documents set status = 'revoked', revoked_reason = 'x' where id = $1 returning id", [doc.id])).length, 0);
      await switchTo(q, USERS.director);
      await q("update issued_documents set status = 'revoked', revoked_reason = 'Erreur de saisie' where id = $1", [doc.id]);
      const [{ verify_document: status }] = await q("select (verify_document(verification_code)).status as verify_document from issued_documents where id = $1", [doc.id]);
      assert.equal(status, "revoked");
    });
  });
});

describe("Lectures du portail", () => {
  test("enfants, matières et enseignants, emploi du temps soumis à la restriction ; aucun accès hors famille", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.parent);
      const children = await q("select first_name, class_name, is_self from portal_students($1)", [ORG_DEMO]);
      assert.deepEqual(children.map((c) => c.first_name).sort(), ["Aya", "Kofi"]);
      assert.ok(children.every((c) => c.class_name && !c.is_self));
      const subjects = await q("select subject, teacher from portal_class_subjects($1)", [kofi]);
      assert.ok(subjects.length > 0 && subjects.some((s) => s.teacher), "matières avec enseignant");
      assert.equal((await q("select count(*)::int as n from staff_members"))[0].n, 0, "le personnel reste illisible");
      // Kofi est en impayé : emploi du temps restreint si l'établissement le décide.
      await switchTo(q, USERS.admin);
      await q("update organizations set settings = jsonb_set(settings, '{portal_restrictions,features,timetable}', 'true') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.parent);
      assert.equal((await q("select id from portal_timetable($1)", [kofi])).length, 0);
      await switchTo(q, USERS.admin);
      await q("update organizations set settings = jsonb_set(settings, '{portal_restrictions,features,timetable}', 'false') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.parent);
      assert.ok((await q("select id from portal_timetable($1)", [kofi])).length > 0);

      await switchTo(q, USERS.student);
      const self = await q("select first_name, is_self from portal_students($1)", [ORG_DEMO]);
      assert.deepEqual(self, [{ first_name: "Kofi", is_self: true }]);
      const [aya] = await q("select id from students where first_name = 'Aya'");
      assert.equal(aya, undefined);
      await switchTo(q, USERS.director);
      const [ayaId] = await q("select id from students where first_name = 'Aya'");
      await switchTo(q, USERS.student);
      assert.match(await rejects(q("select * from portal_class_subjects($1)", [ayaId.id])), /non autorisé/);
      assert.match(await rejects(q("select * from portal_timetable($1)", [ayaId.id])), /non autorisé/);
    });
  });

  test("état du compte portail visible de l'administration, pas des familles", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.secretary);
      const [{ portal_account: account }] = await q("select portal_account('student', $1)", [kofi]);
      assert.equal(account.has_account, true);
      assert.equal(account.status, "active");
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select portal_account('student', $1)", [kofi])), /non autorisé/);
    });
  });
});

describe("Élève archivé", () => {
  test("portail désactivé (élève et parents), historique conservé, accès rendu à la restauration", async () => {
    await as(null, async (q) => {
      const kofi = await kofiId(q);
      await switchTo(q, USERS.secretary);
      await q("update students set archived_at = now() where id = $1", [kofi]);

      await switchTo(q, USERS.student);
      assert.equal((await q("select id from students")).length, 0, "l'élève archivé ne voit plus son dossier");
      assert.equal((await q("select id from attendance_records")).length, 0);
      await switchTo(q, USERS.parent);
      const kids = await q("select first_name from students");
      assert.deepEqual(kids.map((k) => k.first_name), ["Aya"], "le parent ne voit plus l'enfant archivé");

      await switchTo(q, null);
      const [membership] = await q("select status from memberships where user_id = $1", [USERS.student]);
      assert.equal(membership.status, "suspended", "compte élève suspendu");
      await switchTo(q, USERS.director);
      assert.ok((await q("select id from attendance_records where student_id = $1", [kofi])).length > 0, "historique conservé");
      assert.ok((await q("select id from payments where student_id = $1", [kofi])).length >= 0);
      assert.ok((await q("select id from invoices where student_id = $1", [kofi])).length > 0);

      await switchTo(q, USERS.secretary);
      await q("update students set archived_at = null where id = $1", [kofi]);
      await switchTo(q, null);
      assert.equal((await q("select status from memberships where user_id = $1", [USERS.student]))[0].status, "active");
      await switchTo(q, USERS.student);
      assert.equal((await q("select id from students")).length, 1, "accès rétabli après restauration");
    });
  });
});
