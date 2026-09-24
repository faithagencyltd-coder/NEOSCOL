/** CSV « Excel français » : séparateur « ; », BOM UTF-8, valeurs échappées telles quelles. */
export function toImportCsv(header: string[], rows: string[][]): string {
  const escape = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return `﻿${[header, ...rows].map((r) => r.map((v) => escape(v ?? "")).join(";")).join("\r\n")}\r\n`;
}
