import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { ListSection, TimetableEntry, TimetableSection } from "@/features/exports/data";
import { pdfDate, pdfText } from "@/lib/pdf/format";

import type { DocImages, DocOrganization } from "../types";
import { COLORS, DemoMark, DocHeader, Signatures, styles } from "./common";

/**
 * Exports PDF : listes de classe et emplois du temps. Une section (classe,
 * session, promotion, groupe, enseignant…) commence toujours sur une nouvelle
 * page ; les lignes sont paginées ici (en-tête de tableau répété, aucune ligne
 * coupée entre deux pages, noms longs sur plusieurs lignes).
 */

const FONT = 8.5;
const LINE = FONT * 1.25;

/** Nombre de lignes estimé d'un texte dans une colonne (Helvetica ≈ 0,52 em par caractère). */
function lines(text: string, width: number, size = FONT): number {
  const perLine = Math.max(4, Math.floor((width - 6) / (size * 0.52)));
  return text.split(/\n/).reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

/** Coupe les mots trop longs pour la colonne (après un trait d'union si possible) : aucun débordement sur la colonne voisine. */
function fit(text: string, width: number, em = 0.55, size = FONT): string {
  const perLine = Math.max(4, Math.floor((width - 6) / (size * em)));
  return text
    .split(" ")
    .map((word) => {
      const parts: string[] = [];
      let rest = word;
      while (rest.length > perLine) {
        const cut = rest.lastIndexOf("-", perLine - 1);
        const at = cut >= Math.floor(perLine / 3) ? cut + 1 : perLine;
        parts.push(rest.slice(0, at));
        rest = rest.slice(at);
      }
      parts.push(rest);
      return parts.join("\n");
    })
    .join(" ");
}

/** Répartit des lignes de hauteur connue sur des pages (la première page peut être plus courte). */
function paginate<T>(items: { item: T; height: number }[], firstCapacity: number, nextCapacity: number): T[][] {
  const pages: T[][] = [[]];
  let left = firstCapacity;
  for (const { item, height } of items) {
    if (height > left && pages[pages.length - 1]!.length) {
      pages.push([]);
      left = nextCapacity;
    }
    pages[pages.length - 1]!.push(item);
    left -= height;
  }
  return pages;
}

function PageFooter({ organization, label }: { organization: DocOrganization; label: string }) {
  return (
    <View style={styles.footer} fixed>
      <View style={{ flex: 1 }}>
        <Text style={styles.small}>{pdfText(label)}</Text>
        {organization.footer_text ? <Text style={styles.small}>{pdfText(organization.footer_text)}</Text> : null}
      </View>
      <Text style={styles.small} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Listes de classe
// ---------------------------------------------------------------------------
type ListColumn = { key: string; label: string; width: number; align?: "left" | "center" };

export type ListPdfOptions = {
  title: string;
  klassLabel: string;
  trackLabel: string;
  programLabel: string;
  yearName: string;
  sexLabel: string | null;
  generatedAt: string;
  withPhotos: boolean;
  photos: Map<string, string>;
  splitBySex: boolean;
  emptyText: string;
};

function listColumns(withPhotos: boolean, withGroup: boolean, width: number): ListColumn[] {
  const fixed: ListColumn[] = [
    { key: "n", label: "N°", width: 22, align: "center" },
    ...(withPhotos ? [{ key: "photo", label: "Photo", width: 34, align: "center" as const }] : []),
    { key: "matricule", label: "Matricule", width: 78 },
    { key: "nom", label: "Nom", width: 0 },
    { key: "prenoms", label: "Prénoms", width: 0 },
    { key: "sexe", label: "Sexe", width: 26, align: "center" },
    { key: "naissance", label: "Né(e) le", width: 52, align: "center" },
    { key: "age", label: "Âge", width: 24, align: "center" },
    { key: "lieu", label: "Lieu de naissance", width: 74 },
    ...(withGroup ? [{ key: "groupe", label: "Groupe", width: 52 }] : []),
  ];
  const used = fixed.reduce((n, c) => n + c.width, 0);
  const free = Math.max(120, width - used);
  return fixed.map((c) => (c.key === "nom" ? { ...c, width: Math.floor(free * 0.42) } : c.key === "prenoms" ? { ...c, width: Math.floor(free * 0.58) } : c));
}

type ListRow = { n: number; values: Record<string, string>; photo: string | null };

function ListTableHeader({ columns, color }: { columns: ListColumn[]; color: string }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }}>
      {columns.map((c) => (
        <Text key={c.key} style={{ width: c.width, paddingVertical: 4, paddingHorizontal: 3, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 7.5, textAlign: c.align ?? "left" }}>
          {pdfText(c.label)}
        </Text>
      ))}
    </View>
  );
}

function ListTableRow({ row, columns, height, zebra }: { row: ListRow; columns: ListColumn[]; height: number; zebra: boolean }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", minHeight: height, alignItems: "center", backgroundColor: zebra ? COLORS.soft : "#FFFFFF", borderBottomWidth: 0.5, borderBottomColor: COLORS.line }}>
      {columns.map((c) =>
        c.key === "photo" ? (
          <View key={c.key} style={{ width: c.width, height: 30, alignItems: "center", justifyContent: "center" }}>
            {row.photo ? (
              // Proportions conservées (contain) ; absence de photo : case vide, aucune image fabriquée.
              <Image src={row.photo} style={{ width: 24, height: 30, objectFit: "contain" }} />
            ) : (
              <View style={{ width: 22, height: 28, borderWidth: 0.5, borderColor: COLORS.line, borderRadius: 2 }} />
            )}
          </View>
        ) : (
          <Text key={c.key} style={{ width: c.width, paddingVertical: 2.5, paddingHorizontal: 3, fontSize: FONT, textAlign: c.align ?? "left", fontFamily: c.key === "nom" ? "Helvetica-Bold" : "Helvetica" }}>
            {pdfText(row.values[c.key] ?? "")}
          </Text>
        ),
      )}
    </View>
  );
}

function SectionHeading({ section, options, continued, color, subsetLabel }: { section: ListSection; options: ListPdfOptions; continued: boolean; color: string; subsetLabel?: string }) {
  const details = [
    section.level,
    section.program ? `${options.programLabel} ${section.program}` : null,
    section.track ? `${options.trackLabel} ${section.track}` : null,
    section.faculty,
    section.department,
    section.group ? `Groupe ${section.group}` : null,
  ].filter(Boolean);
  return (
    <View style={{ marginTop: 10, marginBottom: 6 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, color }}>
        {pdfText(`${options.title} — ${options.klassLabel} ${section.name}${continued ? " (suite)" : ""}`)}
      </Text>
      {!continued ? (
        <>
          {details.length ? <Text style={[styles.small, { marginTop: 2 }]}>{pdfText(details.join(" · "))}</Text> : null}
          <Text style={[styles.small, { marginTop: 2 }]}>
            {pdfText(`Année : ${options.yearName} · Générée le ${options.generatedAt}${options.sexLabel ? ` · ${options.sexLabel}` : ""}`)}
          </Text>
        </>
      ) : null}
      {subsetLabel ? <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 6 }}>{pdfText(subsetLabel)}</Text> : null}
    </View>
  );
}

function Totals({ section, color }: { section: ListSection; color: string }) {
  const items: [string, number][] = [
    ["Effectif total", section.students.length],
    ["Garçons", section.boys],
    ["Filles", section.girls],
  ];
  return (
    <View wrap={false} style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
      {items.map(([label, value]) => (
        <View key={label} style={[styles.box, { flex: 1, borderLeftWidth: 3, borderLeftColor: color }]}>
          <Text style={{ color: COLORS.muted, fontSize: 8 }}>{pdfText(label)}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Pages d'une section (classe / groupe) : tableau paginé, totaux, signature et cachet. */
export function classListPages(section: ListSection, organization: DocOrganization, images: DocImages, options: ListPdfOptions, key: string): ReactElement[] {
  const color = organization.primary_color;
  const width = 595.28 - 64;
  const withGroup = section.students.some((s) => s.group) && !section.group;
  const columns = listColumns(options.withPhotos, withGroup, width);
  const widthOf = (k: string) => columns.find((c) => c.key === k)?.width ?? 60;
  const subsets: { label?: string; students: ListSection["students"] }[] = options.splitBySex
    ? [
        { label: `Garçons (${section.boys})`, students: section.students.filter((s) => s.sex === "M") },
        { label: `Filles (${section.girls})`, students: section.students.filter((s) => s.sex === "F") },
        ...(section.students.some((s) => s.sex !== "M" && s.sex !== "F") ? [{ label: "Sexe non renseigné", students: section.students.filter((s) => s.sex !== "M" && s.sex !== "F") }] : []),
      ]
    : [{ students: section.students }];

  // Contenu à paginer : titres de sous-groupe, en-têtes et lignes.
  type Block = { kind: "subset"; label: string } | { kind: "row"; row: ListRow; height: number };
  const blocks: { item: Block; height: number }[] = [];
  for (const subset of subsets) {
    if (subset.label) blocks.push({ item: { kind: "subset", label: subset.label }, height: 26 });
    subset.students.forEach((s, i) => {
      const values: Record<string, string> = {
        n: String(i + 1),
        matricule: fit(s.matricule, widthOf("matricule"), 0.5),
        nom: fit(s.last_name.toUpperCase(), widthOf("nom"), 0.72), // capitales en gras : plus larges
        prenoms: fit(s.first_names, widthOf("prenoms")),
        sexe: s.sex ?? "",
        naissance: s.birth_date ? pdfDate(s.birth_date, organization.timezone) : "",
        age: s.age === null ? "" : String(s.age),
        lieu: fit(s.birth_place ?? "", widthOf("lieu")),
        groupe: fit(s.group ?? "", widthOf("groupe")),
      };
      const textHeight = Math.max(...["matricule", "nom", "prenoms", "lieu", "groupe"].map((k) => (values[k] ? lines(values[k]!, widthOf(k)) : 1))) * LINE + 5;
      const height = Math.max(options.withPhotos ? 32 : 15, textHeight);
      const row = { n: i + 1, values, photo: options.withPhotos && s.photo_file_id ? (options.photos.get(s.photo_file_id) ?? null) : null };
      blocks.push({ item: { kind: "row", row, height }, height });
    });
  }
  // Hauteur utile : page A4 − marges − en-tête de l'établissement − titre de section − en-tête du tableau.
  const pageHeight = 841.89 - 28 - 64 - 60;
  const pages = paginate(blocks, pageHeight - 62 - 20, pageHeight - 28 - 20);
  const tail = 64 + 120; // totaux + signature
  const lastHeight = (pages[pages.length - 1] ?? []).reduce((n, b) => n + (b.kind === "row" ? b.height : 26), 0);
  const capacity = pages.length === 1 ? pageHeight - 62 - 20 : pageHeight - 28 - 20;
  const tailOnNewPage = lastHeight + tail > capacity;
  const footerLabel = `${options.title} — ${options.klassLabel} ${section.name} · ${options.yearName}`;

  const renderBlocks = (items: Block[]) => {
    const out: ReactElement[] = [];
    let open: ListRow[] = [];
    let heights: number[] = [];
    const flush = (k: string) => {
      if (!open.length) return;
      out.push(
        <View key={k} style={{ borderWidth: 0.5, borderColor: COLORS.line, borderRadius: 3 }}>
          <ListTableHeader columns={columns} color={color} />
          {open.map((row, i) => (
            <ListTableRow key={i} row={row} columns={columns} height={heights[i]!} zebra={i % 2 === 1} />
          ))}
        </View>,
      );
      open = [];
      heights = [];
    };
    items.forEach((b, i) => {
      if (b.kind === "subset") {
        flush(`t${i}`);
        out.push(
          <Text key={`s${i}`} style={{ fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 8, marginBottom: 4 }}>
            {pdfText(b.label)}
          </Text>,
        );
      } else {
        open.push(b.row);
        heights.push(b.height);
      }
    });
    flush("end");
    return out;
  };

  const empty = section.students.length === 0;
  const result = pages.map((items, index) => (
    <Page key={`${key}-${index}`} size="A4" style={styles.page}>
      <DemoMark organization={organization} />
      <DocHeader organization={organization} images={images} right={<Text style={styles.small}>{pdfText(options.yearName)}</Text>} />
      <SectionHeading section={section} options={options} continued={index > 0} color={color} />
      {empty && index === 0 ? (
        <View style={[styles.box, { marginTop: 8 }]}>
          <Text>{pdfText(options.emptyText)}</Text>
        </View>
      ) : (
        renderBlocks(items)
      )}
      {index === pages.length - 1 && !tailOnNewPage ? (
        <>
          <Totals section={section} color={color} />
          <Signatures labels={[organization.signatory_title ?? "Le chef d'établissement"]} organization={organization} images={images} date={new Date().toISOString()} signatory={organization.signatory_name} />
        </>
      ) : null}
      <PageFooter organization={organization} label={footerLabel} />
    </Page>
  ));
  if (tailOnNewPage) {
    result.push(
      <Page key={`${key}-tail`} size="A4" style={styles.page}>
        <DemoMark organization={organization} />
        <DocHeader organization={organization} images={images} right={<Text style={styles.small}>{pdfText(options.yearName)}</Text>} />
        <SectionHeading section={section} options={options} continued color={color} />
        <Totals section={section} color={color} />
        <Signatures labels={[organization.signatory_title ?? "Le chef d'établissement"]} organization={organization} images={images} date={new Date().toISOString()} signatory={organization.signatory_name} />
        <PageFooter organization={organization} label={footerLabel} />
      </Page>,
    );
  }
  return result;
}

/** Page de garde d'un export de plusieurs classes : récapitulatif des effectifs par section. */
export function listSummaryPage(sections: ListSection[], organization: DocOrganization, images: DocImages, options: ListPdfOptions): ReactElement {
  const color = organization.primary_color;
  const total = sections.reduce((n, s) => n + s.students.length, 0);
  const boys = sections.reduce((n, s) => n + s.boys, 0);
  const girls = sections.reduce((n, s) => n + s.girls, 0);
  const cols = [
    { label: options.klassLabel, width: 200 },
    { label: "Niveau / filière", width: 171 },
    { label: "Effectif", width: 55 },
    { label: "Garçons", width: 52 },
    { label: "Filles", width: 52 },
  ];
  return (
    <Page key="summary" size="A4" style={styles.page}>
      <DemoMark organization={organization} />
      <DocHeader organization={organization} images={images} right={<Text style={styles.small}>{pdfText(options.yearName)}</Text>} />
      <Text style={[styles.title, { color }]}>{pdfText(`${options.title.toUpperCase()} — RÉCAPITULATIF`)}</Text>
      <Text style={[styles.small, { textAlign: "center", marginBottom: 10 }]}>
        {pdfText(`Année : ${options.yearName} · ${sections.length} liste(s) séparée(s) · Générée le ${options.generatedAt}${options.sexLabel ? ` · ${options.sexLabel}` : ""}`)}
      </Text>
      <View style={{ borderWidth: 0.5, borderColor: COLORS.line, borderRadius: 3 }}>
        <View style={{ flexDirection: "row", backgroundColor: color }}>
          {cols.map((c) => (
            <Text key={c.label} style={{ width: c.width, padding: 4, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8 }}>
              {pdfText(c.label)}
            </Text>
          ))}
        </View>
        {sections.map((s, i) => (
          <View key={i} wrap={false} style={{ flexDirection: "row", backgroundColor: i % 2 ? COLORS.soft : "#FFFFFF" }}>
            {[s.name + (s.group ? ` — ${s.group}` : ""), [s.level, s.program, s.track].filter(Boolean).join(" · "), String(s.students.length), String(s.boys), String(s.girls)].map((v, j) => (
              <Text key={j} style={{ width: cols[j]!.width, padding: 4, fontSize: FONT }}>
                {pdfText(v)}
              </Text>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.ink }}>
          {["Total", "", String(total), String(boys), String(girls)].map((v, j) => (
            <Text key={j} style={{ width: cols[j]!.width, padding: 4, fontFamily: "Helvetica-Bold", fontSize: FONT }}>
              {pdfText(v)}
            </Text>
          ))}
        </View>
      </View>
      <PageFooter organization={organization} label={`${options.title} — récapitulatif · ${options.yearName}`} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Emplois du temps
// ---------------------------------------------------------------------------
const DAY_NAMES = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SESSION = { cm: "CM", td: "TD", tp: "TP" } as Record<string, string>;

function entryLines(e: TimetableEntry, showClass: boolean): string[] {
  return [
    e.subject ?? e.label ?? "Séance",
    [e.sessionType ? (SESSION[e.sessionType] ?? e.sessionType.toUpperCase()) : null, e.subject && e.label ? e.label : null].filter(Boolean).join(" · "),
    showClass ? e.className : "",
    e.teacher ?? "",
    e.room ? (/^salle\b/i.test(e.room) ? e.room : `Salle ${e.room}`) : "",
    e.group ? `Groupe ${e.group}` : "",
  ].filter(Boolean);
}

export type TimetablePdfOptions = { yearName: string; generatedAt: string; teacherLabel: string };

/** Une section = une grille (jours × horaires) sur sa propre page, au format paysage. */
export function timetablePages(section: TimetableSection, organization: DocOrganization, images: DocImages, options: TimetablePdfOptions, key: string, showClass: boolean): ReactElement[] {
  const color = organization.primary_color;
  const usedDays = new Set(section.entries.map((e) => e.weekday));
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 5 || usedDays.has(d));
  const times = Array.from(new Set(section.entries.map((e) => `${e.startsAt}-${e.endsAt}`))).sort();
  const width = 841.89 - 64;
  const timeWidth = 64;
  const dayWidth = (width - timeWidth) / days.length;
  const rows = times.map((t) => {
    const cells = days.map((d) => section.entries.filter((e) => e.weekday === d && `${e.startsAt}-${e.endsAt}` === t));
    const height = Math.max(26, ...cells.map((list) => list.reduce((n, e) => n + entryLines(e, showClass).reduce((m, l) => m + lines(l, dayWidth - 6, 7.5), 0) * 9.5 + 6, 4)));
    return { t, cells, height };
  });
  const capacity = 595.28 - 28 - 64 - 60 - 52 - 20;
  const pages = paginate(
    rows.map((r) => ({ item: r, height: r.height })),
    capacity,
    capacity,
  );
  const header = (
    <View style={{ flexDirection: "row", backgroundColor: color }}>
      <Text style={{ width: timeWidth, padding: 4, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8 }}>Horaire</Text>
      {days.map((d) => (
        <Text key={d} style={{ width: dayWidth, padding: 4, color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 8, textAlign: "center" }}>
          {DAY_NAMES[d]}
        </Text>
      ))}
    </View>
  );
  return pages.map((pageRows, index) => (
    <Page key={`${key}-${index}`} size="A4" orientation="landscape" style={styles.page}>
      <DemoMark organization={organization} />
      <DocHeader organization={organization} images={images} right={<Text style={styles.small}>{pdfText(options.yearName)}</Text>} />
      <View style={{ marginTop: 8, marginBottom: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, color }}>{pdfText(`Emploi du temps — ${section.title}${index > 0 ? " (suite)" : ""}`)}</Text>
        <Text style={[styles.small, { marginTop: 2 }]}>
          {pdfText([section.subtitle, `Année : ${options.yearName}`, "Semaine type", `Généré le ${options.generatedAt}`].filter(Boolean).join(" · "))}
        </Text>
      </View>
      <View style={{ borderWidth: 0.5, borderColor: COLORS.line, borderRadius: 3 }}>
        {header}
        {pageRows.map((r, i) => (
          <View key={r.t} wrap={false} style={{ flexDirection: "row", minHeight: r.height, borderTopWidth: i ? 0.5 : 0, borderTopColor: COLORS.line }}>
            <View style={{ width: timeWidth, padding: 4, backgroundColor: COLORS.soft, justifyContent: "center" }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8 }}>{r.t.replace("-", " – ")}</Text>
            </View>
            {r.cells.map((list, j) => (
              <View key={j} style={{ width: dayWidth, padding: 3, borderLeftWidth: 0.5, borderLeftColor: COLORS.line, gap: 3 }}>
                {list.map((e, k) => (
                  <View key={k} style={{ backgroundColor: COLORS.soft, borderLeftWidth: 2, borderLeftColor: color, borderRadius: 2, padding: 2.5 }}>
                    {entryLines(e, showClass).map((l, m) => (
                      <Text key={m} style={{ fontSize: 7.5, fontFamily: m === 0 ? "Helvetica-Bold" : "Helvetica", color: m === 0 ? COLORS.ink : COLORS.muted }}>
                        {pdfText(l)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
      <PageFooter organization={organization} label={`Emploi du temps — ${section.title} · ${options.yearName}`} />
    </Page>
  ));
}

/** Export de plusieurs classes : celles sans aucun créneau sont signalées (aucun tableau vide). */
export function timetableMissingPage(titles: string[], organization: DocOrganization, images: DocImages, options: TimetablePdfOptions): ReactElement {
  return (
    <Page key="missing" size="A4" orientation="landscape" style={styles.page}>
      <DemoMark organization={organization} />
      <DocHeader organization={organization} images={images} right={<Text style={styles.small}>{pdfText(options.yearName)}</Text>} />
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 12, color: organization.primary_color }}>Emplois du temps non renseignés</Text>
      <Text style={[styles.small, { marginTop: 4, marginBottom: 8 }]}>{pdfText(`Aucun créneau n'est enregistré pour les sections suivantes (année ${options.yearName}) : elles ne figurent pas dans ce document.`)}</Text>
      {titles.map((t) => (
        <Text key={t} style={{ fontSize: 10, marginBottom: 3 }}>
          {pdfText(`• ${t}`)}
        </Text>
      ))}
      <PageFooter organization={organization} label={`Emplois du temps · ${options.yearName}`} />
    </Page>
  );
}
