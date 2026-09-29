/** CSV avec séparateur au choix, BOM UTF-8 (lisible par Excel), valeurs échappées telles quelles. */
export function toDelimitedCsv(header: string[], rows: string[][], separator: string): string {
  const special = new RegExp(`[${separator === "\t" ? "\\t" : separator}"\\r\\n]`);
  const escape = (value: string) => (special.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${[header, ...rows].map((r) => r.map((v) => escape(v ?? "")).join(separator)).join("\r\n")}\r\n`;
}

/** CSV « Excel français » : séparateur « ; », BOM UTF-8, valeurs échappées telles quelles. */
export function toImportCsv(header: string[], rows: string[][]): string {
  return toDelimitedCsv(header, rows, ";");
}
