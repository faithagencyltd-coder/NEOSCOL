"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Permission } from "@/config/permissions";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean, readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

import { isHigherOrg, PARENT_SECTIONS, UNIVERSITY_FEATURES } from "./config";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." });
const uuid = z.string().refine(isUuid, { error: "Sélection invalide." });
const text = (max: number) => z.string({ error: "Champ requis." }).trim().min(1, { error: "Champ requis." }).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();
const code = z.string({ error: "Code requis." }).trim().regex(/^[A-Za-z0-9_-]{1,20}$/, { error: "Code : lettres, chiffres, - ou _ (20 max)." });
const num = (min: number, max: number) => z.coerce.number({ error: "Nombre invalide." }).min(min).max(max);

type Parsed<T> = { ok: true; data: T } | { ok: false; result: ActionResult };
function parse<T extends z.ZodType>(schema: T, input: unknown): Parsed<z.infer<T>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const flat = z.flattenError(parsed.error);
  return { ok: false, result: { ok: false, message: flat.formErrors[0] ?? parsed.error.issues[0]?.message ?? "Certains champs sont à corriger.", fieldErrors: flat.fieldErrors as Record<string, string[] | undefined> } };
}
function done(paths: string[], message: string): ActionResult {
  for (const path of paths) revalidatePath(path);
  return { ok: true, message };
}
const nul = <T,>(v: T | undefined | "") => (v === undefined || v === "" ? null : v);

/** Garde : permission + établissement d'enseignement supérieur (le reste est contrôlé en base). */
async function uniAuth(...permissions: Permission[]) {
  const auth = await authorize(...permissions);
  if (!auth.ok) return auth;
  if (!isHigherOrg(auth.context.organization.type)) return { ok: false as const, message: "Fonction réservée aux établissements d'enseignement supérieur." };
  return auth;
}

type Table = "faculties" | "departments" | "academic_cycles" | "program_tracks" | "exam_sessions" | "teaching_units" | "rooms";

/** Création ou mise à jour d'une ligne du référentiel (RLS : academic.manage). */
async function saveRow(table: Table, id: string, organizationId: string, values: Record<string, unknown>, paths: string[], label: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from(table).update(values as never).eq("organization_id", organizationId).eq("id", id)
    : await supabase.from(table).insert({ organization_id: organizationId, ...values } as never);
  if (error) return { ok: false, message: error.code === "23505" ? "Ce code est déjà utilisé." : dbErrorMessage(error) };
  return done(paths, isUuid(id) ? `${label} mis(e) à jour.` : `${label} créé(e).`);
}

async function toggleRow(table: Table | "programs", formData: FormData, paths: string[], field = "is_active"): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Élément introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from(table)
    .update({ [field]: readBoolean(formData, "active") } as never, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(paths, readBoolean(formData, "active") ? "Réactivé(e)." : "Désactivé(e) : conservé(e) dans l'historique.");
}

const STRUCT = ["/universite/structure", "/universite"];

// --------------------------------------------------------------------------- Structure

export async function saveFaculty(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ name: text(160), code, kind: z.enum(["faculte", "ecole", "institut", "autre"]), dean_id: uuid.optional(), description: optText(2000) }), readFields(formData, ["name", "code", "kind", "dean_id", "description"]));
  if (!p.ok) return p.result;
  return saveRow("faculties", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, code: p.data.code.toUpperCase(), dean_id: nul(p.data.dean_id), description: nul(p.data.description) }, STRUCT, "Faculté / école");
}
export async function toggleFaculty(_: ActionResult | null, formData: FormData) {
  return toggleRow("faculties", formData, STRUCT);
}

export async function saveDepartment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ name: text(160), code, faculty_id: uuid.optional(), head_id: uuid.optional(), description: optText(2000) }), readFields(formData, ["name", "code", "faculty_id", "head_id", "description"]));
  if (!p.ok) return p.result;
  return saveRow("departments", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, code: p.data.code.toUpperCase(), faculty_id: nul(p.data.faculty_id), head_id: nul(p.data.head_id), description: nul(p.data.description) }, STRUCT, "Département");
}
export async function toggleDepartment(_: ActionResult | null, formData: FormData) {
  return toggleRow("departments", formData, STRUCT);
}

const programSchema = z.object({
  name: text(160),
  code,
  faculty_id: uuid.optional(),
  department_id: uuid.optional(),
  responsible_id: uuid.optional(),
  academic_cycle_id: uuid.optional(),
  degree_title: optText(200),
  duration_years: num(1, 12).optional(),
  description: optText(2000),
  admission_conditions: optText(2000),
  syllabus: optText(8000),
});

export async function saveProgram(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(programSchema, readFields(formData, ["name", "code", "faculty_id", "department_id", "responsible_id", "academic_cycle_id", "degree_title", "duration_years", "description", "admission_conditions", "syllabus"]));
  if (!p.ok) return p.result;
  const d = p.data;
  const values = {
    name: d.name,
    code: d.code.toUpperCase(),
    faculty_id: nul(d.faculty_id),
    department_id: nul(d.department_id),
    responsible_id: nul(d.responsible_id),
    academic_cycle_id: nul(d.academic_cycle_id),
    degree_title: nul(d.degree_title),
    duration_years: d.duration_years ?? null,
    description: nul(d.description),
    admission_conditions: nul(d.admission_conditions),
    syllabus: nul(d.syllabus),
  };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { error } = isUuid(id)
    ? await supabase.from("programs").update(values).eq("organization_id", organizationId).eq("id", id).neq("kind", "training")
    : await supabase.from("programs").insert({ organization_id: organizationId, kind: "degree", ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Une filière utilise déjà ce code." : dbErrorMessage(error) };
  return done([...STRUCT, ...(isUuid(id) ? [`/universite/filieres/${id}`] : [])], isUuid(id) ? "Filière mise à jour." : "Filière créée.");
}
export async function toggleProgram(_: ActionResult | null, formData: FormData) {
  return toggleRow("programs", formData, [...STRUCT, `/universite/filieres/${String(formData.get("id") ?? "")}`]);
}

export async function saveTrack(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ program_id: uuid, name: text(160), code, kind: z.enum(["parcours", "specialite", "option"]), starts_at_level_id: uuid.optional(), description: optText(2000) }), readFields(formData, ["program_id", "name", "code", "kind", "starts_at_level_id", "description"]));
  if (!p.ok) return p.result;
  return saveRow("program_tracks", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, code: p.data.code.toUpperCase(), starts_at_level_id: nul(p.data.starts_at_level_id), description: nul(p.data.description) }, [...STRUCT, `/universite/filieres/${p.data.program_id}`], "Parcours");
}
export async function toggleTrack(_: ActionResult | null, formData: FormData) {
  return toggleRow("program_tracks", formData, STRUCT);
}

export async function saveCycle(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ name: text(80), code, credits_required: num(1, 1000).optional(), duration_years: num(1, 12).optional(), sequence: num(0, 99).optional() }), readFields(formData, ["name", "code", "credits_required", "duration_years", "sequence"]));
  if (!p.ok) return p.result;
  return saveRow("academic_cycles", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, code: p.data.code.toUpperCase(), credits_required: p.data.credits_required ?? null, duration_years: p.data.duration_years ?? null, sequence: p.data.sequence ?? 0 }, STRUCT, "Cycle");
}

export async function saveLevel(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ name: text(80), short_name: optText(20), academic_cycle_id: uuid.optional(), credits_target: num(1, 1000).optional(), sequence: num(0, 99) }), readFields(formData, ["name", "short_name", "academic_cycle_id", "credits_target", "sequence"]));
  if (!p.ok) return p.result;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  let cycleName: string | null = null;
  if (p.data.academic_cycle_id) cycleName = (await supabase.from("academic_cycles").select("name").eq("id", p.data.academic_cycle_id).maybeSingle()).data?.name ?? null;
  const values = { name: p.data.name, short_name: nul(p.data.short_name), academic_cycle_id: nul(p.data.academic_cycle_id), credits_target: p.data.credits_target ?? null, sequence: p.data.sequence, cycle: cycleName };
  const { error } = isUuid(id)
    ? await supabase.from("levels").update(values).eq("organization_id", organizationId).eq("id", id)
    : await supabase.from("levels").insert({ organization_id: organizationId, ...values });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(STRUCT, isUuid(id) ? "Niveau mis à jour." : "Niveau créé.");
}

// --------------------------------------------------------------------------- Années, semestres, sessions

export async function saveAcademicYear(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ name: text(40), starts_on: date, ends_on: date, registration_starts_on: date.optional(), registration_ends_on: date.optional() }).refine((v) => v.ends_on > v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] }),
    readFields(formData, ["name", "starts_on", "ends_on", "registration_starts_on", "registration_ends_on"]),
  );
  if (!p.ok) return p.result;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const values = { ...p.data, registration_starts_on: nul(p.data.registration_starts_on), registration_ends_on: nul(p.data.registration_ends_on) };
  const { error } = isUuid(id)
    ? await supabase.from("academic_years").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("academic_years").insert({ organization_id: auth.context.organization.id, status: "planned", ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Cette année existe déjà." : dbErrorMessage(error) };
  return done(["/universite/annees"], isUuid(id) ? "Année académique mise à jour." : "Année académique créée (historique conservé).");
}

export async function setCurrentAcademicYear(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Année introuvable." };
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  await supabase.from("academic_years").update({ is_current: false }).eq("organization_id", organizationId).eq("is_current", true);
  const { error } = await supabase.from("academic_years").update({ is_current: true, status: "active" }).eq("organization_id", organizationId).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/annees", "/universite"], "Année académique en cours changée.");
}

export async function saveSemester(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ academic_year_id: uuid, name: text(60), sequence: num(1, 4), starts_on: date, ends_on: date }).refine((v) => v.ends_on > v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] }),
    readFields(formData, ["academic_year_id", "name", "sequence", "starts_on", "ends_on"]),
  );
  if (!p.ok) return p.result;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("academic_periods").update({ name: p.data.name, sequence: p.data.sequence, starts_on: p.data.starts_on, ends_on: p.data.ends_on }).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("academic_periods").insert({ organization_id: auth.context.organization.id, type: "semester", ...p.data });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/annees"], isUuid(id) ? "Semestre mis à jour." : "Semestre créé.");
}

export async function saveExamSession(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z
      .object({ academic_year_id: uuid, academic_period_id: uuid.optional(), name: text(120), kind: z.enum(["normal", "retake"]), starts_on: date, ends_on: date, status: z.enum(["planned", "ongoing", "closed"]) })
      .refine((v) => v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] }),
    readFields(formData, ["academic_year_id", "academic_period_id", "name", "kind", "starts_on", "ends_on", "status"]),
  );
  if (!p.ok) return p.result;
  return saveRow("exam_sessions", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, academic_period_id: nul(p.data.academic_period_id) }, ["/universite/annees"], "Session d'examen");
}

// --------------------------------------------------------------------------- UE et matières

export async function saveTeachingUnit(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({
      code,
      name: text(160),
      program_id: uuid,
      level_id: uuid.optional(),
      track_id: uuid.optional(),
      semester_no: num(1, 4),
      credits: num(0, 60),
      coefficient: num(0.1, 100),
      category: optText(60),
      responsible_id: uuid.optional(),
      description: optText(2000),
    }),
    readFields(formData, ["code", "name", "program_id", "level_id", "track_id", "semester_no", "credits", "coefficient", "category", "responsible_id", "description"]),
  );
  if (!p.ok) return p.result;
  const d = p.data;
  return saveRow(
    "teaching_units",
    String(formData.get("id") ?? ""),
    auth.context.organization.id,
    { ...d, code: d.code.toUpperCase(), level_id: nul(d.level_id), track_id: nul(d.track_id), category: nul(d.category), responsible_id: nul(d.responsible_id), description: nul(d.description), is_optional: readBoolean(formData, "is_optional") },
    ["/universite/ue", `/universite/filieres/${d.program_id}`],
    "UE",
  );
}
export async function toggleTeachingUnit(_: ActionResult | null, formData: FormData) {
  return toggleRow("teaching_units", formData, ["/universite/ue"]);
}

const TYPES = ["cm", "td", "tp", "projet", "atelier", "examen", "oral", "autre"] as const;

export async function saveCourseSubject(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({
      teaching_unit_id: uuid,
      code,
      name: text(120),
      credits: num(0, 60).optional(),
      coefficient: num(0.1, 100).optional(),
      hours_cm: num(0, 999).optional(),
      hours_td: num(0, 999).optional(),
      hours_tp: num(0, 999).optional(),
    }),
    readFields(formData, ["teaching_unit_id", "code", "name", "credits", "coefficient", "hours_cm", "hours_td", "hours_tp"]),
  );
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: unit } = await supabase.from("teaching_units").select("program_id").eq("organization_id", organizationId).eq("id", p.data.teaching_unit_id).maybeSingle();
  if (!unit) return { ok: false, message: "UE introuvable." };
  const types = TYPES.filter((t) => readBoolean(formData, `type_${t}`));
  const values = {
    name: p.data.name,
    code: p.data.code.toUpperCase(),
    kind: "module",
    teaching_unit_id: p.data.teaching_unit_id,
    program_id: unit.program_id,
    credits: p.data.credits ?? null,
    coefficient: p.data.coefficient ?? 1,
    hours_cm: p.data.hours_cm ?? null,
    hours_td: p.data.hours_td ?? null,
    hours_tp: p.data.hours_tp ?? null,
    teaching_types: types,
  };
  const id = String(formData.get("id") ?? "");
  const { error } = isUuid(id)
    ? await supabase.from("subjects").update(values).eq("organization_id", organizationId).eq("id", id)
    : await supabase.from("subjects").insert({ organization_id: organizationId, ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Une matière utilise déjà ce code." : dbErrorMessage(error) };
  return done(["/universite/ue"], isUuid(id) ? "Matière mise à jour." : "Matière ajoutée à l'UE.");
}

/** Matière enseignée dans une promotion par un enseignant (affectation). */
export async function assignCourse(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ class_id: uuid, subject_id: uuid, teacher_id: uuid.optional(), weekly_hours: num(0, 60).optional() }), readFields(formData, ["class_id", "subject_id", "teacher_id", "weekly_hours"]));
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { error } = await supabase.from("class_subjects").upsert(
    { organization_id: auth.context.organization.id, class_id: p.data.class_id, subject_id: p.data.subject_id, teacher_id: nul(p.data.teacher_id), weekly_hours: p.data.weekly_hours ?? null },
    { onConflict: "class_id,subject_id" },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/ue", "/universite/enseignants", `/classes/${p.data.class_id}`], "Matière affectée à la promotion et à l'enseignant.");
}

// --------------------------------------------------------------------------- Enseignants, salles, promotions

export async function saveTeacherProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("staff.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ id: uuid, academic_rank: optText(80), department_id: uuid.optional(), specialties: optText(300) }), readFields(formData, ["id", "academic_rank", "department_id", "specialties"]));
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("staff_members")
    .update(
      {
        academic_rank: nul(p.data.academic_rank),
        department_id: nul(p.data.department_id),
        specialties: (p.data.specialties ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      },
      { count: "exact" },
    )
    .eq("organization_id", auth.context.organization.id)
    .eq("id", p.data.id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/enseignants"], "Fiche enseignant mise à jour.");
}

export async function saveRoom(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ name: text(80), number: optText(20), building: optText(80), capacity: num(1, 5000).optional(), room_type: z.enum(["cours", "amphi", "labo", "informatique", "tp", "autre"]), equipment: optText(500) }),
    readFields(formData, ["name", "number", "building", "capacity", "room_type", "equipment"]),
  );
  if (!p.ok) return p.result;
  return saveRow("rooms", String(formData.get("id") ?? ""), auth.context.organization.id, { ...p.data, number: nul(p.data.number), building: nul(p.data.building), capacity: p.data.capacity ?? null, equipment: nul(p.data.equipment) }, ["/universite/salles"], "Salle");
}
export async function toggleRoom(_: ActionResult | null, formData: FormData) {
  return toggleRow("rooms", formData, ["/universite/salles"], "is_available");
}

export async function savePromotion(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("academic.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ name: text(80), academic_year_id: uuid, program_id: uuid, level_id: uuid, track_id: uuid.optional(), capacity: num(1, 5000).optional(), head_teacher_id: uuid.optional() }),
    readFields(formData, ["name", "academic_year_id", "program_id", "level_id", "track_id", "capacity", "head_teacher_id"]),
  );
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { error } = await supabase.from("classes").insert({
    organization_id: auth.context.organization.id,
    kind: "class",
    ...p.data,
    track_id: nul(p.data.track_id),
    capacity: p.data.capacity ?? null,
    head_teacher_id: nul(p.data.head_teacher_id),
  });
  if (error) return { ok: false, message: error.code === "23505" ? "Une promotion porte déjà ce nom pour cette année." : dbErrorMessage(error) };
  return done(["/classes", "/universite/inscription", "/universite/structure"], "Promotion créée.");
}

// --------------------------------------------------------------------------- Inscriptions

const enrollSchema = z
  .object({
    student_id: uuid.optional(),
    first_name: optText(80),
    last_name: optText(80),
    sex: z.enum(["M", "F"]).optional(),
    birth_date: date.optional(),
    birth_place: optText(120),
    nationality: optText(80),
    national_id: optText(60),
    phone: optText(40),
    email: z.email({ error: "E-mail invalide." }).optional(),
    address: optText(200),
    city: optText(80),
    contact_first_name: optText(80),
    contact_last_name: optText(80),
    contact_phone: optText(40),
    contact_relationship: z.enum(["father", "mother", "tutor", "grandparent", "sibling", "other"]).optional(),
    class_id: uuid,
    track_id: uuid.optional(),
    group_id: uuid.optional(),
    type: z.enum(["new", "reenrollment", "transfer"]),
    notes: optText(1000),
  })
  .refine((v) => v.student_id || (v.first_name && v.last_name), { error: "Nom et prénom de l'étudiant obligatoires.", path: ["last_name"] });

/**
 * Inscription administrative (année, filière, parcours, niveau, frais) puis
 * inscription pédagogique aux UE des semestres de l'année. Réutilise
 * create_enrollment_application + validate_enrollment (facture selon les
 * frais de la filière, échéancier en tranches).
 */
export async function enrollStudent(
  _: ActionResult<{ studentId: string; invoiceId: string | null; units: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ studentId: string; invoiceId: string | null; units: number }>> {
  const auth = await uniAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const p = parse(enrollSchema, readFields(formData, [
    "student_id", "first_name", "last_name", "sex", "birth_date", "birth_place", "nationality", "national_id", "phone", "email", "address", "city",
    "contact_first_name", "contact_last_name", "contact_phone", "contact_relationship", "class_id", "track_id", "group_id", "type", "notes",
  ]));
  if (!p.ok) return p.result as ActionResult<never>;
  const d = p.data;
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: klass } = await supabase.from("classes").select("id, academic_year_id").eq("organization_id", organizationId).eq("id", d.class_id).maybeSingle();
  if (!klass) return { ok: false, message: "Promotion introuvable." };
  const { data: enrollmentId, error } = await supabase.rpc("create_enrollment_application", {
    p_organization_id: organizationId,
    p_payload: {
      student_id: d.student_id ?? null,
      student: d.student_id
        ? null
        : {
            first_name: d.first_name, last_name: d.last_name, sex: d.sex ?? "", birth_date: d.birth_date ?? "", birth_place: d.birth_place ?? "",
            nationality: d.nationality ?? "", national_id: d.national_id ?? "", phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", city: d.city ?? "",
          },
      guardian: d.contact_last_name && d.contact_first_name
        ? { first_name: d.contact_first_name, last_name: d.contact_last_name, phone: d.contact_phone ?? "", relationship: d.contact_relationship ?? "other" }
        : null,
      academic_year_id: klass.academic_year_id,
      class_id: d.class_id,
      type: d.type,
      submit: true,
      notes: d.notes ?? "",
    },
  });
  if (error || !enrollmentId) return { ok: false, message: dbErrorMessage(error, "Inscription impossible.") };
  if (d.track_id || d.group_id) {
    const { error: e2 } = await supabase.from("enrollments").update({ track_id: nul(d.track_id), group_id: nul(d.group_id) }).eq("id", enrollmentId);
    if (e2) return { ok: false, message: dbErrorMessage(e2) };
  }
  const { data: validated, error: e3 } = await supabase.rpc("validate_enrollment", { p_enrollment_id: enrollmentId, p_generate_invoice: true });
  if (e3) return { ok: false, message: dbErrorMessage(e3, "Validation de l'inscription impossible.") };
  // Inscription pédagogique : UE de chaque semestre de l'année.
  const { data: periods } = await supabase.from("academic_periods").select("id").eq("academic_year_id", klass.academic_year_id).order("sequence");
  let units = 0;
  for (const period of periods ?? []) {
    const { data: n } = await supabase.rpc("register_curriculum", { p_enrollment_id: enrollmentId, p_period_id: period.id });
    units += Number(n ?? 0);
  }
  const { data: enrollment } = await supabase.from("enrollments").select("student_id").eq("id", enrollmentId).single();
  revalidatePath("/eleves", "layout");
  revalidatePath("/inscriptions", "layout");
  revalidatePath("/finances", "layout");
  const invoiceId = (validated as { invoice_id?: string | null } | null)?.invoice_id ?? null;
  return { ok: true, message: `Inscription validée : ${units} UE inscrites.`, data: { studentId: enrollment!.student_id, invoiceId, units } };
}

export async function registerCurriculum(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const periodId = String(formData.get("period_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(enrollmentId) || !isUuid(periodId)) return { ok: false, message: "Choisissez le semestre." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_curriculum", { p_enrollment_id: enrollmentId, p_period_id: periodId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/eleves/${studentId}`], data ? `${data} UE inscrite(s).` : "Toutes les UE du semestre sont déjà inscrites.");
}

export async function setCourseRegistration(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(id) || !["registered", "dropped", "exempted"].includes(status)) return { ok: false, message: "Choix invalide." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("course_registrations")
    .update({ status: status as "registered" | "dropped" | "exempted" }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done([`/eleves/${studentId}`], "Inscription pédagogique mise à jour.");
}

export async function addCourseRegistration(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ enrollment_id: uuid, period_id: uuid, teaching_unit_id: uuid, student_id: uuid }), readFields(formData, ["enrollment_id", "period_id", "teaching_unit_id", "student_id"]));
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { error } = await supabase.from("course_registrations").insert({
    organization_id: auth.context.organization.id,
    enrollment_id: p.data.enrollment_id,
    student_id: p.data.student_id,
    academic_period_id: p.data.period_id,
    teaching_unit_id: p.data.teaching_unit_id,
  });
  if (error) return { ok: false, message: error.code === "23505" ? "UE déjà inscrite pour ce semestre." : dbErrorMessage(error) };
  return done([`/eleves/${p.data.student_id}`], "UE ajoutée à l'inscription pédagogique.");
}

// --------------------------------------------------------------------------- Résultats et délibérations

export async function computeResults(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage", "grades.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  const periodId = String(formData.get("period_id") ?? "");
  if (!isUuid(classId) || !isUuid(periodId)) return { ok: false, message: "Choisissez la promotion et le semestre." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compute_university_results", { p_class_id: classId, p_period_id: periodId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/resultats"], `Résultats calculés pour ${data} étudiant(s).`);
}

export async function createDeliberation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ class_id: uuid, academic_period_id: uuid.optional(), session: z.enum(["normal", "retake"]), title: text(200), held_on: date.optional(), president: optText(160), members: optText(2000) }),
    readFields(formData, ["class_id", "academic_period_id", "session", "title", "held_on", "president", "members"]),
  );
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliberations")
    .insert({ organization_id: auth.context.organization.id, ...p.data, academic_period_id: nul(p.data.academic_period_id), held_on: nul(p.data.held_on), president: nul(p.data.president), members: nul(p.data.members) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.code === "23505" ? "Une délibération existe déjà pour cette promotion, ce semestre et cette session." : dbErrorMessage(error) };
  const { error: e2 } = await supabase.rpc("deliberation_prepare", { p_deliberation_id: data.id });
  if (e2) return { ok: false, message: dbErrorMessage(e2) };
  return done(["/universite/deliberations"], "Délibération ouverte : résultats calculés et décisions proposées.");
}

export async function prepareDeliberation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deliberation_prepare", { p_deliberation_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/universite/deliberations/${id}`], data ? `${data} décision(s) proposée(s).` : "Résultats recalculés ; décisions déjà présentes conservées.");
}

export async function decideDeliberation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage");
  if (!auth.ok) return auth;
  const p = parse(z.object({ id: uuid, student_id: uuid, decision: text(160), comment: optText(1000) }), readFields(formData, ["id", "student_id", "decision", "comment"]));
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("deliberation_decide", {
    p_deliberation_id: p.data.id,
    p_student_id: p.data.student_id,
    p_decision: p.data.decision,
    p_comment: p.data.comment ?? undefined,
    p_validate_credits: readBoolean(formData, "validate_credits"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/universite/deliberations/${p.data.id}`], "Décision du jury enregistrée (la précédente reste dans l'historique).");
}

export async function closeDeliberation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("deliberation_close", { p_deliberation_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/universite/deliberations/${id}`, "/universite/deliberations", "/universite/resultats"], "Délibération close : résultats publiés aux étudiants.");
}

export async function reopenDeliberation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("deliberations.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("deliberation_reopen", { p_deliberation_id: id, p_reason: String(formData.get("reason") ?? "") });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/universite/deliberations/${id}`, "/universite/deliberations"], "Délibération rouverte (motif tracé).");
}

// --------------------------------------------------------------------------- Stages, mémoires, soutenances

export async function saveUniversityInternship(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("theses.manage", "students.update");
  if (!auth.ok) return auth;
  const p = parse(
    z
      .object({
        student_id: uuid,
        company_name: text(160),
        host_kind: z.enum(["entreprise", "organisme", "administration", "laboratoire", "autre"]),
        tutor_name: optText(120),
        tutor_title: optText(120),
        supervisor_name: optText(160),
        missions: optText(2000),
        starts_on: date,
        ends_on: date,
        status: z.enum(["planned", "ongoing", "completed", "cancelled"]),
        evaluation_score: num(0, 20).optional(),
        evaluation_comment: optText(2000),
      })
      .refine((v) => v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] }),
    readFields(formData, ["student_id", "company_name", "host_kind", "tutor_name", "tutor_title", "supervisor_name", "missions", "starts_on", "ends_on", "status", "evaluation_score", "evaluation_comment"]),
  );
  if (!p.ok) return p.result;
  const d = p.data;
  const values = {
    company_name: d.company_name, host_kind: d.host_kind, tutor_name: nul(d.tutor_name), tutor_title: nul(d.tutor_title), supervisor_name: nul(d.supervisor_name),
    missions: nul(d.missions), starts_on: d.starts_on, ends_on: d.ends_on, status: d.status, evaluation_score: d.evaluation_score ?? null,
    evaluation_comment: nul(d.evaluation_comment), convention_signed: readBoolean(formData, "convention_signed"),
  };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("internships").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("internships").insert({ organization_id: auth.context.organization.id, student_id: d.student_id, ...values });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/stages", `/eleves/${d.student_id}`], isUuid(id) ? "Stage mis à jour." : "Stage enregistré.");
}

export async function saveThesis(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("theses.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({
      student_id: uuid,
      kind: z.enum(["memoire", "these", "projet"]),
      title: text(300),
      summary: optText(4000),
      director_id: uuid.optional(),
      director_name: optText(160),
      co_director_name: optText(160),
      jury: optText(2000),
      status: z.enum(["proposed", "approved", "in_progress", "submitted", "defended", "abandoned"]),
      grade: num(0, 20).optional(),
      mention: optText(80),
    }),
    readFields(formData, ["student_id", "kind", "title", "summary", "director_id", "director_name", "co_director_name", "jury", "status", "grade", "mention"]),
  );
  if (!p.ok) return p.result;
  const d = p.data;
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  let directorName = nul(d.director_name);
  if (d.director_id && !directorName) {
    const { data: t } = await supabase.from("staff_members").select("first_name, last_name, academic_rank").eq("id", d.director_id).maybeSingle();
    directorName = t ? `${t.academic_rank ? `${t.academic_rank} ` : ""}${t.first_name} ${t.last_name}` : null;
  }
  const values = {
    kind: d.kind, title: d.title, summary: nul(d.summary), director_id: nul(d.director_id), director_name: directorName, co_director_name: nul(d.co_director_name),
    jury: nul(d.jury), status: d.status, grade: d.grade ?? null, mention: nul(d.mention),
  };
  const id = String(formData.get("id") ?? "");
  const { data: year } = await supabase.from("academic_years").select("id").eq("organization_id", organizationId).eq("is_current", true).maybeSingle();
  const { error } = isUuid(id)
    ? await supabase.from("theses").update(values).eq("organization_id", organizationId).eq("id", id)
    : await supabase.from("theses").insert({ organization_id: organizationId, student_id: d.student_id, academic_year_id: year?.id ?? null, ...values });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/memoires", `/eleves/${d.student_id}`], isUuid(id) ? "Mémoire mis à jour." : "Sujet enregistré.");
}

export async function saveDefense(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("theses.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({
      student_id: uuid,
      thesis_id: uuid.optional(),
      title: text(300),
      date: date,
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Heure invalide." }),
      room_id: uuid.optional(),
      jury: optText(2000),
      status: z.enum(["scheduled", "held", "postponed", "cancelled"]),
      grade: num(0, 20).optional(),
      mention: optText(80),
      decision: optText(200),
      minutes: optText(4000),
    }),
    readFields(formData, ["student_id", "thesis_id", "title", "date", "time", "room_id", "jury", "status", "grade", "mention", "decision", "minutes"]),
  );
  if (!p.ok) return p.result;
  const d = p.data;
  // Jury saisi « Nom — Rôle » (une ligne par membre).
  const jury = (d.jury ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, role] = line.split(/\s+[—-]\s+/);
      return { name: name!.trim(), role: (role ?? "Membre").trim() };
    });
  const tz = auth.context.organization.timezone;
  const scheduledAt = zonedIso(d.date, d.time, tz);
  const values = {
    thesis_id: nul(d.thesis_id), title: d.title, scheduled_at: scheduledAt, room_id: nul(d.room_id), jury, status: d.status,
    grade: d.grade ?? null, mention: nul(d.mention), decision: nul(d.decision), minutes: nul(d.minutes),
  };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("defenses").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("defenses").insert({ organization_id: auth.context.organization.id, student_id: d.student_id, ...values });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/soutenances", "/universite/memoires", `/eleves/${d.student_id}`], isUuid(id) ? "Soutenance mise à jour." : "Soutenance programmée (étudiant notifié).");
}

/** Date et heure locales de l'établissement → instant ISO. */
function zonedIso(dateStr: string, time: string, timeZone: string): string {
  const guess = new Date(`${dateStr}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime())).toISOString();
}

// --------------------------------------------------------------------------- Diplômes

export async function issueDiploma(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("diplomas.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({ student_id: uuid, title: text(200), program_id: uuid.optional(), level_id: uuid.optional(), year_label: optText(20), mention: optText(120), conferred_on: date.optional(), kind: z.enum(["diploma", "certificate", "attestation"]) }),
    readFields(formData, ["student_id", "title", "program_id", "level_id", "year_label", "mention", "conferred_on", "kind"]),
  );
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: year } = await supabase.from("academic_years").select("id, name").eq("organization_id", organizationId).eq("is_current", true).maybeSingle();
  const { error } = await supabase.from("student_diplomas").insert({
    organization_id: organizationId,
    student_id: p.data.student_id,
    kind: p.data.kind,
    title: p.data.title,
    program_id: nul(p.data.program_id),
    level_id: nul(p.data.level_id),
    academic_year_id: year?.id ?? null,
    year_label: nul(p.data.year_label) ?? year?.name ?? null,
    mention: nul(p.data.mention),
    conferred_on: nul(p.data.conferred_on),
    source: "app",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/diplomes", `/eleves/${p.data.student_id}`], "Diplôme délivré et numéroté.");
}

export async function revokeDiploma(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("diplomas.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_diplomas")
    .update({ status: "revoked", revoked_reason: String(formData.get("reason") ?? "").trim() }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Révocation impossible.") };
  return done(["/universite/diplomes"], "Diplôme révoqué (historique conservé).");
}

// --------------------------------------------------------------------------- Badges étudiants

export async function issueStudentBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_student_badge", { p_student_id: studentId, p_reason: reason || undefined });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/eleves/${studentId}`, "/universite/badges"], reason ? "Ancien badge désactivé, nouveau badge et nouveau QR générés." : "Badge étudiant généré.");
}

export async function revokeStudentBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (reason.length < 3) return { ok: false, message: "Motif obligatoire." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_badges")
    .update({ status: "revoked", revoked_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Aucun badge actif.") };
  return done([`/eleves/${studentId}`, "/universite/badges"], "Badge désactivé : il ne peut plus être scanné.");
}

export async function issuePromotionBadges(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_session_badges", { p_class_id: classId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/universite/badges"], data ? `${data} badge(s) généré(s).` : "Tous les étudiants de la promotion ont déjà un badge actif.");
}

// --------------------------------------------------------------------------- Paramètres

export async function saveUniversityConfig(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await uniAuth("settings.manage");
  if (!auth.ok) return auth;
  const p = parse(
    z.object({
      establishment_kind: z.enum(["universite", "institut", "ecole_superieure", "prive", "faculte", "autre"]),
      pass_mark: num(0, 20),
      retake_rule: z.enum(["best", "replace", "cap", "average"]),
      retake_cap: num(0, 20),
      semester_weighting: z.enum(["credits", "coefficient"]),
      eliminatory_mark: num(0, 20).optional(),
      year_pass_ratio: num(0, 1),
      conditional_pass_ratio: num(0, 1),
      late_tolerance_minutes: num(0, 120),
      open_before_minutes: num(0, 240),
      teacher_ranks: optText(1000),
    }),
    readFields(formData, ["establishment_kind", "pass_mark", "retake_rule", "retake_cap", "semester_weighting", "eliminatory_mark", "year_pass_ratio", "conditional_pass_ratio", "late_tolerance_minutes", "open_before_minutes", "teacher_ranks"]),
  );
  if (!p.ok) return p.result;
  const d = p.data;
  const features = Object.fromEntries(UNIVERSITY_FEATURES.map((f) => [f, readBoolean(formData, `feature_${f}`)]));
  const parentSections = Object.fromEntries(PARENT_SECTIONS.map((k) => [k, readBoolean(formData, `parent_section_${k}`)]));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_university_config", {
    p_org: auth.context.organization.id,
    p_config: {
      establishment_kind: d.establishment_kind,
      features,
      parent_portal_sections: parentSections,
      rules: {
        pass_mark: d.pass_mark,
        retake_rule: d.retake_rule,
        retake_cap: d.retake_cap,
        semester_weighting: d.semester_weighting,
        eliminatory_mark: d.eliminatory_mark ?? null,
        year_pass_ratio: d.year_pass_ratio,
        conditional_pass_ratio: d.conditional_pass_ratio,
        late_tolerance_minutes: d.late_tolerance_minutes,
        open_before_minutes: d.open_before_minutes,
        ue_compensation: readBoolean(formData, "ue_compensation"),
        semester_compensation: readBoolean(formData, "semester_compensation"),
        absent_as_zero: readBoolean(formData, "absent_as_zero"),
        entry_without_course: readBoolean(formData, "entry_without_course"),
      },
      teacher_ranks: (d.teacher_ranks ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Paramètres universitaires enregistrés." };
}
