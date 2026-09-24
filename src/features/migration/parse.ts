import "server-only";

import readXlsxFile from "read-excel-file/node";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 80;

export type ParsedTable = { headers: string[]; rows: Record<string, string>[]; sheet?: string; format: "xlsx" | "csv" };
type Result = { ok: true; table: ParsedTable } | { ok: false; message: string };

/** Lit un fichier Excel (.xlsx) ou CSV : en-têtes (1re ligne non vide) + lignes, valeurs en texte. */
export async function parseImportFile(file: File): Promise<Result> {
  if (!file || file.size === 0) return { ok: false, message: "Aucun fichier sélectionné." };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "Fichier trop volumineux (5 Mo maximum) : découpez-le en plusieurs fichiers." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  // .xlsx = archive ZIP (« PK »). L'ancien format .xls (binaire OLE) n'est pas pris en charge.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    return { ok: false, message: "Format Excel 97-2003 (.xls) : ouvrez le fichier dans Excel et enregistrez-le en « .xlsx » ou « CSV »." };
  }
  if (name.endsWith(".xlsx")) return { ok: false, message: "Fichier Excel illisible ou endommagé." };
  return parseCsv(bytes);
}

async function parseXlsx(bytes: Uint8Array): Promise<Result> {
  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    sheets = await readXlsxFile(Buffer.from(bytes));
  } catch {
    return { ok: false, message: "Fichier Excel illisible ou endommagé." };
  }
  const sheet = sheets.find((s) => s.data.some((row) => row.some((cell) => cell !== null && String(cell).trim() !== "")));
  if (!sheet) return { ok: false, message: "Le classeur ne contient aucune donnée." };
  const matrix = sheet.data.map((row) => row.map(cellToText));
  return build(matrix, "xlsx", sheet.sheet);
}

function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return "";
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell === "number") return Number.isInteger(cell) ? String(cell) : String(Math.round(cell * 10_000) / 10_000);
  if (typeof cell === "boolean") return cell ? "oui" : "non";
  return String(cell).trim();
}

function decode(bytes: Uint8Array): string {
  // UTF-8 (avec ou sans BOM), sinon Windows-1252 (exports Excel « CSV » français).
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = -1;
  for (const d of [";", ",", "\t", "|"]) {
    const counts = sample.map((l) => splitCsvLine(l, d).length);
    const min = Math.min(...counts);
    const consistent = counts.every((c) => c === counts[0]);
    const score = min > 1 ? min + (consistent ? 100 : 0) : 0;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  return parseCsvText(line, delimiter)[0] ?? [];
}

/** Analyse CSV (RFC 4180) : guillemets, guillemets doublés, retours à la ligne dans les champs. */
function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseCsv(bytes: Uint8Array): Result {
  const text = decode(bytes);
  if (text.includes("\u0000")) return { ok: false, message: "Format non reconnu : utilisez un fichier Excel (.xlsx) ou CSV." };
  const matrix = parseCsvText(text, detectDelimiter(text)).map((r) => r.map((v) => v.trim()));
  return build(matrix, "csv");
}

function build(matrix: string[][], format: ParsedTable["format"], sheet?: string): Result {
  const nonEmpty = (r: string[]) => r.some((v) => v !== "");
  const headerIndex = matrix.findIndex(nonEmpty);
  if (headerIndex < 0) return { ok: false, message: "Le fichier est vide." };
  const rawHeaders = matrix[headerIndex]!;
  // Largeur utile : dernière colonne ayant un en-tête ou une valeur.
  const width = Math.max(rawHeaders.length, ...matrix.slice(headerIndex + 1, headerIndex + 200).map((r) => r.length));
  if (width > MAX_IMPORT_COLUMNS) return { ok: false, message: `Trop de colonnes (${width}) : ${MAX_IMPORT_COLUMNS} au maximum.` };
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = (rawHeaders[i] ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || `Colonne ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const body = matrix.slice(headerIndex + 1).filter(nonEmpty);
  if (body.length === 0) return { ok: false, message: "Le fichier ne contient que des en-têtes." };
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, message: `Trop de lignes (${body.length}) : ${MAX_IMPORT_ROWS} au maximum par import.` };
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").slice(0, 1000)])));
  return { ok: true, table: { headers, rows, sheet, format } };
}

/** Profil d'une colonne pour l'étape « Analyse » : remplissage, type dominant, exemples. */
export function profileColumns(table: ParsedTable) {
  return table.headers.map((header) => {
    const values = table.rows.map((r) => r[header] ?? "").filter((v) => v !== "");
    const sample = values.slice(0, 200);
    const isDate = (v: string) => /^\d{4}-\d{1,2}-\d{1,2}/.test(v) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v);
    const isNumber = (v: string) => /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, ""));
    const share = (fn: (v: string) => boolean) => (sample.length ? sample.filter(fn).length / sample.length : 0);
    const type = share(isDate) > 0.7 ? "date" : share(isNumber) > 0.7 ? "nombre" : "texte";
    return {
      header,
      filled: table.rows.length ? Math.round((values.length / table.rows.length) * 100) : 0,
      type,
      distinct: new Set(sample).size,
      examples: [...new Set(values)].slice(0, 3),
    };
  });
}
