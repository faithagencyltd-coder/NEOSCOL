import "server-only";

import { classListPages, listSummaryPage, timetableMissingPage, timetablePages, type ListPdfOptions } from "@/features/documents/pdf/exports";
import { loadDocOrganization, loadFile, loadImages, logDocumentEvent, renderPages, type Client } from "@/features/documents/server";
import type { DocOrganization } from "@/features/documents/types";
import { todayIn } from "@/lib/dates";
import { pdfDate, safeFileName } from "@/lib/pdf/format";
import { buildXlsx, imageSize, type Sheet, type SheetImage } from "@/lib/xlsx/write";

import { getClassLists, getTimetables, groupingLabels, type ListFilters, type ListSection, type TimetableTarget } from "./data";

/**
 * Exports des listes (PDF / Excel) et des emplois du temps (PDF). Lecture
 * seule ; données et photos lues sous les droits de l'utilisateur (RLS).
 */

type Photo = { data: Buffer; mime: "image/png" | "image/jpeg"; width: number; height: number };

/** Photos des apprenants (PNG / JPEG seulement), chargées par lots sous RLS. Absente : rien n'est inventé. */
async function loadPhotos(supabase: Client, ids: string[]): Promise<Map<string, Photo>> {
  const out = new Map<string, Photo>();
  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += 12) {
    await Promise.all(
      unique.slice(i, i + 12).map(async (id) => {
        const file = await loadFile(supabase, id);
        if (!file || (file.mime !== "image/png" && file.mime !== "image/jpeg")) return;
        const size = imageSize(file.bytes);
        if (size && size.width > 0 && size.height > 0) out.set(id, { data: file.bytes, mime: file.mime, ...size });
      }),
    );
  }
  return out;
}

export type ListExport = { format: "pdf" | "xlsx"; filters: ListFilters; withPhotos: boolean; splitBySex: boolean; yearName: string };

function sexLabel(sex: ListFilters["sex"]): string | null {
  return sex === "M" ? "Garçons uniquement" : sex === "F" ? "Filles uniquement" : null;
}

export async function exportClassLists(
  supabase: Client,
  organizationId: string,
  organizationType: string,
  request: ListExport,
): Promise<{ ok: true; body: Buffer; fileName: string; contentType: string; sections: number; students: number } | { ok: false; status: 404 | 500; message: string }> {
  const organization = await loadDocOrganization(supabase, organizationId);
  if (!organization) return { ok: false, status: 500, message: "Établissement introuvable." };
  const today = todayIn(organization.timezone);
  const sections = await getClassLists(organizationId, request.filters, today);
  if (!sections.length) return { ok: false, status: 404, message: "Aucune classe ne correspond à cette sélection (ou vous n'y avez pas accès)." };
  const labels = groupingLabels(organizationType);
  const title = `Liste des ${labels.vocabulary.students.toLowerCase()}`;
  const photos = request.withPhotos ? await loadPhotos(supabase, sections.flatMap((s) => s.students.flatMap((st) => (st.photo_file_id ? [st.photo_file_id] : [])))) : new Map<string, Photo>();
  const students = sections.reduce((n, s) => n + s.students.length, 0);
  const stamp = today.replace(/-/g, "");
  const base = safeFileName(`liste-${sections.length === 1 ? sections[0]!.name : `${sections.length}-${labels.classes.toLowerCase()}`}-${stamp}`);

  if (request.format === "xlsx") {
    const body = buildXlsx(listWorkbook(sections, labels, request, photos, organization));
    return { ok: true, body, fileName: `${base}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sections: sections.length, students };
  }

  const images = await loadImages(supabase, organization);
  const dataUrls = new Map(Array.from(photos, ([id, p]) => [id, `data:${p.mime};base64,${p.data.toString("base64")}`]));
  const options: ListPdfOptions = {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    klassLabel: labels.klass,
    trackLabel: labels.track,
    programLabel: labels.program,
    yearName: request.yearName,
    sexLabel: sexLabel(request.filters.sex),
    generatedAt: pdfDate(today, organization.timezone),
    withPhotos: request.withPhotos,
    photos: dataUrls,
    splitBySex: request.splitBySex && request.filters.sex === "all",
    emptyText: `Aucun ${labels.vocabulary.student.toLowerCase()} ne correspond à cette liste (${labels.klass.toLowerCase()} vide ou filtres sans résultat).`,
  };
  const pages = [
    ...(sections.length > 1 ? [listSummaryPage(sections, organization, images, options)] : []),
    ...sections.flatMap((section, i) => classListPages(section, organization, images, options, `s${i}`)),
  ];
  const body = await renderPages(pages, options.title);
  return { ok: true, body, fileName: `${base}.pdf`, contentType: "application/pdf", sections: sections.length, students };
}

/** Classeur : récapitulatif + une feuille par classe (et, sur demande, une par sexe). */
function listWorkbook(sections: ListSection[], labels: ReturnType<typeof groupingLabels>, request: ListExport, photos: Map<string, Photo>, organization: DocOrganization): Sheet[] {
  const summary: Sheet = {
    name: "Récapitulatif",
    rows: [
      [labels.klass, labels.level, labels.program, labels.track, "Faculté", "Département", "Groupe", "Effectif", "Garçons", "Filles"],
      ...sections.map((s) => [s.name, s.level, s.program, s.track, s.faculty, s.department, s.group, s.students.length, s.boys, s.girls]),
      [],
      ["Total", null, null, null, null, null, null, sections.reduce((n, s) => n + s.students.length, 0), sections.reduce((n, s) => n + s.boys, 0), sections.reduce((n, s) => n + s.girls, 0)],
      [],
      [`${organization.name} — année ${request.yearName}${sexLabel(request.filters.sex) ? ` — ${sexLabel(request.filters.sex)}` : ""}`],
    ],
    widths: [26, 16, 22, 16, 18, 18, 14, 10, 10, 10],
    autoFilter: false,
    boldRows: [sections.length + 2],
  };
  const sheets: Sheet[] = [summary];
  const withPhotos = request.withPhotos;
  const header = [
    ...(withPhotos ? ["Photo"] : []),
    "N°",
    "Matricule",
    "Nom",
    "Prénoms",
    "Sexe",
    "Date de naissance",
    "Âge",
    "Lieu de naissance",
    labels.klass,
    labels.level,
    labels.program,
    labels.track,
    "Groupe",
  ];
  const widths = [...(withPhotos ? [9] : []), 6, 16, 22, 28, 7, 16, 7, 22, 22, 14, 22, 14, 14];
  const sheetFor = (name: string, section: ListSection, students: ListSection["students"]): Sheet => {
    const images: SheetImage[] = [];
    const rowHeights: Record<number, number> = {};
    const rows = students.map((s, i) => {
      if (withPhotos) {
        rowHeights[i + 1] = 48;
        const photo = s.photo_file_id ? photos.get(s.photo_file_id) : undefined;
        if (photo) {
          // Proportions d'origine conservées, dans une case de 44 × 58 px.
          const scale = Math.min(44 / photo.width, 58 / photo.height);
          images.push({ row: i + 1, col: 0, data: photo.data, mime: photo.mime, width: Math.max(1, Math.round(photo.width * scale)), height: Math.max(1, Math.round(photo.height * scale)) });
        }
      }
      return [
        ...(withPhotos ? [null] : []),
        i + 1,
        s.matricule,
        s.last_name.toUpperCase(),
        s.first_names,
        s.sex,
        s.birth_date ? new Date(`${s.birth_date}T00:00:00Z`) : null,
        s.age,
        s.birth_place,
        section.name,
        section.level,
        section.program,
        section.track,
        s.group ?? section.group,
      ];
    });
    const totalsRow = rows.length + 2;
    return {
      name,
      rows: [
        header,
        ...rows,
        [],
        ["Effectif", students.length, "Garçons", students.filter((s) => s.sex === "M").length, "Filles", students.filter((s) => s.sex === "F").length],
      ],
      widths,
      autoFilter: true,
      rowHeights,
      boldRows: [totalsRow],
      images,
    };
  };
  for (const section of sections) {
    const base = section.group ? `${section.name} ${section.group}` : section.name;
    if (request.splitBySex && request.filters.sex === "all") {
      sheets.push(sheetFor(`${base} - Garçons`, section, section.students.filter((s) => s.sex === "M")));
      sheets.push(sheetFor(`${base} - Filles`, section, section.students.filter((s) => s.sex === "F")));
    } else {
      sheets.push(sheetFor(base, section, section.students));
    }
  }
  return sheets;
}

export async function exportTimetables(
  supabase: Client,
  organizationId: string,
  organizationType: string,
  yearId: string,
  yearName: string,
  target: TimetableTarget,
): Promise<{ ok: true; body: Buffer; fileName: string; sections: number; empty: number } | { ok: false; status: 404 | 500; message: string }> {
  const organization = await loadDocOrganization(supabase, organizationId);
  if (!organization) return { ok: false, status: 500, message: "Établissement introuvable." };
  const labels = groupingLabels(organizationType);
  const sections = await getTimetables(organizationId, yearId, target, labels);
  if (!sections.length) return { ok: false, status: 404, message: "Aucune classe (ou aucun enseignant, aucune salle) ne correspond à cette sélection." };
  const filled = sections.filter((s) => s.entries.length > 0);
  // Jamais de document vide présenté comme valide.
  if (!filled.length) {
    return {
      ok: false,
      status: 404,
      message: sections.length === 1 ? "L'emploi du temps n'est pas encore renseigné : aucun créneau enregistré." : "Aucun emploi du temps renseigné pour cette sélection : aucun créneau enregistré.",
    };
  }
  const images = await loadImages(supabase, organization);
  const today = todayIn(organization.timezone);
  const options = { yearName, generatedAt: pdfDate(today, organization.timezone), teacherLabel: labels.vocabulary.teacher };
  const showClass = target.kind !== "classes";
  const missing = sections.filter((s) => s.entries.length === 0).map((s) => s.title);
  const pages = [
    ...filled.flatMap((section, i) => timetablePages(section, organization, images, options, `t${i}`, showClass)),
    ...(missing.length ? [timetableMissingPage(missing, organization, images, options)] : []),
  ];
  const body = await renderPages(pages, "Emplois du temps");
  const name = filled.length === 1 ? filled[0]!.title.replace(/^[^:]+:\s*/, "") : `${filled.length}-${labels.classes.toLowerCase()}`;
  return { ok: true, body, fileName: `${safeFileName(`emploi-du-temps-${name}-${today.replace(/-/g, "")}`)}.pdf`, sections: filled.length, empty: sections.length - filled.length };
}

export { logDocumentEvent };
