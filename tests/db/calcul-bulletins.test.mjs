// Calcul paramétrable des bulletins (mode « par type d'évaluation ») : règle par
// défaut, nombre libre d'interrogations / devoirs, barèmes, notes manquantes,
// pondérations, arrondi, traçabilité, recalcul automatique, établissements.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

/**
 * Classe 6e A, 3e trimestre vidé : chaque test part d'un terrain connu.
 * notes : { élève: { matière: [[type, note, barème?, coef?, colonne?], …] } } (note null = vide).
 */
async function fixture(q, notes) {
  const [klass] = await q("select id from classes where name = '6e A' and organization_id = $1", [ORG_DEMO]);
  const [period] = await q(
    "select p.id from academic_periods p join classes c on c.academic_year_id = p.academic_year_id where c.id = $1 and p.sequence = 3",
    [klass.id],
  );
  await q("delete from assessments where class_id = $1 and academic_period_id = $2", [klass.id, period.id]);
  const subjects = Object.fromEntries(
    (
      await q(
        "select s.code, cs.id, cs.coefficient from class_subjects cs join subjects s on s.id = cs.subject_id where cs.class_id = $1",
        [klass.id],
      )
    ).map((r) => [r.code, { id: r.id, coefficient: Number(r.coefficient) }]),
  );
  const students = Object.fromEntries(
    (
      await q(
        "select st.first_name, st.id from enrollments e join students st on st.id = e.student_id where e.class_id = $1 and e.status = 'validated'",
        [klass.id],
      )
    ).map((r) => [r.first_name, r.id]),
  );
  // Une évaluation par (matière, type, rang) partagée par les élèves, comme en classe.
  const assessments = new Map();
  let day = 0;
  for (const [student, bySubject] of Object.entries(notes)) {
    for (const [code, list] of Object.entries(bySubject)) {
      const rankByKind = {};
      for (const [kind, score, max = 20, coef = 1, column = null] of list) {
        rankByKind[kind] = (rankByKind[kind] ?? 0) + 1;
        const key = `${code}|${kind}|${rankByKind[kind]}|${max}|${coef}|${column}`;
        if (!assessments.has(key)) {
          day += 1;
          const [a] = await q(
            `insert into assessments (organization_id, class_subject_id, academic_period_id, title, kind, coefficient, max_score, assessed_on, column_key)
             values ($1, $2, $3, $4, $5, $6, $7, date '2027-04-06' + $8::int, $9) returning id`,
            [ORG_DEMO, subjects[code].id, period.id, `${kind} ${rankByKind[kind]}`, kind, coef, max, day, column],
          );
          assessments.set(key, a.id);
        }
        await q("insert into grades (organization_id, assessment_id, student_id, score) values ($1, $2, $3, $4)", [
          ORG_DEMO,
          assessments.get(key),
          students[student],
          score,
        ]);
      }
    }
  }
  return { klass: klass.id, period: period.id, subjects, students };
}

async function setConfig(q, patch) {
  await q("update report_card_settings set config = config || $2::jsonb where organization_id = $1", [ORG_DEMO, JSON.stringify(patch)]);
}

async function rows(q, f) {
  const list = await q("select student_id, average, rank, data from app.report_card_rows($1, $2)", [f.klass, f.period]);
  const byId = new Map(list.map((r) => [r.student_id, r]));
  return (first) => byId.get(f.students[first]);
}
const subject = (row, code) => row.data.subjects.find((s) => s.code === code);
const num = (v) => (v === null || v === undefined ? null : Number(v));

const I = "test";
const D = "homework";
const C = "exam";

describe("Règle par défaut (module scolaire)", () => {
  test("l'école de démonstration utilise le calcul par type d'évaluation", async () => {
    await as(null, async (q) => {
      const [cfg] = await q("select config from report_card_settings where organization_id = $1", [ORG_DEMO]);
      assert.equal(cfg.config.calculation, "groups");
      assert.deepEqual(
        cfg.config.groups.map((g) => [g.key, g.mode, g.weight]),
        [
          ["interro", "average", 1],
          ["devoir", "each", 1],
          ["compo", "each", 1],
        ],
      );
    });
  });

  test("exemple de référence : interros 12, 14, 10 + devoirs 13, 15, 14, 16 → 14", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { MATH: [[I, 12], [I, 14], [I, 10], [D, 13], [D, 15], [D, 14], [D, 16]] },
      });
      const kofi = (await rows(q, f))("Kofi");
      const maths = subject(kofi, "MATH");
      assert.equal(num(maths.average), 14);
      assert.equal(num(maths.columns.interro), 12, "moyenne des interrogations affichée");
      assert.equal(maths.detail.formula, "(12 + 13 + 15 + 14 + 16) ÷ 5", "formule conservée pour la traçabilité");
      assert.equal(maths.detail.notes.length, 7);
      assert.equal(num(maths.points), 14 * 4, "points = moyenne × coefficient de la matière");
      assert.equal(kofi.data.rules.calculation, "groups");
    });
  });

  test("2 interrogations + 2 devoirs ; 4 interrogations + 5 devoirs", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { FR: [[I, 10], [I, 14], [D, 12], [D, 16]] },
        Grâce: { FR: [[I, 8], [I, 10], [I, 12], [I, 14], [D, 10], [D, 12], [D, 14], [D, 16], [D, 18]] },
      });
      const get = await rows(q, f);
      // (12 + 12 + 16) ÷ 3
      assert.equal(num(subject(get("Kofi"), "FR").average), 13.33);
      // interros 11 ; (11 + 10 + 12 + 14 + 16 + 18) ÷ 6 = 13,5
      assert.equal(num(subject(get("Grâce"), "FR").average), 13.5);
    });
  });

  test("aucune interrogation, une seule interrogation, devoirs multiples", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { ANG: [[D, 11], [D, 15]] }, // aucune interro : (11 + 15) ÷ 2
        Grâce: { ANG: [[I, 15]] }, // une seule interro, aucun devoir : 15 ÷ 1
        Christelle: { ANG: [[I, 9], [D, 10], [D, 11], [D, 12], [D, 13], [D, 14], [D, 15]] }, // (9 + 75) ÷ 7
      });
      const get = await rows(q, f);
      assert.equal(num(subject(get("Kofi"), "ANG").average), 13);
      assert.equal(num(subject(get("Grâce"), "ANG").average), 15);
      assert.equal(num(subject(get("Christelle"), "ANG").average), 12);
    });
  });

  test("notes manquantes : vide ≠ zéro, aucune division par zéro", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { MATH: [[I, null], [I, 14], [D, null], [D, 12]] }, // vides ignorées : (14 + 12) ÷ 2
        Grâce: { MATH: [[I, null], [D, null]] }, // aucune note : pas de moyenne
        Nadia: { MATH: [[I, 0], [D, null]] }, // un vrai zéro compte ; devoir dispensé ignoré
      });
      await q(
        `update grades set is_exempt = (student_id = $1), is_absent = (student_id = $4)
          where assessment_id in (select id from assessments where class_id = $2 and academic_period_id = $3 and kind = 'homework')
            and student_id in ($1, $4) and score is null`,
        [f.students.Nadia, f.klass, f.period, f.students.Kofi],
      );
      const get = await rows(q, f);
      assert.equal(num(subject(get("Kofi"), "MATH").average), 13);
      assert.equal(subject(get("Grâce"), "MATH").average, null);
      assert.equal(get("Grâce").average, null, "aucune moyenne générale sans note");
      assert.equal(get("Grâce").rank, null);
      assert.equal(num(subject(get("Nadia"), "MATH").average), 0, "dispense ignorée, zéro conservé");
      assert.equal(get("Inès").average, null, "élève sans aucune note : pas d'erreur");
    });
  });

  test("le groupe choisi à la création de l'évaluation prime sur son type", async () => {
    await as(null, async (q) => {
      // « Interrogation écrite » saisie avec le type devoir mais rangée en INTERRO.
      const f = await fixture(q, { Kofi: { HG: [[I, 12], [D, 16, 20, 1, "interro"], [D, 10]] } });
      const hg = subject((await rows(q, f))("Kofi"), "HG");
      assert.equal(num(hg.columns.interro), 14, "interros 12 et 16");
      assert.equal(num(hg.average), 12, "(14 + 10) ÷ 2");
    });
  });

  test("barèmes différents ramenés sur 20", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { SVT: [[I, 6, 10], [I, 14, 20], [D, 28, 40], [D, 50, 100]] }, // interros 12 et 14 → 13 ; devoirs 14 et 10
      });
      const svt = subject((await rows(q, f))("Kofi"), "SVT");
      assert.equal(num(svt.average), 12.33); // (13 + 14 + 10) ÷ 3
      const on20 = svt.detail.notes.map((n) => Number(n.on20)).sort((a, b) => a - b);
      assert.deepEqual(on20, [10, 12, 14, 14]);
    });
  });

  test("moyenne générale : Σ(moyenne × coefficient) ÷ Σ coefficients des matières notées", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: {
          MATH: [[I, 12], [I, 14], [I, 10], [D, 13], [D, 15], [D, 14], [D, 16]], // 14 × 4
          FR: [[I, 10], [D, 12]], // 11 × 4
          ANG: [[D, 18]], // 18 × 2
          EPS: [[I, null]], // non notée : exclue (ni points, ni coefficient)
        },
      });
      const kofi = (await rows(q, f))("Kofi");
      assert.equal(num(kofi.data.coefficient_total), 10);
      assert.equal(num(kofi.data.points_total), 136);
      assert.equal(num(kofi.average), 13.6);
      assert.equal(kofi.rank, 1);
    });
  });
});

describe("Paramètres de l'établissement", () => {
  test("pondération des devoirs, coefficients des évaluations, composition", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, {
        Kofi: { MATH: [[I, 12], [I, 14], [I, 10], [D, 13], [D, 15], [D, 14], [D, 16]] },
        Grâce: { MATH: [[I, 10, 20, 1], [I, 16, 20, 2], [D, 12], [C, 15]] },
      });
      await setConfig(q, {
        groups: [
          { key: "interro", label: "INTERRO", kinds: ["test", "oral"], mode: "average", weight: 1, use_coefficients: true },
          { key: "devoir", label: "DEVOIR", kinds: ["homework"], mode: "each", weight: 2, use_coefficients: false },
          { key: "compo", label: "COMPO", kinds: ["exam"], mode: "average", weight: 3, use_coefficients: false },
        ],
      });
      const get = await rows(q, f);
      // (12 + 2×(13 + 15 + 14 + 16)) ÷ (1 + 8) = 128 ÷ 9
      assert.equal(num(subject(get("Kofi"), "MATH").average), 14.22);
      // interros pondérées (10×1 + 16×2) ÷ 3 = 14 ; (14 + 2×12 + 3×15) ÷ 6 = 13,83
      assert.equal(num(subject(get("Grâce"), "MATH").average), 13.83);
      assert.equal(subject(get("Grâce"), "MATH").detail.formula, "(14 + 12 × 2 + 15 × 3) ÷ 6");
    });
  });

  test("arrondi et nombre de décimales", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, { Kofi: { FR: [[I, 10], [I, 14], [D, 12], [D, 16]] } }); // 13,333…
      const fr = async () => num(subject((await rows(q, f))("Kofi"), "FR").average);
      await setConfig(q, { decimals: 1, rounding: "down" });
      assert.equal(await fr(), 13.3);
      await setConfig(q, { decimals: 1, rounding: "up" });
      assert.equal(await fr(), 13.4);
      await setConfig(q, { decimals: 0, rounding: "half_up" });
      assert.equal(await fr(), 13);
      await setConfig(q, { decimals: 3, rounding: "half_up" });
      assert.equal(await fr(), 13.333);
    });
  });

  test("les autres modes restent disponibles (moyenne pondérée des évaluations)", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, { Kofi: { MATH: [[I, 12], [I, 14], [I, 10], [D, 13], [D, 15], [D, 14], [D, 16]] } });
      await setConfig(q, { calculation: "assessments" });
      // Toutes les évaluations à poids égal : 94 ÷ 7
      assert.equal(num(subject((await rows(q, f))("Kofi"), "MATH").average), 13.43);
    });
  });

  test("configuration invalide refusée par la base", async () => {
    await as(null, async (q) => {
      const bad = async (patch) => rejects(setConfig(q, patch));
      assert.match(
        await bad({
          groups: [
            { key: "a", label: "A", kinds: ["test"], mode: "average", weight: 1 },
            { key: "b", label: "B", kinds: ["test"], mode: "each", weight: 1 },
          ],
        }),
        /deux groupes/,
      );
      assert.match(await bad({ groups: [{ key: "a", label: "A", kinds: ["test"], mode: "max", weight: 1 }] }), /inconnu/);
      assert.match(await bad({ groups: [{ key: "a", label: "A", kinds: ["test"], mode: "each", weight: 0 }] }), /poids/);
      assert.match(await bad({ decimals: 5 }), /décimales/);
      assert.match(await bad({ rounding: "bankers" }), /arrondi/);
      assert.match(await bad({ calculation: "groups", groups: [] }), /au moins un groupe/);
    });
  });

  test("seule la direction modifie les règles (enseignant refusé)", async () => {
    await as(USERS.teacher, async (q) => {
      await q("update report_card_settings set config = config || '{\"decimals\":0}'::jsonb where organization_id = $1", [ORG_DEMO]);
      await switchTo(q, null);
      const [cfg] = await q("select config ->> 'decimals' as d from report_card_settings where organization_id = $1", [ORG_DEMO]);
      assert.equal(cfg.d, "2", "aucune ligne modifiée par l'enseignant (RLS)");
    });
  });
});

describe("Recalcul, traçabilité, établissements", () => {
  test("note ou coefficient modifié → bulletin brouillon recalculé, règles conservées", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, { Kofi: { MATH: [[I, 12], [D, 14]], FR: [[D, 10]] } }); // MATH 13 ×4 ; FR 10 ×4
      await switchTo(q, USERS.director);
      await q("select compute_report_cards($1, $2)", [f.klass, f.period]);
      await switchTo(q, null);
      const card = async () =>
        (await q("select average, data from report_cards where student_id = $1 and academic_period_id = $2", [f.students.Kofi, f.period]))[0];
      assert.equal(num((await card()).average), 11.5);
      assert.equal((await card()).data.rules.calculation, "groups", "règles appliquées enregistrées dans le bulletin");

      await q(
        `update grades set score = 18 where student_id = $1 and assessment_id =
           (select id from assessments where class_id = $2 and academic_period_id = $3 and kind = 'homework' and class_subject_id = $4)`,
        [f.students.Kofi, f.klass, f.period, f.subjects.MATH.id],
      );
      assert.equal(num((await card()).average), 12.5, "note modifiée : (12 + 18) ÷ 2 = 15 → (15×4 + 10×4) ÷ 8");

      await q("update class_subjects set coefficient = 2 where id = $1", [f.subjects.FR.id]);
      assert.equal(num((await card()).average), 13.33, "coefficient modifié : (15×4 + 10×2) ÷ 6");
    });
  });

  test("deux établissements, deux règles : aucune interférence", async () => {
    await as(null, async (q) => {
      const f = await fixture(q, { Kofi: { MATH: [[I, 12], [I, 14], [I, 10], [D, 13], [D, 15], [D, 14], [D, 16]] } });
      // L'autre établissement change ses règles : celles de l'école ne bougent pas.
      await q(
        `update report_card_settings set config = config || '{"calculation":"assessments","decimals":0,"rounding":"down"}'::jsonb where organization_id = $1`,
        [ORG_DEMOF],
      );
      const kofi = (await rows(q, f))("Kofi");
      assert.equal(num(subject(kofi, "MATH").average), 14);
      assert.equal(kofi.data.rules.decimals, 2);
      const [other] = await q("select config ->> 'calculation' as c from report_card_settings where organization_id = $1", [ORG_DEMOF]);
      assert.equal(other.c, "assessments");
    });
  });

  test("un nouvel établissement scolaire démarre avec la règle par défaut, une université non", async () => {
    await as(null, async (q) => {
      const make = async (type, slug) =>
        (
          await q(
            `insert into organizations (name, code, slug, type) values ($1, upper(replace($2, '-', '')), $2, $3::organization_type) returning id`,
            [`Test ${slug}`, slug, type],
          )
        )[0].id;
      const school = await make("primary_school", "tcalc-ecole");
      const uni = await make("university", "tcalc-univ");
      const cfg = async (id) => (await q("select config from report_card_settings where organization_id = $1", [id]))[0].config;
      assert.equal((await cfg(school)).calculation, "groups");
      assert.equal((await cfg(uni)).calculation, "assessments");
    });
  });
});
