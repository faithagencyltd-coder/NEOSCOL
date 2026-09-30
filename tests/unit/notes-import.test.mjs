// Import / export des notes (Excel, CSV) : contrôle ligne par ligne et classeur .xlsx relisible.
import { register } from "node:module";
import { createRequire } from "node:module";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// « server-only » et les alias « @/… » neutralisés pour exécuter les modules hors Next.js.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
        if (specifier.startsWith("@/")) return next(new URL("../../src/" + specifier.slice(2) + ".ts", ${JSON.stringify(import.meta.url)}).href, context);
        return next(specifier, context);
      }`),
);

const { checkGradeImport, assessmentRows } = await import("../../src/features/grades/transfer.ts");
const { buildXlsx } = await import("../../src/lib/xlsx/write.ts");
const readXlsx = createRequire(import.meta.url)("read-excel-file/node");

const students = [
  { id: "a", first_name: "Kofi", last_name: "BAMBA", matricule: "DEMO-26-00001" },
  { id: "b", first_name: "Awa", last_name: "KONÉ", matricule: "DEMO-26-00002" },
  { id: "c", first_name: "Ali", last_name: "TRAORÉ", matricule: "DEMO-26-00003" },
  { id: "d", first_name: "Ali", last_name: "TRAORE", matricule: "DEMO-26-00004" },
];
const table = (rows) => ({ headers: ["Matricule", "Nom", "Prénom", "Note (sur 20)", "Absent", "Commentaire"], rows, format: "csv" });

describe("Import des notes", () => {
  test("notes avec virgule, absent, note vide inchangée, erreurs expliquées", () => {
    const r = checkGradeImport(
      table([
        { Matricule: "demo-26-00001", Nom: "", Prénom: "", "Note (sur 20)": "14,5", Absent: "", Commentaire: "Bien" },
        { Matricule: "", Nom: "Koné", Prénom: "awa", "Note (sur 20)": "abs", Absent: "", Commentaire: "" },
        { Matricule: "DEMO-26-00003", Nom: "", Prénom: "", "Note (sur 20)": "", Absent: "", Commentaire: "" },
        { Matricule: "X-99", Nom: "", Prénom: "", "Note (sur 20)": "12", Absent: "", Commentaire: "" },
        { Matricule: "DEMO-26-00004", Nom: "", Prénom: "", "Note (sur 20)": "25", Absent: "", Commentaire: "" },
        { Matricule: "DEMO-26-00001", Nom: "", Prénom: "", "Note (sur 20)": "10", Absent: "", Commentaire: "" },
      ]),
      students,
      20,
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.counts, { ok: 2, skip: 1, error: 3, missing: 0 });
    assert.deepEqual(r.grades, [
      { student_id: "a", score: 14.5, is_absent: false, is_exempt: false, comment: "Bien" },
      { student_id: "b", score: null, is_absent: true, is_exempt: false, comment: null },
    ]);
    assert.match(r.lines.find((l) => l.line === 5).message, /inconnu/);
    assert.match(r.lines.find((l) => l.line === 6).message, /hors limites/);
    assert.match(r.lines.find((l) => l.line === 7).message, /deux fois/);
  });

  test("colonne Note absente : fichier refusé avec une explication", () => {
    const r = checkGradeImport({ headers: ["Matricule", "Nom"], rows: [], format: "csv" }, students, 20);
    assert.equal(r.ok, false);
    assert.match(r.message, /Note/);
  });

  test("le fichier exporté (.xlsx) se relit et sert de modèle d'import", async () => {
    const rows = assessmentRows(students.slice(0, 2), [{ student_id: "a", score: 16, is_absent: false, is_exempt: false, comment: null }], 20);
    const buffer = buildXlsx([{ name: "Devoir 1", rows }]);
    const [sheet] = await readXlsx.default(buffer);
    assert.deepEqual(sheet.data[0].slice(0, 4), ["Matricule", "Nom", "Prénom", "Note (sur 20)"]);
    assert.equal(sheet.data[1][3], 16);
    const [headers, ...data] = sheet.data.map((r) => r.map((c) => (c === null ? "" : String(c))));
    const reimport = checkGradeImport({ headers, rows: data.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))), format: "xlsx" }, students, 20);
    assert.equal(reimport.counts.ok, 1);
    assert.equal(reimport.counts.skip, 1);
  });
});
