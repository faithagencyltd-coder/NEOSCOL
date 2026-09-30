import "server-only";

import { crc32, deflateRawSync } from "node:zlib";

/**
 * Classeur Excel (.xlsx, Office Open XML) minimal et sans dépendance : une ou
 * plusieurs feuilles, première ligne en gras, textes en chaînes en ligne et
 * nombres en valeurs numériques. Ouvert par Excel, LibreOffice et Google Sheets,
 * et relu par l'import de Neoscool (read-excel-file).
 */
export type SheetCell = string | number | null | undefined;
export type Sheet = { name: string; rows: SheetCell[][]; widths?: number[] };

const esc = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = `${columnName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : "";
          if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Noms de feuilles Excel : 31 caractères, sans : \ / ? * [ ], uniques. */
function sheetNames(sheets: Sheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((s, i) => {
    let base = s.name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || `Feuille ${i + 1}`;
    while (used.has(base.toLowerCase())) base = `${base.slice(0, 28)} ${i + 1}`;
    used.add(base.toLowerCase());
    return base;
  });
}

type Entry = { name: string; data: Buffer };

/** Archive ZIP (méthode « deflate »), suffisante pour un classeur Office. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); // date/heure DOS neutres
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function buildXlsx(sheets: Sheet[]): Buffer {
  const names = sheetNames(sheets);
  const text = (s: string) => Buffer.from(s, "utf8");
  const entries: Entry[] = [
    {
      name: "[Content_Types].xml",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("")}</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
          .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/styles.xml",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
      ),
    },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: text(sheetXml(sheet)) })),
  ];
  return zip(entries);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
