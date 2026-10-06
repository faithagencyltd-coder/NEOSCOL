import "server-only";

import { crc32, deflateRawSync } from "node:zlib";

/**
 * Classeur Excel (.xlsx, Office Open XML) minimal et sans dépendance : une ou
 * plusieurs feuilles, première ligne en gras, textes en chaînes en ligne et
 * nombres en valeurs numériques. Ouvert par Excel, LibreOffice et Google Sheets,
 * et relu par l'import de NeoScool (read-excel-file).
 */
export type SheetCell = string | number | Date | null | undefined;
/** Image (PNG / JPEG) ancrée dans une cellule, dimensions en pixels (proportions décidées par l'appelant). */
export type SheetImage = { row: number; col: number; data: Buffer; mime: "image/png" | "image/jpeg"; width: number; height: number };
export type Sheet = {
  name: string;
  rows: SheetCell[][];
  widths?: number[];
  /** Filtre automatique sur la ligne d'en-tête (première ligne). */
  autoFilter?: boolean;
  /** Hauteurs de lignes en points, par index de ligne (0 = première ligne). */
  rowHeights?: Record<number, number>;
  /** Lignes supplémentaires en gras (totaux…), en plus de la première. */
  boldRows?: number[];
  images?: SheetImage[];
};

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

/** Date (jour) → numéro de série Excel (1900), affiché au format date. */
function excelSerial(date: Date): number {
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

function sheetXml(sheet: Sheet, drawingRel: string | null): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const bold = new Set([0, ...(sheet.boldRows ?? [])]);
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = `${columnName(c)}${r + 1}`;
          const style = bold.has(r) ? ' s="1"' : "";
          if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : `<c r="${ref}" s="2"><v>${excelSerial(value)}</v></c>`;
          if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
        })
        .join("");
      const height = sheet.rowHeights?.[r];
      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const filter = sheet.autoFilter && sheet.rows.length > 1 ? `<autoFilter ref="A1:${columnName(width - 1)}${sheet.rows.length}"/>` : "";
  const drawing = drawingRel ? `<drawing r:id="${drawingRel}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData>${filter}${drawing}</worksheet>`;
}

const EMU = 9525; // 1 pixel = 9525 EMU

/** Dessin d'une feuille : images ancrées à une cellule (oneCellAnchor), taille exacte en pixels. */
function drawingXml(images: SheetImage[], firstId: number): string {
  const anchors = images
    .map(
      (img, i) =>
        `<xdr:oneCellAnchor><xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>${2 * EMU}</xdr:colOff><xdr:row>${img.row}</xdr:row><xdr:rowOff>${2 * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(img.width * EMU)}" cy="${Math.round(img.height * EMU)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${firstId + i}" name="Photo ${firstId + i}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(img.width * EMU)}" cy="${Math.round(img.height * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

/** Dimensions en pixels d'une image PNG ou JPEG (lecture de l'en-tête), ou null. */
export function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1]!;
      const length = data.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
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
  // Feuilles avec images : un dessin chacune, images numérotées pour tout le classeur.
  let media = 0;
  const drawings = sheets.flatMap((sheet, i) => {
    if (!sheet.images?.length) return [];
    const files = sheet.images.map((img) => ({ img, file: `image${++media}.${img.mime === "image/png" ? "png" : "jpeg"}` }));
    return [{ sheet: i, index: i + 1, files }];
  });
  const text = (s: string) => Buffer.from(s, "utf8");
  const entries: Entry[] = [
    {
      name: "[Content_Types].xml",
      data: text(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("")}${drawings
          .map((d) => `<Override PartName="/xl/drawings/drawing${d.index}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
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
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0"/><xf fontId="1" applyFont="1"/><xf fontId="0" numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
      ),
    },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: text(sheetXml(sheet, drawings.some((d) => d.sheet === i) ? "rId1" : null)) })),
    ...drawings.flatMap((d) => [
      {
        name: `xl/worksheets/_rels/sheet${d.index}.xml.rels`,
        data: text(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${d.index}.xml"/></Relationships>`,
        ),
      },
      { name: `xl/drawings/drawing${d.index}.xml`, data: text(drawingXml(d.files.map((f) => f.img), 1)) },
      {
        name: `xl/drawings/_rels/drawing${d.index}.xml.rels`,
        data: text(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${d.files
            .map((f, j) => `<Relationship Id="rId${j + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${f.file}"/>`)
            .join("")}</Relationships>`,
        ),
      },
      ...d.files.map((f) => ({ name: `xl/media/${f.file}`, data: f.img.data })),
    ]),
  ];
  return zip(entries);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
