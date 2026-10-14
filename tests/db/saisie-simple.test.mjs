// Saisie simple des notes : l'école fixe le nombre d'interrogations (INT) et de
// devoirs (DEV) par trimestre et par semestre ; l'enseignant choisit une case
// (INT 1, DEV 2…) et saisit les notes ; le bulletin affiche ces colonnes.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const num = (v) => (v === null || v === undefined ? null : Number(v));
let seq = 0;

/** Classe isolée (année propre, trimestres ou semestres, MATH ×4 et FR ×3, deux élèves). */
async function setup(q, system = "trimester") {
  seq += 1;
  const tag = `${process.pid}-${seq}`;
  const [year] = await q(
    "insert into academic_years (organization_id, name, starts_on, ends_on, status) values ($1, $2, '2032-09-01', '2033-07-15', 'planned') returning id",
    [ORG_DEMO, `SS ${tag}`],
  );
  const bounds =
    system === "semester"
      ? [["Semestre 1", "2032-09-01", "2033-01-31"], ["Semestre 2", "2033-02-01", "2033-07-15"]]
      : [["1er trimestre", "2032-09-01", "2032-12-20"], ["2e trimestre", "2033-01-05", "2033-03-31"], ["3e trimestre", "2033-04-07", "2033-07-15"]];
  const periods = [];
  for (const [i, [name, from, to]] of bounds.entries()) {
    const [p] = await q(
      "insert into academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on) values ($1, $2, $3, $4, $5, $6, $7) returning id",
      [ORG_DEMO, year.id, name, system, i + 1, from, to],
    );
    periods.push(p.id);
  }
  const [klass] = await q("insert into classes (organization_id, academic_year_id, name) values ($1, $2, $3) returning id", [ORG_DEMO, year.id, `SS ${tag}`]);
  const subjects = {};
  for (const [code, coefficient] of [["MATH", 4], ["FR", 3]]) {
    const [cs] = await q(
      `insert into class_subjects (organization_id, class_id, subject_id, coefficient)
       select $1, $2, id, $4 from subjects where organization_id = $1 and code = $3 returning id`,
      [ORG_DEMO, klass.id, code, coefficient],
    );
    subjects[code] = cs.id;
  }
  const students = {};
  for (const first of ["Kofi", "Ama"]) {
    const [st] = await q("insert into students (organization_id, matricule, first_name, last_name) values ($1, $2, $3, 'TESTSIMPLE') returning id", [
      ORG_DEMO,
      `SS-${tag}-${first}`.toUpperCase(),
      first,
    ]);
    await q(
      "insert into enrollments (organization_id, reference, student_id, academic_year_id, class_id, status) values ($1, $2, $3, $4, $5, 'validated')",
      [ORG_DEMO, `SS-${tag}-${first}`, st.id, year.id, klass.id],
    );
    students[first] = st.id;
  }
  return { klass: klass.id, periods, subjects, students };
}

const open = async (q, classSubject, period, group, slot) =>
  (await q("select public.open_grade_slot($1, $2, $3, $4) as id", [classSubject, period, group, slot]))[0].id;
const grade = (q, assessment, student, score) =>
  q("insert into grades (organization_id, assessment_id, student_id, score) values ($1, $2, $3, $4)", [ORG_DEMO, assessment, student, score]);
async function card(q, f, period, first) {
  const rows = await q("select student_id, average, data from app.report_card_rows($1, $2)", [f.klass, period]);
  return rows.find((r) => r.student_id === f.students[first]);
}
const subject = (row, code) => row.data.subjects.find((s) => s.code === code);
const labels = (row) => row.data.columns.map((c) => c.label);

describe("Réglage de l'école", () => {
  test("par défaut : 3 interrogations et 2 devoirs par trimestre et par semestre, pas de COMPO", async () => {
    await as(null, async (q) => {
      const [{ config }] = await q("select config from report_card_settings where organization_id = $1", [ORG_DEMO]);
      assert.deepEqual(config.slots, { trimester: { interro: 3, devoir: 2 }, semester: { interro: 3, devoir: 2 } });
      assert.deepEqual(config.groups.map((g) => g.key), ["interro", "devoir"]);
      assert.ok(config.groups[1].kinds.includes("exam"), "les compositions comptent comme des devoirs");
    });
  });

  test("la base refuse un nombre invalide (0 interrogation, 11 devoirs)", async () => {
    await as(null, async (q) => {
      for (const bad of [{ interro: 0, devoir: 2 }, { interro: 3, devoir: 11 }]) {
        const message = await rejects(
          q(`update report_card_settings set config = jsonb_set(config, '{slots,trimester}', $2::jsonb) where organization_id = $1`, [ORG_DEMO, JSON.stringify(bad)]),
        );
        assert.match(message, /Interrogations : 1 à 10 ; devoirs : 0 à 10/);
      }
    });
  });

  test("un nouvel établissement scolaire démarre en saisie simple ; une université non", async () => {
    await as(null, async (q) => {
      const org = (name, slug, type) =>
        q("insert into organizations (name, code, slug, type) values ($1, upper(replace($2, '-', '')), $2, $3::organization_type) returning id", [name, slug, type]);
      const [school] = await org("École SS", "ss-ecole", "primary_school");
      const [uni] = await org("Univ SS", "ss-univ", "university");
      const [s] = await q("select config from report_card_settings where organization_id = $1", [school.id]);
      const [u] = await q("select config from report_card_settings where organization_id = $1", [uni.id]);
      assert.equal(s.config.slots.trimester.interro, 3);
      assert.equal(u.config.slots, undefined);
    });
  });
});

describe("L'enseignant choisit une case et saisit les notes", () => {
  test("INT 1 : évaluation créée une seule fois (titre, type, colonne, case)", async () => {
    await as(USERS.teacher, async (q) => {
      const [math] = await q(
        `select cs.id, p.id as period from class_subjects cs join classes c on c.id = cs.class_id join subjects s on s.id = cs.subject_id
         join academic_periods p on p.academic_year_id = c.academic_year_id and p.sequence = 1
         where c.name = '6e A' and s.code = 'MATH' and c.organization_id = $1`,
        [ORG_DEMO],
      );
      const first = await open(q, math.id, math.period, "interro", 1);
      const again = await open(q, math.id, math.period, "interro", 1);
      assert.equal(first, again, "même case → même évaluation");
      const [a] = await q("select title, kind, column_key, slot, max_score from assessments where id = $1", [first]);
      assert.deepEqual({ ...a, max_score: num(a.max_score) }, { title: "INT 1", kind: "test", column_key: "interro", slot: 1, max_score: 20 });
      const dev = await open(q, math.id, math.period, "devoir", 2);
      const [d] = await q("select title, kind, column_key, slot from assessments where id = $1", [dev]);
      assert.deepEqual(d, { title: "DEV 2", kind: "homework", column_key: "devoir", slot: 2 });
    });
  });

  test("cases inexistantes refusées : INT 4, DEV 3, COMPO", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      assert.match(await rejects(open(q, f.subjects.MATH, f.periods[0], "interro", 4)), /l'école a prévu 3 interrogation/);
      assert.match(await rejects(open(q, f.subjects.MATH, f.periods[0], "devoir", 3)), /l'école a prévu 2 devoir/);
      assert.match(await rejects(open(q, f.subjects.MATH, f.periods[0], "compo", 1)), /Case inconnue/);
    });
  });

  test("un enseignant ne peut pas ouvrir une case d'une matière qu'il n'enseigne pas", async () => {
    await as(USERS.teacher, async (q) => {
      const [fr] = await q(
        `select cs.id, p.id as period from class_subjects cs join classes c on c.id = cs.class_id join subjects s on s.id = cs.subject_id
         join academic_periods p on p.academic_year_id = c.academic_year_id and p.sequence = 1
         where c.name = '5e A' and s.code = 'FR' and c.organization_id = $1`,
        [ORG_DEMO],
      );
      await rejects(open(q, fr.id, fr.period, "interro", 1));
    });
  });
});

describe("Bulletin : colonnes fixées par l'école, notes dans la case choisie", () => {
  test("INT 1, INT 2, INT 3, MOYEN INTERRO, DEV 1, DEV 2 — même sans notes, sans COMPO", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      const int2 = await open(q, f.subjects.MATH, f.periods[0], "interro", 2);
      await grade(q, int2, f.students.Kofi, 15);
      const row = await card(q, f, f.periods[0], "Kofi");
      assert.deepEqual(labels(row), ["INT 1", "INT 2", "INT 3", "MOYEN INTERRO", "DEV 1", "DEV 2"]);
      const maths = subject(row, "MATH");
      assert.equal(maths.columns["interro#1"], undefined, "INT 1 vide");
      assert.equal(num(maths.columns["interro#2"]), 15, "la note est dans INT 2, la case choisie");
    });
  });

  test("chaîne complète : INT → MOYEN INTERRO → DEV → Moy. → Points → moyenne générale", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      const notes = { interro: [19.5, 18.5, 17.5], devoir: [16, 15] };
      for (const [group, list] of Object.entries(notes)) {
        for (const [i, score] of list.entries()) await grade(q, await open(q, f.subjects.MATH, f.periods[0], group, i + 1), f.students.Kofi, score);
      }
      // Saisie dans le désordre : DEV 1 avant INT 1 ne change rien.
      await grade(q, await open(q, f.subjects.FR, f.periods[0], "devoir", 1), f.students.Kofi, 10);
      await grade(q, await open(q, f.subjects.FR, f.periods[0], "interro", 1), f.students.Kofi, 14);
      const row = await card(q, f, f.periods[0], "Kofi");
      const maths = subject(row, "MATH");
      assert.equal(num(maths.columns.interro), 18.5, "MOYEN INTERRO = (19,50 + 18,50 + 17,50) ÷ 3");
      assert.equal(num(maths.average), 16.5, "Moy. = (18,50 + 16 + 15) ÷ 3");
      assert.equal(num(maths.points), 66, "16,50 × 4");
      const fr = subject(row, "FR");
      assert.equal(num(fr.average), 12, "(14 + 10) ÷ 2");
      assert.equal(num(fr.points), 36);
      assert.equal(num(row.average), 14.57, "(66 + 36) ÷ 7");
    });
  });

  test("ancienne note sans case + nouvelle INT 1 : l'ancienne passe dans INT 2, rien n'est compté deux fois", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      const [old] = await q(
        `insert into assessments (organization_id, class_subject_id, academic_period_id, title, kind, assessed_on)
         values ($1, $2, $3, 'Interrogation écrite', 'test', '2032-10-01') returning id`,
        [ORG_DEMO, f.subjects.MATH, f.periods[0]],
      );
      await grade(q, old.id, f.students.Kofi, 10);
      await grade(q, await open(q, f.subjects.MATH, f.periods[0], "interro", 1), f.students.Kofi, 16);
      const maths = subject(await card(q, f, f.periods[0], "Kofi"), "MATH");
      assert.equal(num(maths.columns["interro#1"]), 16, "INT 1 = la note saisie dans la case INT 1");
      assert.equal(num(maths.columns["interro#2"]), 10, "l'ancienne note prend la case libre suivante");
      assert.equal(num(maths.columns.interro), 13, "MOYEN INTERRO = (16 + 10) ÷ 2");
    });
  });

  test("l'école passe à 2 interrogations et 1 devoir : le bulletin suit", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await q(`update report_card_settings set config = jsonb_set(config, '{slots,trimester}', '{"interro": 2, "devoir": 1}') where organization_id = $1`, [ORG_DEMO]);
      const row = await card(q, f, f.periods[0], "Kofi");
      assert.deepEqual(labels(row), ["INT 1", "INT 2", "MOYEN INTERRO", "DEV 1"]);
      assert.match(await rejects(open(q, f.subjects.MATH, f.periods[0], "interro", 3)), /l'école a prévu 2 interrogation/);
    });
  });

  test("année en semestres : nombres du semestre", async () => {
    await as(null, async (q) => {
      const f = await setup(q, "semester");
      await q(`update report_card_settings set config = jsonb_set(config, '{slots,semester}', '{"interro": 4, "devoir": 3}') where organization_id = $1`, [ORG_DEMO]);
      const row = await card(q, f, f.periods[0], "Kofi");
      assert.deepEqual(labels(row), ["INT 1", "INT 2", "INT 3", "INT 4", "MOYEN INTERRO", "DEV 1", "DEV 2", "DEV 3"]);
      assert.ok(await open(q, f.subjects.MATH, f.periods[1], "devoir", 3), "DEV 3 existe en semestre");
    });
  });

  test("calcul annuel inchangé : récapitulatif au 3e trimestre", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      for (const [i, avg] of [14, 16].entries()) {
        await q(
          "insert into report_cards (organization_id, student_id, class_id, academic_period_id, average, status, published_at) values ($1, $2, $3, $4, $5, 'published', now())",
          [ORG_DEMO, f.students.Kofi, f.klass, f.periods[i], avg],
        );
      }
      await grade(q, await open(q, f.subjects.MATH, f.periods[2], "interro", 1), f.students.Kofi, 12);
      await grade(q, await open(q, f.subjects.MATH, f.periods[2], "devoir", 1), f.students.Kofi, 12);
      const row = await card(q, f, f.periods[2], "Kofi");
      assert.equal(row.data.annual.formula, "(14 + 16 + 12) ÷ 3");
      assert.equal(num(row.data.annual.average), 14);
      await switchTo(q, null);
    });
  });
});
