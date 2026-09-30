// P7c — Country Connect : identifiant national (format du pays, unicité),
// correspondances de fichiers (modèle pays / établissement), import vérifié
// puis appliqué (identité jamais écrasée), export journalisé, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const IMPORT_COLUMNS = JSON.stringify([
  { header: "MATRICULE", field: "matricule" },
  { header: "INE", field: "national_id" },
  { header: "NOM", field: "last_name" },
]);
const EXPORT_COLUMNS = JSON.stringify([
  { header: "INE", field: "national_id" },
  { header: "NOM", field: "last_name" },
  { header: "CLASSE", field: "class_name" },
]);

async function saveMapping(q, org, country, direction, columns = direction === "import" ? IMPORT_COLUMNS : EXPORT_COLUMNS) {
  const [{ id }] = await q("select save_country_connect_mapping($1, $2, null, $3, $4, $5::jsonb) as id", [org, country, `Fichier ${direction} test`, direction, columns]);
  return id;
}

async function setPattern(q, pattern) {
  await q("update countries set settings = settings || jsonb_build_object('national_id_pattern', $1::text, 'national_id_label', 'INE') where code = 'CI'", [pattern]);
}

describe("Identifiant national", () => {
  test("nettoyé, conforme au format du pays et unique dans l'établissement", async () => {
    await as(null, async (q) => {
      await setPattern(q, "^CI[0-9]{8}$");
      const students = await q("select id from students where organization_id = $1 order by last_name limit 2", [ORG_DEMO]);
      await q("update students set national_id = ' ci 1234 5678 ' where id = $1", [students[0].id]);
      const [s] = await q("select national_id from students where id = $1", [students[0].id]);
      assert.equal(s.national_id, "CI12345678", "espaces retirés, majuscules");
      assert.match(await rejects(q("update students set national_id = 'X12' where id = $1", [students[1].id])), /INE « X12 » : format non conforme/);
      assert.match(await rejects(q("update students set national_id = 'CI12345678' where id = $1", [students[1].id])), /duplicate key|students_org_national_id/);
      // Même identifiant possible dans un autre établissement (unicité par établissement).
      const [other] = await q("select id from students where organization_id = $1 limit 1", [ORG_DEMOF]);
      await q("update students set national_id = 'CI12345678' where id = $1", [other.id]);
    });
  });

  test("le format du pays doit être une expression régulière valide", async () => {
    await as(null, async (q) => {
      assert.match(await rejects(setPattern(q, "^[0-9{2$")), /Format de l'identifiant national invalide/);
    });
  });
});

describe("Correspondances", () => {
  test("modèle pays réservé au Super Admin ; établissement : paramètres ; colonnes vérifiées", async () => {
    await as(USERS.superadmin, async (q) => {
      const template = await saveMapping(q, null, "CI", "import");
      const [t] = await q("select country_code, organization_id from country_connect_mappings where id = $1", [template]);
      assert.deepEqual(t, { country_code: "CI", organization_id: null });

      await switchTo(q, USERS.admin);
      assert.match(await rejects(saveMapping(q, null, "CI", "import")), /Permission refusée/);
      const own = await saveMapping(q, ORG_DEMO, null, "export");
      assert.ok(own);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "import", JSON.stringify([{ header: "NOM", field: "last_name" }]))), /identifiant national/);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "import", JSON.stringify([{ header: "INE", field: "national_id" }]))), /retrouver l'élève/);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "export", JSON.stringify([{ header: "X", field: "password" }]))), /Champ inconnu/);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "export", JSON.stringify([{ header: "NOM", field: "last_name" }, { header: "nom", field: "first_name" }]))), /En-tête en double/);
      // Modifier la correspondance d'un autre établissement : impossible.
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select save_country_connect_mapping($1, null, $2, 'Détournée', 'export', $3::jsonb)", [ORG_DEMOF, own, EXPORT_COLUMNS])), /introuvable/);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "export")), /Permission refusée/);
      const visible = await q("select id from country_connect_mappings where id = $1", [own]);
      assert.equal(visible.length, 0, "correspondance d'un autre établissement invisible");
      const shared = await q("select id from country_connect_mappings where id = $1", [template]);
      assert.equal(shared.length, 1, "modèle du pays visible par tous");

      await switchTo(q, USERS.teacher);
      assert.match(await rejects(saveMapping(q, ORG_DEMO, null, "export")), /Permission refusée/);
    });
  });
});

describe("Import et export", () => {
  test("vérification sans écriture, puis application : seul l'identifiant est écrit", async () => {
    await as(null, async (q) => {
      await setPattern(q, "^CI[0-9]{8}$");
      const pupils = await q("select id, matricule, last_name from students where organization_id = $1 and status = 'active' and archived_at is null order by last_name, first_name limit 3", [ORG_DEMO]);
      const [foreign] = await q("select matricule from students where organization_id = $1 limit 1", [ORG_DEMOF]);
      await q("update students set national_id = 'CI99999999' where id = $1", [pupils[2].id]);
      await switchTo(q, USERS.superadmin);
      const mapping = await saveMapping(q, null, "CI", "import");
      await switchTo(q, USERS.admin);
      const rows = [
        { line: 2, matricule: pupils[0].matricule, national_id: "ci 0000 0001", last_name: pupils[0].last_name },
        { line: 3, matricule: pupils[1].matricule, national_id: "CI00000002", last_name: "AUTRE NOM" },
        { line: 4, matricule: pupils[2].matricule, national_id: "CI00000003" },
        { line: 5, matricule: "INCONNU-1", national_id: "CI00000004" },
        { line: 6, matricule: foreign.matricule, national_id: "CI00000005" },
        { line: 7, matricule: pupils[0].matricule, national_id: "BAD" },
        { line: 8, matricule: pupils[1].matricule, national_id: "CI00000001" },
      ];
      const [{ r: check }] = await q("select country_connect_import($1, $2, $3::jsonb, false, 'liste.csv') as r", [ORG_DEMO, mapping, JSON.stringify(rows)]);
      assert.equal(check.ok, 2);
      assert.equal(check.errors, 5);
      assert.equal(check.updated, 0);
      const status = Object.fromEntries(check.report.map((r) => [r.line, r.status]));
      assert.deepEqual(status, { 2: "ok", 3: "warning", 4: "error", 5: "error", 6: "error", 7: "error", 8: "error" });
      assert.match(check.report.find((r) => r.line === 4).message, /déjà un autre/);
      assert.match(check.report.find((r) => r.line === 6).message, /introuvable/, "élève d'un autre établissement jamais trouvé");
      assert.match(check.report.find((r) => r.line === 8).message, /en double/);
      const [before] = await q("select national_id from students where id = $1", [pupils[0].id]);
      assert.equal(before.national_id, null, "vérification : aucune écriture");

      const [{ r: applied }] = await q("select country_connect_import($1, $2, $3::jsonb, true, 'liste.csv') as r", [ORG_DEMO, mapping, JSON.stringify(rows)]);
      assert.equal(applied.updated, 2);
      const after = await q("select id, national_id, last_name from students where id = any($1) order by last_name", [pupils.map((p) => p.id)]);
      const byId = Object.fromEntries(after.map((s) => [s.id, s]));
      assert.equal(byId[pupils[0].id].national_id, "CI00000001");
      assert.equal(byId[pupils[1].id].national_id, "CI00000002");
      assert.equal(byId[pupils[1].id].last_name, pupils[1].last_name, "identité NeoScool conservée");
      assert.equal(byId[pupils[2].id].national_id, "CI99999999", "identifiant existant jamais écrasé");
      const jobs = await q("select status, ok_rows, error_rows, updated_rows from country_connect_jobs where organization_id = $1 order by status desc", [ORG_DEMO]);
      assert.deepEqual(jobs.map((j) => j.status), ["checked", "applied"]);
      assert.deepEqual(jobs[1], { status: "applied", ok_rows: 2, error_rows: 5, updated_rows: 2 });
      const audit = await q("select action from audit_logs where action like 'country_connect.import%'");
      assert.equal(audit.length, 2);

      // Autre établissement : historique invisible, import refusé avec la correspondance d'autrui.
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from country_connect_jobs where organization_id = $1", [ORG_DEMO])).length, 0);
      assert.match(await rejects(q("select country_connect_import($1, $2, '[]'::jsonb, false)", [ORG_DEMO, mapping])), /Permission refusée/);
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select country_connect_import($1, $2, '[]'::jsonb, false)", [ORG_DEMO, mapping])), /Permission refusée/);
    });
  });

  test("export : élèves actifs de l'établissement seulement, journalisé ; correspondance d'autrui refusée", async () => {
    await as(USERS.admin, async (q) => {
      const mapping = await saveMapping(q, ORG_DEMO, null, "export");
      const rows = await q("select row_data from country_connect_export($1, $2)", [ORG_DEMO, mapping]);
      const [{ n }] = await q("select count(*)::int as n from students where organization_id = $1 and status = 'active' and archived_at is null", [ORG_DEMO]);
      assert.equal(rows.length, n);
      assert.ok(rows.every((r) => "national_id" in r.row_data && "class_name" in r.row_data));
      assert.ok(rows.some((r) => r.row_data.class_name), "classe de l'année en cours");
      const [job] = await q("select status, total_rows from country_connect_jobs where mapping_id = $1", [mapping]);
      assert.deepEqual(job, { status: "exported", total_rows: n });

      // Un enseignant lit ses élèves mais n'exporte pas l'effectif.
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select * from country_connect_export($1, $2)", [ORG_DEMO, mapping])), /Permission refusée/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select * from country_connect_export($1, $2)", [ORG_DEMOF, mapping])), /introuvable/);
      assert.match(await rejects(q("select * from country_connect_export($1, $2)", [ORG_DEMO, mapping])), /Permission refusée/);
      const [{ ov }] = await q("select country_connect_overview($1) as ov", [ORG_DEMO]);
      assert.equal(ov, null, "couverture d'un autre établissement non lisible");
    });
  });
});
