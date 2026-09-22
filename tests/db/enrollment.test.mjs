// Parcours d'inscription : création atomique, validation, facture générée depuis les tarifs.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, USERS } from "./helpers.mjs";

after(() => pool.end());

async function context(q) {
  const [year] = await q("select id from academic_years where organization_id = $1 and is_current", [ORG_DEMO]);
  const [klass] = await q("select id from classes where organization_id = $1 and name = '5e A'", [ORG_DEMO]);
  return { year: year.id, klass: klass.id };
}

function newApplication({ year, klass }, overrides = {}) {
  return {
    type: "new",
    submit: true,
    academic_year_id: year,
    class_id: klass,
    student: { first_name: "Inès", last_name: "Kone", sex: "F", birth_date: "2014-05-02", city: "Abidjan" },
    guardian: { first_name: "Adjoua", last_name: "Bamba", relationship: "mother", phone: "+2250700000001" },
    form_data: { canteen: true },
    ...overrides,
  };
}

describe("Parcours d'inscription", () => {
  test("création atomique : élève prospect, parent réutilisé par téléphone, inscription en attente", async () => {
    await as(USERS.secretary, async (q) => {
      const ctx = await context(q);
      const [{ create_enrollment_application: id }] = await q("select create_enrollment_application($1, $2)", [
        ORG_DEMO,
        newApplication(ctx),
      ]);
      const [row] = await q(
        `select e.status, e.reference, s.status as student_status, s.last_name, s.matricule,
                (select count(*) from student_guardians sg where sg.student_id = s.id) as links,
                (select g.user_id from student_guardians sg join guardians g on g.id = sg.guardian_id where sg.student_id = s.id) as guardian_user
         from enrollments e join students s on s.id = e.student_id where e.id = $1`,
        [id],
      );
      assert.equal(row.status, "pending");
      assert.match(row.reference, /^INS-DEMO-\d{2}-\d{5}$/);
      assert.equal(row.student_status, "prospect");
      assert.equal(row.last_name, "KONE");
      assert.match(row.matricule, /^DEMO-\d{2}-\d{5}$/);
      assert.equal(Number(row.links), 1);
      assert.equal(row.guardian_user, USERS.parent, "le parent existant (même téléphone) est réutilisé");
    });
  });

  test("tout ou rien : une erreur annule l'élève déjà créé", async () => {
    await as(USERS.secretary, async (q) => {
      const ctx = await context(q);
      const before = Number((await q("select count(*) from students"))[0].count);
      await rejects(q("select create_enrollment_application($1, $2)", [ORG_DEMO, newApplication(ctx, { academic_year_id: null })]));
      const afterCount = Number((await q("select count(*) from students"))[0].count);
      assert.equal(afterCount, before);
    });
  });

  test("un enseignant ne peut pas créer de dossier d'inscription", async () => {
    await as(USERS.teacher, async (q) => {
      const ctx = await context(q);
      assert.match(
        await rejects(q("select create_enrollment_application($1, $2)", [ORG_DEMO, newApplication(ctx)])),
        /row-level security/,
      );
    });
  });

  test("validation par la direction : facture émise depuis les tarifs, échéancier cohérent", async () => {
    await as(null, async (q) => {
      const ctx = await context(q);
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.secretary, role: "authenticated" })]);
      const [{ create_enrollment_application: id }] = await q("select create_enrollment_application($1, $2)", [
        ORG_DEMO,
        newApplication(ctx),
      ]);
      assert.match(await rejects(q("select validate_enrollment($1, true)", [id])), /enrollments\.validate/);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.director, role: "authenticated" })]);
      const [{ validate_enrollment: result }] = await q("select validate_enrollment($1, true)", [id]);
      assert.ok(result.invoice_id);
      const [invoice] = await q("select status, total from invoices where id = $1", [result.invoice_id]);
      assert.equal(invoice.status, "issued");
      assert.equal(Number(invoice.total), 205000);
      const installments = await q("select amount from installments where invoice_id = $1 order by sequence", [result.invoice_id]);
      assert.deepEqual(installments.map((i) => Number(i.amount)), [97000, 54000, 54000]);
      const [student] = await q("select s.status from enrollments e join students s on s.id = e.student_id where e.id = $1", [id]);
      assert.equal(student.status, "active");
      assert.match(await rejects(q("select validate_enrollment($1, true)", [id])), /déjà traitée/);
    });
  });

  test("réinscription : pas de frais d'inscription", async () => {
    await as(USERS.director, async (q) => {
      const ctx = await context(q);
      const [student] = await q("select id from students where first_name = 'Kofi' and last_name = 'BAMBA'");
      const [{ create_enrollment_application: id }] = await q("select create_enrollment_application($1, $2)", [
        ORG_DEMO,
        { type: "reenrollment", submit: true, student_id: student.id, academic_year_id: ctx.year, class_id: ctx.klass, form_data: {} },
      ]);
      const preview = await q("select category, amount from enrollment_fee_preview($1)", [id]);
      assert.deepEqual(preview.map((p) => [p.category, Number(p.amount)]), [["tuition", 180000]]);
    });
  });
});
