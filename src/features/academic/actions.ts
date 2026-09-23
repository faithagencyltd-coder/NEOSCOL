"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean, readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." });
const uuid = z.string().refine(isUuid, { error: "Sélection invalide." });
const text = (max: number) => z.string({ error: "Champ requis." }).trim().min(1, { error: "Champ requis." }).max(max);
const code = z.string({ error: "Code requis." }).trim().regex(/^[A-Za-z0-9_-]{1,20}$/, { error: "Code : lettres, chiffres, - ou _ (20 max)." });
const positiveInt = z.coerce.number().int().positive({ error: "Nombre positif attendu." });

type Parsed<T> = { ok: true; data: T } | { ok: false; result: ActionResult };

function parse<T extends z.ZodType>(schema: T, input: unknown): Parsed<z.infer<T>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
  const formErrors = z.flattenError(parsed.error).formErrors;
  return { ok: false, result: { ok: false, message: formErrors[0] ?? "Certains champs sont à corriger.", fieldErrors } };
}

function done(paths: string[], message: string): ActionResult {
  for (const path of paths) revalidatePath(path);
  return { ok: true, message };
}

// --------------------------------------------------------------------------- Années et périodes

const yearSchema = z
  .object({ name: text(40), starts_on: date, ends_on: date })
  .refine((v) => v.ends_on > v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] });

export async function createAcademicYear(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(yearSchema, readFields(formData, ["name", "starts_on", "ends_on"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("academic_years").insert({
    organization_id: auth.context.organization.id,
    ...parsed.data,
    status: "planned",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], "Année scolaire créée.");
}

export async function setCurrentYear(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const yearId = String(formData.get("year_id") ?? "");
  if (!isUuid(yearId)) return { ok: false, message: "Année introuvable." };
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { error: resetError } = await supabase
    .from("academic_years")
    .update({ is_current: false })
    .eq("organization_id", organizationId)
    .eq("is_current", true);
  if (resetError) return { ok: false, message: dbErrorMessage(resetError) };
  const { error } = await supabase
    .from("academic_years")
    .update({ is_current: true, status: "active" })
    .eq("organization_id", organizationId)
    .eq("id", yearId);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure", "/classes", "/eleves", "/tableau-de-bord"], "Année courante modifiée.");
}

const periodSchema = z
  .object({
    academic_year_id: uuid,
    name: text(60),
    type: z.enum(["trimester", "semester", "session", "custom"]),
    sequence: positiveInt,
    starts_on: date,
    ends_on: date,
  })
  .refine((v) => v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] });

export async function createPeriod(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(periodSchema, readFields(formData, ["academic_year_id", "name", "type", "sequence", "starts_on", "ends_on"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("academic_periods").insert({ organization_id: auth.context.organization.id, ...parsed.data });
  if (error) {
    return { ok: false, message: error.code === "23505" ? "Ce numéro d'ordre est déjà utilisé pour cette année." : dbErrorMessage(error) };
  }
  return done(["/structure"], "Période créée.");
}

export async function setPeriodLocked(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("periods.lock");
  if (!auth.ok) return auth;
  const periodId = String(formData.get("period_id") ?? "");
  if (!isUuid(periodId)) return { ok: false, message: "Période introuvable." };
  const lock = formData.get("lock") === "true";
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("academic_periods")
    .update({ is_locked: lock }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", periodId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], lock ? "Période verrouillée." : "Période déverrouillée.");
}

// --------------------------------------------------------------------------- Niveaux, filières, matières, salles

const levelSchema = z.object({
  name: text(60),
  short_name: z.string().trim().max(20).optional(),
  cycle: z.string().trim().max(60).optional(),
  sequence: positiveInt,
});

export async function createLevel(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(levelSchema, readFields(formData, ["name", "short_name", "cycle", "sequence"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("levels").insert({ organization_id: auth.context.organization.id, ...parsed.data });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], "Niveau créé.");
}

const programSchema = z.object({
  name: text(120),
  code,
  kind: z.enum(["track", "training", "degree"]),
  duration_hours: positiveInt.optional(),
  description: z.string().trim().max(1000).optional(),
});

export async function createProgram(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(programSchema, readFields(formData, ["name", "code", "kind", "duration_hours", "description"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase
    .from("programs")
    .insert({ organization_id: auth.context.organization.id, ...parsed.data, code: parsed.data.code.toUpperCase() });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], "Filière / formation créée.");
}

const subjectSchema = z.object({
  name: text(120),
  code,
  kind: z.enum(["subject", "module"]),
  program_id: uuid.optional(),
  credits: z.coerce.number().min(0).max(100).optional(),
});

export async function createSubject(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(subjectSchema, readFields(formData, ["name", "code", "kind", "program_id", "credits"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase
    .from("subjects")
    .insert({ organization_id: auth.context.organization.id, ...parsed.data, code: parsed.data.code.toUpperCase() });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], "Matière créée.");
}

const roomSchema = z.object({ name: text(60), building: z.string().trim().max(60).optional(), capacity: positiveInt.optional() });

export async function createRoom(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(roomSchema, readFields(formData, ["name", "building", "capacity"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").insert({ organization_id: auth.context.organization.id, ...parsed.data });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/structure"], "Salle créée.");
}

// --------------------------------------------------------------------------- Classes

const CLASS_FIELDS = [
  "academic_year_id", "name", "code", "kind", "level_id", "program_id",
  "capacity", "room_id", "head_teacher_id", "starts_on", "ends_on",
] as const;

const classSchema = z
  .object({
    academic_year_id: uuid,
    name: text(80),
    code: z.string().trim().max(20).optional(),
    kind: z.enum(["class", "training_session"]),
    level_id: uuid.optional(),
    program_id: uuid.optional(),
    capacity: positiveInt.optional(),
    room_id: uuid.optional(),
    head_teacher_id: uuid.optional(),
    starts_on: date.optional(),
    ends_on: date.optional(),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] });

function classValues(data: z.infer<typeof classSchema>) {
  return {
    academic_year_id: data.academic_year_id,
    name: data.name,
    code: data.code ?? null,
    kind: data.kind,
    level_id: data.level_id ?? null,
    program_id: data.program_id ?? null,
    capacity: data.capacity ?? null,
    room_id: data.room_id ?? null,
    head_teacher_id: data.head_teacher_id ?? null,
    starts_on: data.starts_on ?? null,
    ends_on: data.ends_on ?? null,
  };
}

export async function createClass(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(classSchema, readFields(formData, CLASS_FIELDS));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .insert({ organization_id: auth.context.organization.id, ...classValues(parsed.data) });
  if (error) {
    return { ok: false, message: error.code === "23505" ? "Une classe porte déjà ce nom pour cette année." : dbErrorMessage(error) };
  }
  return done(["/classes"], "Classe créée.");
}

export async function updateClass(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(classId)) return { ok: false, message: "Classe introuvable." };
  const parsed = parse(classSchema, readFields(formData, CLASS_FIELDS));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("classes")
    .update(classValues(parsed.data), { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", classId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(["/classes", `/classes/${classId}`], "Classe mise à jour.");
}

const classSubjectSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  teacher_id: uuid.optional(),
  coefficient: z.coerce.number().positive({ error: "Coefficient positif attendu." }).max(100),
  weekly_hours: z.coerce.number().min(0).max(60).optional(),
});

export async function saveClassSubject(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(classSubjectSchema, readFields(formData, ["class_id", "subject_id", "teacher_id", "coefficient", "weekly_hours"]));
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("class_subjects").upsert(
    {
      organization_id: auth.context.organization.id,
      class_id: parsed.data.class_id,
      subject_id: parsed.data.subject_id,
      teacher_id: parsed.data.teacher_id ?? null,
      coefficient: parsed.data.coefficient,
      weekly_hours: parsed.data.weekly_hours ?? null,
    },
    { onConflict: "class_id,subject_id" },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/classes/${parsed.data.class_id}`], "Matière enregistrée pour la classe.");
}

export async function removeClassSubject(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("class_subject_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(id) || !isUuid(classId)) return { ok: false, message: "Élément introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("class_subjects")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      message: error.code === "23503" ? "Des évaluations existent pour cette matière : elle ne peut pas être retirée." : dbErrorMessage(error),
    };
  }
  if (count === 0) return { ok: false, message: "Élément introuvable." };
  return done([`/classes/${classId}`], "Matière retirée de la classe.");
}

export async function toggleArchivedClass(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(classId)) return { ok: false, message: "Classe introuvable." };
  const archive = readBoolean(formData, "archive");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("classes")
    .update({ archived_at: archive ? new Date().toISOString() : null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", classId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(["/classes", `/classes/${classId}`], archive ? "Classe archivée." : "Classe restaurée.");
}

/** Ordre des matières (bulletin, carnets) : échange avec la voisine puis renumérotation. */
export async function moveClassSubject(formData: FormData): Promise<void> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return;
  const id = String(formData.get("class_subject_id") ?? "");
  const classId = String(formData.get("class_id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (!isUuid(id) || !isUuid(classId)) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select("id, sort_order, subject:subjects(name)")
    .eq("organization_id", auth.context.organization.id)
    .eq("class_id", classId);
  const ordered = (data ?? []).sort((a, b) => a.sort_order - b.sort_order || (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "", "fr"));
  const index = ordered.findIndex((cs) => cs.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return;
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  for (const [position, cs] of ordered.entries()) {
    if (cs.sort_order !== position + 1) await supabase.from("class_subjects").update({ sort_order: position + 1 }).eq("id", cs.id);
  }
  revalidatePath(`/classes/${classId}`);
  revalidatePath("/bulletins", "layout");
}
