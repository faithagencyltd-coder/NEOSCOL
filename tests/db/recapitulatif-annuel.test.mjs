// Correction du moteur des bulletins : exemples chiffrés du cahier des charges,
// décision de fin d'année uniquement sur le dernier bulletin (T3 / S2),
// récapitulatif annuel (trimestres et semestres), recalcul, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const I = "test";
const D = "homework";
const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Classe isolée créée pour le test (année scolaire propre, en trimestres ou en
 * semestres, matières MATH ×4, FR ×3, ANG ×2, élèves Kofi et Ama) : aucun
 * partage de lignes avec les autres fichiers de test exécutés en parallèle.
 * L'école de démonstration applique la règle par défaut (calcul par type
 * d'évaluation, moyenne de matière arrondie avant la moyenne générale).
 */
let seq = 0;
async function setup(q, system = "trimester") {
  seq += 1;
  const tag = `${process.pid}-${seq}`;
  const [year] = await q(
    "insert into academic_years (organization_id, name, starts_on, ends_on, status) values ($1, $2, '2030-09-01', '2031-07-15', 'planned') returning id",
    [ORG_DEMO, `TC ${tag}`],
  );
  const bounds = system === "semester"
    ? [["Semestre 1", "2030-09-01", "2031-01-31"], ["Semestre 2", "2031-02-01", "2031-07-15"]]
    : [["1er trimestre", "2030-09-01", "2030-12-20"], ["2e trimestre", "2031-01-05", "2031-03-31"], ["3e trimestre", "2031-04-07", "2031-07-15"]];
  const periods = [];
  for (const [i, [name, from, to]] of bounds.entries()) {
    const [p] = await q(
      "insert into academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on) values ($1, $2, $3, $4, $5, $6, $7) returning id",
      [ORG_DEMO, year.id, name, system, i + 1, from, to],
    );
    periods.push(p.id);
  }
  const [klass] = await q("insert into classes (organization_id, academic_year_id, name) values ($1, $2, $3) returning id", [ORG_DEMO, year.id, `TC ${tag}`]);
  const subjects = {};
  for (const [code, coefficient] of [["MATH", 4], ["FR", 3], ["ANG", 2]]) {
    const [cs] = await q(
      `insert into class_subjects (organization_id, class_id, subject_id, coefficient)
       select $1, $2, id, $4 from subjects where organization_id = $1 and code = $3 returning id`,
      [ORG_DEMO, klass.id, code, coefficient],
    );
    subjects[code] = cs.id;
  }
  const students = {};
  for (const first of ["Kofi", "Ama"]) {
    const [st] = await q(
      "insert into students (organization_id, matricule, first_name, last_name) values ($1, $2, $3, 'TESTCALC') returning id",
      [ORG_DEMO, `TC-${tag}-${first}`.toUpperCase(), first],
    );
    await q(
      "insert into enrollments (organization_id, reference, student_id, academic_year_id, class_id, status) values ($1, $2, $3, $4, $5, 'validated')",
      [ORG_DEMO, `TC-${tag}-${first}`, st.id, year.id, klass.id],
    );
    students[first] = st.id;
  }
  return { klass: klass.id, year: year.id, periods, subjects, students };
}

/** Saisit des notes : { élève: { matière: [[type, note], …] } } dans la période donnée. */
async function grade(q, f, periodId, notes) {
  let day = 0;
  const made = new Map();
  for (const [student, bySubject] of Object.entries(notes)) {
    for (const [code, list] of Object.entries(bySubject)) {
      const rank = {};
      for (const [kind, score] of list) {
        rank[kind] = (rank[kind] ?? 0) + 1;
        const key = `${periodId}|${code}|${kind}|${rank[kind]}`;
        if (!made.has(key)) {
          day += 1;
          const [{ starts_on }] = await q("select starts_on from academic_periods where id = $1", [periodId]);
          const [a] = await q(
            `insert into assessments (organization_id, class_subject_id, academic_period_id, title, kind, assessed_on)
             values ($1, $2, $3, $4, $5, $6::date + $7::int) returning id`,
            [ORG_DEMO, f.subjects[code], periodId, `${kind === I ? "INT" : "DEV"}${rank[kind]}`, kind, starts_on, day],
          );
          made.set(key, a.id);
        }
        await q("insert into grades (organization_id, assessment_id, student_id, score) values ($1, $2, $3, $4)", [ORG_DEMO, made.get(key), f.students[student], score]);
      }
    }
  }
}

async function card(q, f, periodId, first) {
  const rows = await q("select student_id, average, rank, data from app.report_card_rows($1, $2)", [f.klass, periodId]);
  return rows.find((r) => r.student_id === f.students[first]);
}
const subject = (row, code) => row.data.subjects.find((s) => s.code === code);

/** Bulletin d'une période antérieure, publié avec une moyenne connue. */
async function pastCard(q, f, periodId, first, average) {
  await q(
    "insert into report_cards (organization_id, student_id, class_id, academic_period_id, average, status, published_at) values ($1, $2, $3, $4, $5, 'published', now())",
    [ORG_DEMO, f.students[first], f.klass, periodId, average],
  );
}

describe("Colonnes du bulletin : INT → MOYEN INTERRO → DEV → Moy. → Points → moyenne générale", () => {
  test("exemple Anglais 19,50 / 18,50 / 17,50 → MOYEN INTERRO 18,50, chaîne complète sur 3 matières", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], {
        Kofi: {
          ANG: [[I, 19.5], [I, 18.5], [I, 17.5], [D, 16], [D, 15]],
          MATH: [[I, 19], [I, 17], [I, 15], [D, 14], [D, 16]],
          FR: [[I, 12], [I, 14]],
        },
        Ama: { ANG: [[I, 10], [I, 12], [I, 14], [D, 9], [D, 11]] },
      });
      const row = await card(q, f, f.periods[0], "Kofi");
      // Même structure : une colonne par interrogation, MOYEN INTERRO, une colonne par devoir (nombre dynamique).
      assert.deepEqual(row.data.columns.map((c) => c.label), ["INT 1", "INT 2", "INT 3", "MOYEN INTERRO", "DEV 1", "DEV 2"]);
      const ang = subject(row, "ANG");
      assert.deepEqual(
        ["interro#1", "interro#2", "interro#3", "interro", "devoir#1", "devoir#2"].map((k) => num(ang.columns[k])),
        [19.5, 18.5, 17.5, 18.5, 16, 15],
      );
      assert.equal(num(ang.average), 16.5, "Moy. = (18,50 + 16 + 15) ÷ 3, distincte de MOYEN INTERRO");
      assert.equal(num(ang.points), 33, "16,50 × 2");
      const maths = subject(row, "MATH");
      assert.equal(num(maths.columns.interro), 17);
      assert.equal(num(maths.average), 15.67);
      assert.equal(num(maths.points), 62.68, "15,67 × 4");
      const fr = subject(row, "FR");
      assert.equal(fr.columns["interro#3"], undefined, "case vide quand la 3e interrogation n'existe pas");
      assert.equal(num(fr.columns.interro), 13);
      assert.equal(num(fr.average), 13);
      assert.equal(num(fr.points), 39);
      assert.equal(num(row.data.points_total), 134.68);
      assert.equal(num(row.data.coefficient_total), 9);
      assert.equal(num(row.average), 14.96, "134,68 ÷ 9");
      // Moy. cl. et Min / Max toujours calculés.
      // Ama : (12 + 9 + 11) ÷ 3 = 10,67 → Moy. cl. (16,50 + 10,67) ÷ 2 = 13,58.
      assert.equal(num(ang.class_average), 13.58);
      assert.deepEqual([num(ang.min), num(ang.max)], [10.67, 16.5]);
    });
  });

  test("MOYEN INTERRO arrondie = valeur utilisée dans Moy. (calcul refaisable à la main)", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { MATH: [[I, 15], [I, 16], [I, 16], [D, 14]] } });
      const maths = subject(await card(q, f, f.periods[0], "Kofi"), "MATH");
      assert.equal(num(maths.columns.interro), 15.67);
      assert.equal(num(maths.average), 14.84, "(15,67 + 14) ÷ 2 = 14,835 → 14,84");
      assert.equal(maths.detail.formula, "(15.67 + 14) ÷ 2");
    });
  });
});

describe("Moyennes par matière et moyenne générale", () => {
  test("TEST 1 — 3 interrogations + 2 devoirs : (17 + 14 + 16) ÷ 3 = 15,67", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { MATH: [[I, 19], [I, 17], [I, 15], [D, 14], [D, 16]] } });
      const maths = subject(await card(q, f, f.periods[0], "Kofi"), "MATH");
      assert.equal(num(maths.columns.interro), 17, "Moy. Interro conservée");
      assert.equal(num(maths.average), 15.67);
      assert.equal(maths.detail.formula, "(17 + 14 + 16) ÷ 3");
    });
  });

  test("TEST 2 — 4 interrogations + 4 devoirs : (15 + 14 + 16 + 13 + 17) ÷ 5 = 15", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { MATH: [[I, 14], [I, 16], [I, 15], [I, 15], [D, 14], [D, 16], [D, 13], [D, 17]] } });
      const maths = subject(await card(q, f, f.periods[0], "Kofi"), "MATH");
      assert.equal(num(maths.columns.interro), 15);
      assert.equal(num(maths.average), 15);
    });
  });

  test("TEST 3 — matière sans devoir : moyenne = moyenne des interrogations", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { FR: [[I, 12], [I, 14]] } });
      assert.equal(num(subject(await card(q, f, f.periods[0], "Kofi"), "FR").average), 13);
    });
  });

  test("TEST 4 — une seule interrogation : (15 + 13) ÷ 2 = 14", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { FR: [[I, 15], [D, 13]] } });
      const fr = subject(await card(q, f, f.periods[0], "Kofi"), "FR");
      assert.equal(num(fr.columns.interro), 15);
      assert.equal(num(fr.average), 14);
    });
  });

  test("TEST 5 — coefficients différents : 62,68 + 42 + 32 = 136,68 ; 136,68 ÷ 9 = 15,19", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], {
        Kofi: {
          MATH: [[I, 19], [I, 17], [I, 15], [D, 14], [D, 16]], // 15,67 × 4
          FR: [[I, 14], [D, 14]], // 14 × 3
          ANG: [[I, 16]], // 16 × 2
        },
      });
      const kofi = await card(q, f, f.periods[0], "Kofi");
      assert.equal(num(subject(kofi, "MATH").points), 62.68, "points = moyenne de la matière × coefficient");
      assert.equal(num(subject(kofi, "FR").points), 42);
      assert.equal(num(subject(kofi, "ANG").points), 32);
      assert.equal(num(kofi.data.points_total), 136.68);
      assert.equal(num(kofi.data.coefficient_total), 9);
      assert.equal(num(kofi.average), 15.19);
    });
  });

  test("TEST 12 — une note vide n'est pas transformée en zéro", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { MATH: [[I, 16], [I, null], [D, 12], [D, null]] } });
      const maths = subject(await card(q, f, f.periods[0], "Kofi"), "MATH");
      assert.equal(num(maths.columns.interro), 16, "interro vide ignorée (sinon 8)");
      assert.equal(num(maths.average), 14, "(16 + 12) ÷ 2 ; avec des zéros ce serait 9,33");
    });
  });
});

describe("Système trimestriel", () => {
  test("TEST 6, 8, 9 — T1/T2 sans décision ; T3 : récapitulatif (14,20 + 15,10 + 16,40) ÷ 3 = 15,23 et décision", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await pastCard(q, f, f.periods[0], "Kofi", 14.2);
      await pastCard(q, f, f.periods[1], "Kofi", 15.1);
      await grade(q, f, f.periods[2], { Kofi: { ANG: [[I, 16.4]] } });
      await grade(q, f, f.periods[0], { Kofi: { ANG: [[I, 14.2]] } });

      // TEST 8 : bulletins T1 et T2 sans décision annuelle ni récapitulatif.
      for (const period of [f.periods[0], f.periods[1]]) {
        const row = await card(q, f, period, "Kofi");
        assert.equal(row.data.proposed_decision, null, "aucune décision annuelle sur T1/T2");
        assert.equal(row.data.annual, null);
      }
      // TEST 6 + 9 : T3 = bulletin de fin d'année.
      const t3 = await card(q, f, f.periods[2], "Kofi");
      assert.equal(num(t3.average), 16.4, "moyenne générale du T3");
      const annual = t3.data.annual;
      assert.equal(annual.system, "trimester");
      assert.deepEqual(annual.periods.map((p) => num(p.average)), [14.2, 15.1, 16.4]);
      assert.equal(num(annual.average), 15.23);
      assert.equal(annual.formula, "(14.2 + 15.1 + 16.4) ÷ 3");
      const [{ rules }] = await q("select rules from app.effective_academic_rules($1, 'school')", [ORG_DEMO]);
      const expected = rules.decisions.filter((d) => 15.23 >= Number(d.min)).sort((a, b) => b.min - a.min)[0].label;
      assert.equal(annual.decision, expected, "décision issue des règles de l'établissement");
      assert.equal(t3.data.proposed_decision, expected);
      assert.equal(annual.decision_source, "rules");
    });
  });

  test("décision du conseil (Résultats annuels) reprise sur le bulletin T3 ; recalcul si T2 change", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await grade(q, f, f.periods[0], { Kofi: { ANG: [[I, 8]] } });
      await grade(q, f, f.periods[1], { Kofi: { ANG: [[I, 9]] } });
      await grade(q, f, f.periods[2], { Kofi: { ANG: [[I, 9.5]] } });
      await switchTo(q, USERS.director);
      for (const p of f.periods) await q("select compute_report_cards($1, $2)", [f.klass, p]);
      const t3 = async () =>
        (await q("select data from report_cards where student_id = $1 and academic_period_id = $2", [f.students.Kofi, f.periods[2]]))[0].data;
      assert.equal(num((await t3()).annual.average), 8.83);

      // Moyenne du T2 modifiée → récapitulatif du T3 (brouillon) recalculé automatiquement.
      await q(
        "select save_grades((select id from assessments where class_id = $1 and academic_period_id = $2 limit 1), $3::jsonb)",
        [f.klass, f.periods[1], JSON.stringify([{ student_id: f.students.Kofi, score: 12 }])],
      );
      assert.equal(num((await t3()).annual.average), 9.83, "(8 + 12 + 9,5) ÷ 3");

      // Décision du conseil saisie avec un motif : reprise sur le bulletin.
      await q("select compute_annual_results($1)", [f.klass]);
      const [{ id, rules_snapshot }] = await q("select id, rules_snapshot from annual_results where class_id = $1 and student_id = $2", [f.klass, f.students.Kofi]);
      const promoted = rules_snapshot.decisions.sort((a, b) => b.min - a.min)[0];
      await q("select set_annual_decision($1, $2, 'Progrès constants, travail sérieux')", [id, promoted.code]);
      const data = await t3();
      assert.equal(data.annual.decision, promoted.label);
      assert.equal(data.annual.decision_source, "council");
    });
  });
});

describe("Système semestriel", () => {
  test("TEST 7, 10, 11 — S1 sans décision ; S2 : (14 + 16 × 2) ÷ 3 = 15,33 et décision", async () => {
    await as(null, async (q) => {
      const f = await setup(q, "semester");
      await pastCard(q, f, f.periods[0], "Kofi", 14);
      await grade(q, f, f.periods[0], { Kofi: { ANG: [[I, 14]] } });
      await grade(q, f, f.periods[1], { Kofi: { ANG: [[I, 16]] } });

      const s1 = await card(q, f, f.periods[0], "Kofi");
      assert.equal(s1.data.proposed_decision, null, "TEST 10 : aucune décision annuelle sur S1");
      assert.equal(s1.data.annual, null);

      const s2 = await card(q, f, f.periods[1], "Kofi");
      assert.equal(num(s2.average), 16);
      assert.equal(s2.data.annual.system, "semester");
      assert.equal(num(s2.data.annual.average), 15.33, "TEST 7 : (S1 + S2 × 2) ÷ 3");
      assert.equal(s2.data.annual.formula, "(14 + 16 × 2) ÷ 3");
      assert.ok(s2.data.annual.decision, "TEST 11 : décision affichée sur S2");
      assert.equal(s2.data.proposed_decision, s2.data.annual.decision);
    });
  });
});

describe("Paramétrage et isolation", () => {
  test("TEST 13 — deux établissements, règles annuelles différentes : aucune interférence", async () => {
    await as(null, async (q) => {
      const f = await setup(q);
      await pastCard(q, f, f.periods[0], "Kofi", 14.2);
      await pastCard(q, f, f.periods[1], "Kofi", 15.1);
      await grade(q, f, f.periods[2], { Kofi: { ANG: [[I, 16.4]] } });
      // L'école publie ses propres règles : T3 compte double.
      await switchTo(q, USERS.admin);
      const rules = { annual: { mode: "weights", weights: [1, 1, 2] }, decisions: [{ min: 10, code: "promoted", label: "Passe en classe supérieure" }, { min: 0, code: "repeat", label: "Redouble" }] };
      const [{ id }] = await q("select save_academic_rule_draft($1, null, 'school', 'Règles école', $2::jsonb) id", [ORG_DEMO, JSON.stringify(rules)]);
      await q("select publish_academic_rule_set($1)", [id]);
      await switchTo(q, null);
      const t3 = await card(q, f, f.periods[2], "Kofi");
      assert.equal(num(t3.data.annual.average), 15.53, "(14,2 + 15,1 + 2 × 16,4) ÷ 4");
      assert.equal(t3.data.annual.decision, "Passe en classe supérieure", "libellé configuré par l'établissement");
      // L'autre établissement garde ses propres règles.
      const [other] = await q("select source, rules from app.effective_academic_rules($1, 'school')", [ORG_DEMOF]);
      assert.notEqual(other.source, "organization");
      assert.notDeepEqual(other.rules.annual.weights, [1, 1, 2]);
      // Seul le module scolaire porte le récapitulatif : rien sur un bulletin d'université.
      const [uni] = await q(
        `select c.id as class_id, p.id as period_id from classes c join academic_periods p on p.academic_year_id = c.academic_year_id
          join organizations o on o.id = c.organization_id where o.type = 'university' order by p.sequence desc limit 1`,
      );
      if (uni) {
        const rows = await q("select data from app.report_card_rows($1, $2)", [uni.class_id, uni.period_id]);
        assert.ok(rows.every((r) => r.data.annual === null), "université : pas de récapitulatif scolaire");
      }
    });
  });
});
