// Migration des données historiques : import, doublons, isolation multi-établissements, permissions.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, USERS } from "./helpers.mjs";

after(() => pool.end());

const HEADERS = ["Matricule", "Nom", "Prénoms", "Né le", "Classe", "Année", "Moyenne", "Statut", "Diplôme"];
const MAPPING = {
  legacy_matricule: "Matricule",
  last_name: "Nom",
  first_name: "Prénoms",
  birth_date: "Né le",
  class_name: "Classe",
  year_label: "Année",
  average: "Moyenne",
  status: "Statut",
  diploma_title: "Diplôme",
};
const ROWS = [
  { n: 2, d: { Matricule: "T-001", Nom: "Testeur", Prénoms: "Alpha", "Né le": "12/05/2003", Classe: "3e A", Année: "2017-2018", Moyenne: "12,5", Statut: "diplômé", Diplôme: "BEPC" } },
  { n: 3, d: { Matricule: "T-001", Nom: "TESTEUR", Prénoms: "alpha", "Né le": "12/05/2003", Classe: "2nde C", Année: "2018/2019", Moyenne: "13" } },
  { n: 4, d: { Matricule: "T-002", Nom: "Sansprenom", Prénoms: "", "Né le": "2004-01-01", Classe: "CM2", Année: "2015" } },
  { n: 5, d: { Matricule: "T-003", Nom: "Archive", Prénoms: "Beta", "Né le": "38000", Classe: "Tle D", Année: "1998-1999", Statut: "archivé" } },
];

async function importBatch(q, org = ORG_DEMO) {
  const [{ id }] = await q("select public.migration_create_batch($1, 'students', 'test.csv', 100, null, $2) as id", [org, HEADERS]);
  await q("select public.migration_append_rows($1, $2)", [id, JSON.stringify(ROWS)]);
  const [{ stats }] = await q("select public.migration_analyze($1, $2, $3) as stats", [id, JSON.stringify(MAPPING), JSON.stringify({ create_years: true })]);
  let done = false;
  while (!done) {
    const [{ r }] = await q("select public.migration_import_chunk($1, 2) as r", [id]);
    done = r.done;
  }
  return { id, stats };
}

describe("Migration des données historiques", () => {
  test("import complet : regroupement par élève, parcours, diplôme, années anciennes clôturées, rejet des lignes invalides", async () => {
    await as(USERS.admin, async (q) => {
      const { id, stats } = await importBatch(q);
      assert.equal(stats.rows, 4);
      assert.equal(stats.invalid, 1, "prénom manquant → invalide");
      const students = await q("select last_name, status, legacy_matricule, origin, archived_at is not null as archived, entry_year, exit_year from students where import_batch_id = $1 order by last_name", [id]);
      assert.deepEqual(
        students.map((s) => [s.last_name, s.status, s.legacy_matricule, s.origin, s.archived]),
        [
          ["ARCHIVE", "alumni", "T-003", "import", true],
          ["TESTEUR", "graduated", "T-001", "import", false],
        ],
      );
      assert.equal(students[1].entry_year, 2017, "année d'entrée déduite du parcours");
      assert.equal(students[1].exit_year, 2019, "année de sortie déduite du parcours");
      const history = await q("select year_label, class_name, average from student_history where batch_id = $1 order by year_label", [id]);
      assert.deepEqual(history.map((h) => [h.year_label, h.class_name, Number(h.average ?? 0)]), [
        ["1998-1999", "Tle D", 0],
        ["2017-2018", "3e A", 12.5],
        ["2018-2019", "2nde C", 13],
      ]);
      assert.equal((await q("select title from student_diplomas where batch_id = $1", [id]))[0].title, "BEPC");
      const years = await q("select name, status, is_current from academic_years where organization_id = $1 and name in ('1998-1999', '2017-2018', '2018-2019')", [ORG_DEMO]);
      assert.equal(years.length, 3);
      assert.ok(years.every((y) => y.status === "closed" && !y.is_current));
      const [batch] = await q("select status, stats from migration_batches where id = $1", [id]);
      assert.equal(batch.status, "completed");
      assert.equal(batch.stats.rejected, 1);
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'migration.completed' and entity_id = $1", [id]))[0].n, 1);
    });
  });

  test("doublon détecté (nom, prénom, date de naissance) et rattachement au dossier existant", async () => {
    await as(USERS.admin, async (q) => {
      const [existing] = await q("select id, last_name, first_name, birth_date::text as b from students where organization_id = $1 and birth_date is not null order by last_name limit 1", [ORG_DEMO]);
      const [{ id }] = await q("select public.migration_create_batch($1, 'students', 'dup.csv', 10, null, $2) as id", [ORG_DEMO, ["Nom", "Prénom", "Naissance", "Année", "Classe"]]);
      await q("select public.migration_append_rows($1, $2)", [id, JSON.stringify([{ n: 2, d: { Nom: existing.last_name, Prénom: existing.first_name, Naissance: existing.b, Année: "2012-2013", Classe: "CP" } }])]);
      await q("select public.migration_analyze($1, $2, '{}')", [id, JSON.stringify({ last_name: "Nom", first_name: "Prénom", birth_date: "Naissance", year_label: "Année", class_name: "Classe" })]);
      const [row] = await q("select status, resolution, duplicate_student_id, duplicate_score from migration_rows where batch_id = $1", [id]);
      assert.equal(row.status, "duplicate");
      assert.equal(row.duplicate_student_id, existing.id);
      assert.ok(row.duplicate_score >= 80);
      assert.equal(row.resolution, "existing");
      await q("select public.migration_import_chunk($1, 50)", [id]);
      assert.equal((await q("select count(*)::int as n from students where import_batch_id = $1", [id]))[0].n, 0, "aucun doublon créé");
      assert.equal((await q("select count(*)::int as n from student_history where student_id = $1 and year_label = '2012-2013'", [existing.id]))[0].n, 1);
    });
  });

  test("isolation : un autre établissement ne voit ni n'utilise les lots, anciens élèves et historiques", async () => {
    let batchId;
    await as(USERS.admin, async (q) => {
      ({ id: batchId } = await importBatch(q));
      // Contrôles dans la même transaction, avec l'identité de l'autre établissement.
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USERS.otherOrgAdmin, role: "authenticated" })]);
      assert.equal((await q("select id from migration_batches where id = $1", [batchId])).length, 0);
      assert.equal((await q("select id from migration_rows where batch_id = $1", [batchId])).length, 0);
      assert.equal((await q("select id from student_history where batch_id = $1", [batchId])).length, 0);
      assert.equal((await q("select id from student_diplomas where batch_id = $1", [batchId])).length, 0);
      assert.equal((await q("select id from students where legacy_matricule = 'T-001'")).length, 0);
      assert.equal((await q("select * from public.find_student_duplicates($1, 'TESTEUR', 'Alpha', '2003-05-12', 'T-001')", [ORG_DEMO])).length, 0);
      const o = await q("select public.historical_overview($1) as o", [ORG_DEMO]);
      assert.equal(o[0].o.former_total, 0, "aucune donnée d'un autre établissement dans les compteurs");
      for (const call of [
        () => q("select public.migration_import_chunk($1, 10)", [batchId]),
        () => q("select public.migration_cancel($1)", [batchId]),
        () => q("select public.migration_create_batch($1, 'students', 'x.csv', 1, null, array['Nom'])", [ORG_DEMO]),
        () => q("select public.create_past_academic_years($1, 2000, 2001)", [ORG_DEMO]),
        () => q("select public.create_legacy_student($1, '{\"last_name\":\"X\",\"first_name\":\"Y\"}')", [ORG_DEMO]),
      ]) {
        assert.match(await rejects(call()), /permission|introuvable/i);
      }
    });
  });

  test("notes historiques : un matricule d'un autre établissement n'est jamais rattaché", async () => {
    await as(USERS.otherOrgAdmin, async (q) => {
      const [{ id }] = await q("select public.migration_create_batch($1, 'grades', 'notes.csv', 10, null, $2) as id", [ORG_DEMOF, ["Matricule", "Année", "Matière", "Note"]]);
      await q("select public.migration_append_rows($1, $2)", [id, JSON.stringify([{ n: 2, d: { Matricule: "DEMO-26-00001", Année: "2019-2020", Matière: "Maths", Note: "12" } }])]);
      await q("select public.migration_analyze($1, $2, '{}')", [id, JSON.stringify({ student_ref: "Matricule", year_label: "Année", subject: "Matière", score: "Note" })]);
      const [row] = await q("select status, student_id, issues from migration_rows where batch_id = $1", [id]);
      assert.equal(row.status, "invalid");
      assert.equal(row.student_id, null);
      assert.match(row.issues[0].message, /introuvable/);
    });
  });

  test("permissions : sans students.import, aucun import possible", async () => {
    await as(USERS.teacher, async (q) => {
      assert.match(await rejects(q("select public.migration_create_batch($1, 'students', 'x.csv', 1, null, array['Nom'])", [ORG_DEMO])), /students\.import/);
      assert.equal((await q("select id from migration_batches")).length, 0);
    });
    await as(USERS.accountant, async (q) => {
      assert.match(await rejects(q("select public.create_legacy_student($1, '{\"last_name\":\"X\",\"first_name\":\"Y\"}')", [ORG_DEMO])), /students\.create/);
    });
  });

  test("ajout manuel d'un ancien élève : statut, parcours, diplôme et année créée", async () => {
    await as(USERS.admin, async (q) => {
      const [{ id }] = await q(
        "select public.create_legacy_student($1, $2, $3, $4) as id",
        [
          ORG_DEMO,
          JSON.stringify({ last_name: "manuel", first_name: "Gamma", status: "transferred", entry_year: "2010", exit_year: "2014" }),
          JSON.stringify({ year_label: "2013/2014", class_name: "5e B", average: "11.5" }),
          JSON.stringify({ title: "CEPE", year_label: "2012" }),
        ],
      );
      const [s] = await q("select last_name, status, origin, entry_year, exit_year from students where id = $1", [id]);
      assert.deepEqual([s.last_name, s.status, s.origin, s.entry_year, s.exit_year], ["MANUEL", "transferred", "manual_history", 2010, 2014]);
      assert.equal((await q("select year_label from student_history where student_id = $1", [id]))[0].year_label, "2013-2014");
      assert.equal((await q("select year_label from student_diplomas where student_id = $1", [id]))[0].year_label, "2012-2013");
      assert.equal((await q("select status from academic_years where organization_id = $1 and name = '2013-2014'", [ORG_DEMO]))[0].status, "closed");
    });
  });
});
