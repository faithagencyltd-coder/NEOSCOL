/** Champs NeoScool utilisables dans une correspondance Country Connect (liste fermée, vérifiée en base). */
export const CC_FIELDS = [
  { key: "matricule", label: "Matricule NeoScool" },
  { key: "national_id", label: "Identifiant national" },
  { key: "last_name", label: "Nom" },
  { key: "first_name", label: "Prénom" },
  { key: "other_names", label: "Autres prénoms" },
  { key: "sex", label: "Sexe" },
  { key: "birth_date", label: "Date de naissance" },
  { key: "birth_place", label: "Lieu de naissance" },
  { key: "nationality", label: "Nationalité" },
  { key: "class_name", label: "Classe (année en cours)" },
  { key: "academic_year", label: "Année scolaire" },
  { key: "phone", label: "Téléphone" },
  { key: "email", label: "E-mail" },
  { key: "status", label: "Statut" },
  { key: "ignore", label: "(colonne ignorée)" },
] as const;

export type CcField = (typeof CC_FIELDS)[number]["key"];
export type CcColumn = { header: string; field: CcField };

export type CcMapping = {
  id: string;
  organization_id: string | null;
  country_code: string | null;
  name: string;
  direction: "import" | "export";
  columns: CcColumn[];
  delimiter: ";" | "," | "tab";
  date_format: "dd/MM/yyyy" | "yyyy-MM-dd" | "MM/dd/yyyy";
  is_active: boolean;
  description: string | null;
  updated_at: string;
};

export type CcReportLine = {
  line: number;
  status: "ok" | "warning" | "unchanged" | "error";
  message: string | null;
  student: string | null;
  national_id: string | null;
};

export type CcImportResult = {
  job_id: string;
  total: number;
  ok: number;
  errors: number;
  updated: number;
  applied: boolean;
  report: CcReportLine[];
};

/** Colonnes saisies une par ligne : « EN-TÊTE DU FICHIER = champ ». */
export function columnsToText(columns: CcColumn[]): string {
  return columns.map((c) => `${c.header} = ${c.field}`).join("\n");
}

export function parseColumnsText(text: string): { ok: true; columns: CcColumn[] } | { ok: false; message: string } {
  const keys = CC_FIELDS.map((f) => f.key as string);
  const columns: CcColumn[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const at = line.lastIndexOf("=");
    if (at <= 0) return { ok: false, message: `Ligne ${i + 1} : écrivez « EN-TÊTE = champ » (ex. « INE = national_id »).` };
    const header = line.slice(0, at).trim();
    const field = line.slice(at + 1).trim().toLowerCase();
    if (!keys.includes(field)) return { ok: false, message: `Ligne ${i + 1} : champ « ${field} » inconnu. Champs possibles : ${keys.join(", ")}.` };
    columns.push({ header, field: field as CcField });
  }
  if (columns.length === 0) return { ok: false, message: "Indiquez au moins une colonne." };
  return { ok: true, columns };
}

export const DELIMITERS: Record<CcMapping["delimiter"], string> = { ";": ";", ",": ",", tab: "\t" };

/** Date ISO (aaaa-mm-jj) mise au format de la correspondance. */
export function formatCcDate(iso: string | null | undefined, format: CcMapping["date_format"]): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const [, y, mo, d] = m;
  return format === "yyyy-MM-dd" ? `${y}-${mo}-${d}` : format === "MM/dd/yyyy" ? `${mo}/${d}/${y}` : `${d}/${mo}/${y}`;
}
