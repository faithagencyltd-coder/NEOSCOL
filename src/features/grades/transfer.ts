import "server-only";

import type { ParsedTable } from "@/features/migration/parse";

/**
 * Échange des notes avec Excel / CSV. Le fichier exporté sert aussi de modèle
 * d'import : mêmes colonnes, élèves reconnus par leur matricule.
 */
export const GRADE_COLUMNS = ["Matricule", "Nom", "Prénom", "Note", "Absent", "Dispensé", "Commentaire"] as const;

export type SheetStudent = { id: string; first_name: string; last_name: string; matricule: string };
export type SheetGrade = { student_id: string; score: number | null; is_absent: boolean; is_exempt: boolean; comment: string | null };

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Lignes de la feuille d'une évaluation (en-tête compris). */
export function assessmentRows(students: SheetStudent[], grades: SheetGrade[], maxScore: number): (string | number | null)[][] {
  const byStudent = new Map(grades.map((g) => [g.student_id, g]));
  return [
    [...GRADE_COLUMNS.slice(0, 3), `Note (sur ${fmt(maxScore)})`, ...GRADE_COLUMNS.slice(4)],
    ...students.map((s) => {
      const g = byStudent.get(s.id);
      return [
        s.matricule,
        s.last_name,
        s.first_name,
        g && g.score !== null && !g.is_absent && !g.is_exempt ? Number(g.score) : null,
        g?.is_absent ? "oui" : "",
        g?.is_exempt ? "oui" : "",
        g?.comment ?? "",
      ];
    }),
  ];
}

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const YES = new Set(["oui", "o", "x", "yes", "y", "1", "vrai", "true"]);

/** Colonne correspondant à un intitulé (tolère accents, casse, « Note (sur 20) », « Nom et prénom »…). */
function findColumn(headers: string[], ...candidates: string[]): string | undefined {
  const wanted = candidates.map(norm);
  return headers.find((h) => wanted.some((w) => norm(h) === w)) ?? headers.find((h) => wanted.some((w) => norm(h).startsWith(w)));
}

export type ImportLine = {
  line: number;
  matricule: string;
  name: string;
  status: "ok" | "skip" | "error";
  message: string;
  value: string;
};

/**
 * Contrôle d'un fichier importé : chaque ligne est reconnue (matricule, sinon
 * nom + prénom exacts), la note est vérifiée (0 à la note maximale, virgule ou
 * point), « abs » / « absent » et « disp » / « dispensé » sont compris. Une note
 * vide ne modifie rien. Aucune écriture ici : la base applique ensuite ses règles.
 */
export function checkGradeImport(table: ParsedTable, students: SheetStudent[], maxScore: number) {
  const headers = table.headers;
  const cMatricule = findColumn(headers, "Matricule", "N° matricule", "Numero matricule", "ID");
  const cLast = findColumn(headers, "Nom");
  const cFirst = findColumn(headers, "Prénom", "Prenom", "Prénoms");
  const cScore = findColumn(headers, "Note", "Notes", "Score");
  const cAbsent = findColumn(headers, "Absent", "Absence");
  const cExempt = findColumn(headers, "Dispensé", "Dispense", "Exempté");
  const cComment = findColumn(headers, "Commentaire", "Observation", "Appréciation");
  if (!cScore) return { ok: false as const, message: "Colonne « Note » introuvable : utilisez le modèle exporté depuis cette évaluation." };
  if (!cMatricule && !(cLast && cFirst)) return { ok: false as const, message: "Colonne « Matricule » (ou « Nom » et « Prénom ») introuvable." };

  const byMatricule = new Map(students.map((s) => [norm(s.matricule), s]));
  const byName = new Map<string, SheetStudent[]>();
  for (const s of students) {
    const key = `${norm(s.last_name)}|${norm(s.first_name)}`;
    byName.set(key, [...(byName.get(key) ?? []), s]);
  }
  const seen = new Set<string>();
  const lines: ImportLine[] = [];
  const grades: SheetGrade[] = [];

  table.rows.forEach((row, index) => {
    const line = index + 2; // ligne 1 = en-têtes
    const matricule = (cMatricule ? row[cMatricule] : "")?.trim() ?? "";
    const last = (cLast ? row[cLast] : "")?.trim() ?? "";
    const first = (cFirst ? row[cFirst] : "")?.trim() ?? "";
    const raw = (row[cScore] ?? "").trim();
    const absent = cAbsent ? YES.has(norm(row[cAbsent] ?? "")) : false;
    const exempt = cExempt ? YES.has(norm(row[cExempt] ?? "")) : false;
    const comment = cComment ? (row[cComment] ?? "").trim().slice(0, 300) : "";
    if (!matricule && !last && !first && !raw) return; // ligne vide
    const name = [last, first].filter(Boolean).join(" ");
    const push = (status: ImportLine["status"], message: string) => lines.push({ line, matricule, name, status, message, value: raw });

    let student = matricule ? byMatricule.get(norm(matricule)) : undefined;
    if (!student && last && first) {
      const candidates = byName.get(`${norm(last)}|${norm(first)}`) ?? [];
      if (candidates.length > 1) return push("error", "Plusieurs élèves portent ce nom : indiquez le matricule.");
      student = candidates[0];
    }
    if (!student) return push("error", matricule ? `Matricule ${matricule} inconnu dans cette classe.` : "Élève introuvable dans cette classe.");
    if (seen.has(student.id)) return push("error", "Élève présent deux fois dans le fichier.");
    seen.add(student.id);

    const token = norm(raw);
    const isAbsent = absent || ["abs", "absent", "absente", "a"].includes(token);
    const isExempt = !isAbsent && (exempt || ["disp", "dispense", "dispensee", "d", "exempt"].includes(token));
    if (isAbsent || isExempt) {
      grades.push({ student_id: student.id, score: null, is_absent: isAbsent, is_exempt: isExempt, comment: comment || null });
      return push("ok", isAbsent ? "Absent" : "Dispensé");
    }
    if (!raw) return push("skip", "Note vide : inchangée");
    const score = Number(raw.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(score)) return push("error", `« ${raw} » n'est pas une note.`);
    if (score < 0 || score > maxScore) return push("error", `Note hors limites (0 à ${fmt(maxScore)}).`);
    grades.push({ student_id: student.id, score: Math.round(score * 100) / 100, is_absent: false, is_exempt: false, comment: comment || null });
    push("ok", `${fmt(score)} / ${fmt(maxScore)}`);
  });

  return {
    ok: true as const,
    lines,
    grades,
    counts: {
      ok: lines.filter((l) => l.status === "ok").length,
      skip: lines.filter((l) => l.status === "skip").length,
      error: lines.filter((l) => l.status === "error").length,
      missing: students.filter((s) => !seen.has(s.id)).length,
    },
  };
}
