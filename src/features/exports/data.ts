import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

/**
 * Données des exports (listes d'élèves / étudiants / apprenants, emplois du
 * temps), communes aux trois modules : classes (sessions, promotions),
 * niveaux, filières / séries, parcours, groupes et créneaux existants.
 *
 * Toujours lues avec le client de l'utilisateur : la RLS limite aux classes,
 * dossiers et photos qu'il a le droit de voir dans son établissement actif.
 * Lecture seule : aucune donnée n'est modifiée par un export.
 */

export type Sex = "all" | "M" | "F";

export type ListFilters = {
  yearId: string | null;
  classIds: string[];
  levelId: string | null;
  programId: string | null;
  trackId: string | null;
  groupId: string | null;
  sex: Sex;
};

export type ListStudent = {
  matricule: string;
  last_name: string;
  first_names: string;
  sex: "M" | "F" | null;
  birth_date: string | null;
  age: number | null;
  birth_place: string | null;
  group: string | null;
  photo_file_id: string | null;
};

export type ClassInfo = {
  id: string;
  name: string;
  level: string | null;
  program: string | null;
  track: string | null;
  faculty: string | null;
  department: string | null;
};

export type ListSection = ClassInfo & { group: string | null; students: ListStudent[]; boys: number; girls: number };

/** Libellés des regroupements selon le module (scolaire, formation, université). */
export function groupingLabels(organizationType: string) {
  const v = vocabularyFor(organizationType);
  return {
    vocabulary: v,
    klass: v.klass,
    classes: v.classes,
    level: "Niveau",
    program: v.family === "school" ? "Filière" : v.family === "training" ? "Formation / filière" : "Filière",
    track: v.family === "school" ? "Série" : v.family === "training" ? "Spécialité" : "Parcours",
    group: "Groupe",
  };
}

function ageOn(birth: string | null, today: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 && age < 120 ? age : null;
}

export async function getYears(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("academic_years").select("id, name, is_current, starts_on").eq("organization_id", organizationId).order("starts_on", { ascending: false });
  return data ?? [];
}

export async function resolveYear(organizationId: string, requested: string | null) {
  const years = await getYears(organizationId);
  return years.find((y) => y.id === requested) ?? years.find((y) => y.is_current) ?? years[0] ?? null;
}

/** Classes de l'année avec leurs regroupements (niveau, filière, parcours, faculté, département). */
export async function getExportClasses(organizationId: string, yearId: string): Promise<ClassInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select(
      "id, name, level:levels(name, sequence), program:programs(name, faculty:faculties(name), department:departments(name)), track:program_tracks(name)",
    )
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId)
    .is("archived_at", null);
  const rows = (data ?? []).map((c) => {
    const level = c.level as { name: string; sequence: number | null } | null;
    const program = c.program as { name: string; faculty: { name: string } | null; department: { name: string } | null } | null;
    const track = c.track as { name: string } | null;
    return {
      id: c.id,
      name: c.name,
      level: level?.name ?? null,
      sequence: level?.sequence ?? 999,
      program: program?.name ?? null,
      track: track?.name ?? null,
      faculty: program?.faculty?.name ?? null,
      department: program?.department?.name ?? null,
    };
  });
  rows.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, "fr", { numeric: true }));
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, program: r.program, track: r.track, faculty: r.faculty, department: r.department }));
}

export async function getExportOptions(organizationId: string, yearId: string) {
  const supabase = await createClient();
  const [classes, { data: levels }, { data: programs }, { data: tracks }] = await Promise.all([
    getExportClasses(organizationId, yearId),
    supabase.from("levels").select("id, name, sequence").eq("organization_id", organizationId).order("sequence"),
    supabase.from("programs").select("id, name").eq("organization_id", organizationId).order("name"),
    supabase.from("program_tracks").select("id, name").eq("organization_id", organizationId).order("name"),
  ]);
  const classIds = classes.map((c) => c.id);
  const { data: groups } = classIds.length
    ? await supabase.from("training_groups").select("id, name, class_id").in("class_id", classIds).is("archived_at", null).order("name")
    : { data: [] };
  return { classes, levels: levels ?? [], programs: programs ?? [], tracks: tracks ?? [], groups: groups ?? [] };
}

/** Classes retenues : cochées (sinon toutes), puis filtrées par niveau / filière / parcours / groupe. */
async function selectClasses(organizationId: string, yearId: string, f: Pick<ListFilters, "classIds" | "levelId" | "programId" | "trackId" | "groupId">) {
  const supabase = await createClient();
  let query = supabase.from("classes").select("id").eq("organization_id", organizationId).eq("academic_year_id", yearId).is("archived_at", null);
  if (f.classIds.length) query = query.in("id", f.classIds);
  if (f.levelId) query = query.eq("level_id", f.levelId);
  if (f.programId) query = query.eq("program_id", f.programId);
  if (f.trackId) query = query.eq("track_id", f.trackId);
  const { data } = await query;
  let ids = new Set((data ?? []).map((c) => c.id));
  if (f.groupId) {
    const { data: group } = await supabase.from("training_groups").select("class_id").eq("id", f.groupId).maybeSingle();
    ids = new Set(group && ids.has(group.class_id) ? [group.class_id] : []);
  }
  return (await getExportClasses(organizationId, yearId)).filter((c) => ids.has(c.id));
}

/**
 * Listes séparées : une section par classe (et par groupe si un groupe est
 * choisi) ; jamais de mélange entre classes. Élèves triés par nom.
 */
export async function getClassLists(organizationId: string, f: ListFilters, today: string): Promise<ListSection[]> {
  if (!f.yearId) return [];
  const classes = await selectClasses(organizationId, f.yearId, f);
  if (!classes.length) return [];
  const supabase = await createClient();
  let query = supabase
    .from("enrollments")
    .select("class_id, group:training_groups(name), student:students!inner(matricule, last_name, first_name, other_names, sex, birth_date, birth_place, photo_path, archived_at)")
    .eq("organization_id", organizationId)
    .eq("academic_year_id", f.yearId)
    .eq("status", "validated")
    .in(
      "class_id",
      classes.map((c) => c.id),
    )
    .is("student.archived_at", null);
  if (f.groupId) query = query.eq("group_id", f.groupId);
  if (f.sex !== "all") query = query.eq("student.sex", f.sex);
  const { data } = await query;
  const groupName = f.groupId ? ((await supabase.from("training_groups").select("name").eq("id", f.groupId).maybeSingle()).data?.name ?? null) : null;

  return classes.map((c) => {
    const students = (data ?? [])
      .filter((e) => e.class_id === c.id && e.student)
      .map((e) => {
        const s = e.student as unknown as { matricule: string; last_name: string; first_name: string; other_names: string | null; sex: "M" | "F" | null; birth_date: string | null; birth_place: string | null; photo_path: string | null };
        return {
          matricule: s.matricule,
          last_name: s.last_name,
          first_names: [s.first_name, s.other_names].filter(Boolean).join(" "),
          sex: s.sex,
          birth_date: s.birth_date,
          age: ageOn(s.birth_date, today),
          birth_place: s.birth_place,
          group: (e.group as { name: string } | null)?.name ?? null,
          photo_file_id: s.photo_path && isUuid(s.photo_path) ? s.photo_path : null,
        };
      })
      .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_names.localeCompare(b.first_names, "fr"));
    return {
      ...c,
      group: groupName,
      students,
      boys: students.filter((s) => s.sex === "M").length,
      girls: students.filter((s) => s.sex === "F").length,
    };
  });
}

// ---------------------------------------------------------------------------
// Emplois du temps
// ---------------------------------------------------------------------------
export type TimetableEntry = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  subject: string | null;
  label: string | null;
  sessionType: string | null;
  teacher: string | null;
  room: string | null;
  group: string | null;
  className: string;
};

export type TimetableSection = { title: string; subtitle: string | null; entries: TimetableEntry[] };

type SlotRow = {
  weekday: number;
  starts_at: string;
  ends_at: string;
  label: string | null;
  session_type: string | null;
  class_id: string;
  class: { name: string } | null;
  class_subject: { subject: { name: string } | null } | null;
  teacher: { first_name: string; last_name: string } | null;
  room: { name: string } | null;
  group: { name: string } | null;
};

async function loadSlots(organizationId: string, yearId: string, filter: { classIds?: string[]; teacherId?: string; roomId?: string; groupId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("timetable_slots")
    .select(
      "weekday, starts_at, ends_at, label, session_type, class_id, class:classes(name), class_subject:class_subjects(subject:subjects(name)), teacher:staff_members(first_name, last_name), room:rooms(name), group:training_groups(name)",
    )
    .eq("organization_id", organizationId)
    .eq("academic_year_id", yearId);
  if (filter.classIds) query = query.in("class_id", filter.classIds);
  if (filter.teacherId) query = query.eq("teacher_id", filter.teacherId);
  if (filter.roomId) query = query.eq("room_id", filter.roomId);
  if (filter.groupId) query = query.or(`group_id.is.null,group_id.eq.${filter.groupId}`);
  const { data } = await query.order("weekday").order("starts_at");
  return ((data ?? []) as unknown as SlotRow[]).map(
    (s): TimetableEntry & { classId: string } => ({
      classId: s.class_id,
      weekday: s.weekday,
      startsAt: s.starts_at.slice(0, 5),
      endsAt: s.ends_at.slice(0, 5),
      subject: s.class_subject?.subject?.name ?? null,
      label: s.label,
      sessionType: s.session_type,
      teacher: s.teacher ? `${s.teacher.first_name} ${s.teacher.last_name}` : null,
      room: s.room?.name ?? null,
      group: s.group?.name ?? null,
      className: s.class?.name ?? "",
    }),
  );
}

export type TimetableTarget =
  | { kind: "classes"; classIds: string[]; levelId: string | null; programId: string | null; trackId: string | null; groupId: string | null }
  | { kind: "teacher"; teacherId: string }
  | { kind: "room"; roomId: string };

/** Une section par classe (ou par enseignant / salle) : jamais un tableau commun à plusieurs classes. */
export async function getTimetables(organizationId: string, yearId: string, target: TimetableTarget, labels: ReturnType<typeof groupingLabels>): Promise<TimetableSection[]> {
  const supabase = await createClient();
  if (target.kind === "teacher") {
    const { data: t } = await supabase.from("staff_members").select("first_name, last_name").eq("id", target.teacherId).eq("organization_id", organizationId).maybeSingle();
    if (!t) return [];
    const entries = await loadSlots(organizationId, yearId, { teacherId: target.teacherId });
    return [{ title: `${labels.vocabulary.teacher} : ${t.first_name} ${t.last_name}`, subtitle: null, entries }];
  }
  if (target.kind === "room") {
    const { data: r } = await supabase.from("rooms").select("name").eq("id", target.roomId).eq("organization_id", organizationId).maybeSingle();
    if (!r) return [];
    const entries = await loadSlots(organizationId, yearId, { roomId: target.roomId });
    return [{ title: `Salle : ${r.name}`, subtitle: null, entries }];
  }
  const classes = await selectClasses(organizationId, yearId, target);
  if (!classes.length) return [];
  const groupName = target.groupId ? ((await supabase.from("training_groups").select("name").eq("id", target.groupId).maybeSingle()).data?.name ?? null) : null;
  const entries = await loadSlots(organizationId, yearId, { classIds: classes.map((c) => c.id), groupId: target.groupId ?? undefined });
  return classes.map((c) => ({
    title: `${labels.klass} : ${c.name}${groupName ? ` — groupe ${groupName}` : ""}`,
    subtitle: [c.level, c.program, c.track ? `${labels.track} ${c.track}` : null, c.faculty, c.department].filter(Boolean).join(" · ") || null,
    entries: entries.filter((e) => e.classId === c.id),
  }));
}
