"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readBoolean, readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

import { isTrainingOrg, LEARNER_DOCUMENT_CATEGORIES } from "./config";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." });
const uuid = z.string().refine(isUuid, { error: "Sélection invalide." });
const text = (max: number) => z.string({ error: "Champ requis." }).trim().min(1, { error: "Champ requis." }).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const amount = z.coerce.number({ error: "Montant invalide." }).min(0, { error: "Montant positif attendu." }).max(1_000_000_000);

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

/** Garde commune : permission + établissement de formation (le reste est contrôlé en base). */
async function trainingAuth(...permissions: Parameters<typeof authorize>) {
  const auth = await authorize(...permissions);
  if (!auth.ok) return auth;
  if (!isTrainingOrg(auth.context.organization.type)) {
    return { ok: false as const, message: "Fonction réservée aux centres de formation professionnelle." };
  }
  return auth;
}

// --------------------------------------------------------------------------- Formations

const formationSchema = z.object({
  name: text(120),
  code: z.string({ error: "Code requis." }).trim().regex(/^[A-Za-z0-9_-]{1,20}$/, { error: "Code : lettres, chiffres, - ou _ (20 max)." }),
  duration_hours: z.coerce.number().int().positive({ error: "Durée en heures positive." }).max(10000).optional(),
  duration_label: optionalText(60),
  training_level: optionalText(120),
  admission_conditions: optionalText(2000),
  certificate_title: optionalText(160),
  syllabus: optionalText(8000),
  description: optionalText(2000),
  tuition_amount: amount.optional(),
  registration_fee: amount.optional(),
  default_installments: z.coerce.number().int().min(1).max(24).optional(),
});
const FORMATION_FIELDS = [
  "name", "code", "duration_hours", "duration_label", "training_level", "admission_conditions", "certificate_title",
  "syllabus", "description", "tuition_amount", "registration_fee", "default_installments",
] as const;

function formationValues(d: z.infer<typeof formationSchema>) {
  return {
    name: d.name,
    code: d.code.toUpperCase(),
    duration_hours: d.duration_hours ?? null,
    duration_label: d.duration_label || null,
    training_level: d.training_level || null,
    admission_conditions: d.admission_conditions || null,
    certificate_title: d.certificate_title || null,
    syllabus: d.syllabus || null,
    description: d.description || null,
    tuition_amount: d.tuition_amount ?? null,
    registration_fee: d.registration_fee ?? null,
    default_installments: d.default_installments ?? null,
  };
}

export async function saveFormation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(formationSchema, readFields(formData, FORMATION_FIELDS));
  if (!parsed.ok) return parsed.result;
  const id = String(formData.get("formation_id") ?? "");
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  if (isUuid(id)) {
    const { error, count } = await supabase
      .from("programs")
      .update(formationValues(parsed.data), { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("kind", "training")
      .eq("id", id);
    if (error || count === 0) return { ok: false, message: error?.code === "23505" ? "Une formation utilise déjà ce code." : dbErrorMessage(error) };
    return done(["/formation/formations", `/formation/formations/${id}`], "Formation mise à jour.");
  }
  const { data, error } = await supabase
    .from("programs")
    .insert({ organization_id: organizationId, kind: "training", ...formationValues(parsed.data) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.code === "23505" ? "Une formation utilise déjà ce code." : dbErrorMessage(error) };
  revalidatePath("/formation/formations");
  redirect(`/formation/formations/${data.id}?cree=1`);
}

export async function setFormationActive(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("formation_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Formation introuvable." };
  const active = readBoolean(formData, "active");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("programs")
    .update({ is_active: active }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("kind", "training")
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done(["/formation/formations", `/formation/formations/${id}`], active ? "Formation réactivée." : "Formation désactivée : plus aucune nouvelle session ni inscription.");
}

export async function deleteFormation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("formation_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Formation introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_training_program", { p_program_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/formation/formations");
  redirect("/formation/formations?supprime=1");
}

// --------------------------------------------------------------------------- Compétences

export async function saveCompetency(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({ program_id: uuid, name: text(160), description: optionalText(1000), sequence: z.coerce.number().int().min(0).max(999).optional() }),
    readFields(formData, ["program_id", "name", "description", "sequence"]),
  );
  if (!parsed.ok) return parsed.result;
  const id = String(formData.get("competency_id") ?? "");
  const supabase = await createClient();
  const values = { name: parsed.data.name, description: parsed.data.description || null, sequence: parsed.data.sequence ?? 0 };
  const { error } = isUuid(id)
    ? await supabase.from("training_competencies").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("training_competencies").insert({ organization_id: auth.context.organization.id, program_id: parsed.data.program_id, ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Cette compétence existe déjà pour la formation." : dbErrorMessage(error) };
  return done([`/formation/formations/${parsed.data.program_id}`], isUuid(id) ? "Compétence mise à jour." : "Compétence ajoutée.");
}

export async function setCompetencyActive(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("competency_id") ?? "");
  const programId = String(formData.get("program_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Compétence introuvable." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_competencies")
    .update({ is_active: readBoolean(formData, "active") })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/formation/formations/${programId}`], "Compétence mise à jour.");
}

const LEVELS = ["not_acquired", "in_progress", "acquired", "mastered"] as const;

export async function evaluateCompetency(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("grades.enter", "grades.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({ enrollment_id: uuid, competency_id: uuid, student_id: uuid, level: z.enum(LEVELS, { error: "Niveau invalide." }), comment: optionalText(500) }),
    readFields(formData, ["enrollment_id", "competency_id", "student_id", "level", "comment"]),
  );
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: auth.context.organization.timezone }).format(new Date());
  const { error } = await supabase.from("learner_competencies").upsert(
    {
      organization_id: auth.context.organization.id,
      enrollment_id: parsed.data.enrollment_id,
      student_id: parsed.data.student_id,
      competency_id: parsed.data.competency_id,
      level: parsed.data.level,
      comment: parsed.data.comment || null,
      evaluated_on: today,
    },
    { onConflict: "enrollment_id,competency_id" },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const sessionId = String(formData.get("session_id") ?? "");
  return done(
    [`/eleves/${parsed.data.student_id}`, ...(isUuid(sessionId) ? [`/formation/sessions/${sessionId}/competences`] : [])],
    "Évaluation de la compétence enregistrée.",
  );
}

// --------------------------------------------------------------------------- Sessions et groupes

const sessionSchema = z
  .object({
    program_id: uuid,
    name: text(80),
    starts_on: date,
    ends_on: date,
    capacity: z.coerce.number().int().positive().max(10000).optional(),
    room_id: uuid.optional(),
    head_teacher_id: uuid.optional(),
    tuition_amount: amount.optional(),
    syllabus: optionalText(8000),
  })
  .refine((v) => v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] });
const SESSION_FIELDS = ["program_id", "name", "starts_on", "ends_on", "capacity", "room_id", "head_teacher_id", "tuition_amount", "syllabus"] as const;

export async function saveSession(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(sessionSchema, readFields(formData, SESSION_FIELDS));
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  const id = String(formData.get("session_id") ?? "");
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const values = {
    name: d.name,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
    capacity: d.capacity ?? null,
    room_id: d.room_id ?? null,
    head_teacher_id: d.head_teacher_id ?? null,
    tuition_amount: d.tuition_amount ?? null,
    syllabus: d.syllabus || null,
  };
  if (isUuid(id)) {
    const { error, count } = await supabase
      .from("classes")
      .update(values, { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("kind", "training_session")
      .eq("id", id);
    if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
    return done(["/formation/sessions", `/formation/sessions/${id}`], "Session mise à jour.");
  }
  // L'année de formation est déduite de la date de début (sinon année en cours).
  const { data: years } = await supabase.from("academic_years").select("id, starts_on, ends_on, is_current").eq("organization_id", organizationId);
  const year = (years ?? []).find((y) => y.starts_on <= d.starts_on && y.ends_on >= d.starts_on) ?? (years ?? []).find((y) => y.is_current);
  if (!year) return { ok: false, message: "Créez d'abord l'année de formation (Paramètres → Année)." };
  const { data, error } = await supabase
    .from("classes")
    .insert({ organization_id: organizationId, academic_year_id: year.id, program_id: d.program_id, kind: "training_session", ...values })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: error?.code === "23505" ? "Une session porte déjà ce nom pour cette année." : dbErrorMessage(error) };
  revalidatePath("/formation/sessions");
  redirect(`/formation/sessions/${data.id}?cree=1`);
}

export async function saveGroup(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({ session_id: uuid, name: text(60), capacity: z.coerce.number().int().positive().max(10000).optional(), room_id: uuid.optional() }),
    readFields(formData, ["session_id", "name", "capacity", "room_id"]),
  );
  if (!parsed.ok) return parsed.result;
  const id = String(formData.get("group_id") ?? "");
  const supabase = await createClient();
  const values = { name: parsed.data.name, capacity: parsed.data.capacity ?? null, room_id: parsed.data.room_id ?? null };
  const { error } = isUuid(id)
    ? await supabase.from("training_groups").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("training_groups").insert({ organization_id: auth.context.organization.id, class_id: parsed.data.session_id, ...values });
  if (error) return { ok: false, message: error.code === "23505" ? "Un groupe porte déjà ce nom dans la session." : dbErrorMessage(error) };
  return done([`/formation/sessions/${parsed.data.session_id}`], isUuid(id) ? "Groupe mis à jour." : "Groupe créé.");
}

export async function setGroupArchived(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("group_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Groupe introuvable." };
  const archive = readBoolean(formData, "archive");
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_groups")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/formation/sessions/${sessionId}`], archive ? "Groupe archivé (les apprenants gardent leur historique)." : "Groupe restauré.");
}

/** Affecte (ou retire) un apprenant à un groupe de sa session. */
export async function assignGroup(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const enrollmentId = String(formData.get("enrollment_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  if (!isUuid(enrollmentId)) return { ok: false, message: "Inscription introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("enrollments")
    .update({ group_id: isUuid(groupId) ? groupId : null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", enrollmentId);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  return done([`/formation/sessions/${sessionId}`], "Groupe de l'apprenant mis à jour.");
}

// --------------------------------------------------------------------------- Paramètres

export async function saveTrainingConfig(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("settings.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({
      late_tolerance_minutes: z.coerce.number().int().min(0, { error: "Entre 0 et 120 minutes." }).max(120, { error: "Entre 0 et 120 minutes." }),
      open_before_minutes: z.coerce.number().int().min(0, { error: "Entre 0 et 240 minutes." }).max(240, { error: "Entre 0 et 240 minutes." }),
    }),
    readFields(formData, ["late_tolerance_minutes", "open_before_minutes"]),
  );
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_training_config", {
    p_org: auth.context.organization.id,
    p_config: {
      ...parsed.data,
      groups_enabled: readBoolean(formData, "groups_enabled"),
      entry_without_course: readBoolean(formData, "entry_without_course"),
    },
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Paramètres de la formation enregistrés." };
}

// --------------------------------------------------------------------------- Inscription

const METHODS = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;

const enrollSchema = z
  .object({
    student_id: uuid.optional(),
    first_name: optionalText(80),
    last_name: optionalText(80),
    sex: z.enum(["M", "F"]).optional(),
    birth_date: date.optional(),
    birth_place: optionalText(120),
    phone: optionalText(40),
    email: z.email({ error: "E-mail invalide." }).optional(),
    address: optionalText(200),
    city: optionalText(80),
    education_level: optionalText(120),
    contact_first_name: optionalText(80),
    contact_last_name: optionalText(80),
    contact_phone: optionalText(40),
    contact_relationship: z.enum(["father", "mother", "tutor", "grandparent", "sibling", "other"]).optional(),
    session_id: uuid,
    group_id: uuid.optional(),
    plan: z.enum(["full", "installments"]),
    installments: z.coerce.number().int().min(1).max(24).optional(),
    first_due_on: date.optional(),
    discount: amount.optional(),
    discount_reason: optionalText(200),
    payment_amount: amount.optional(),
    payment_method: z.enum(METHODS).optional(),
    payment_reference: optionalText(80),
    payer_name: optionalText(120),
    notes: optionalText(1000),
  })
  .refine((v) => v.student_id || (v.first_name && v.last_name), { error: "Nom et prénom de l'apprenant obligatoires.", path: ["last_name"] });
const ENROLL_FIELDS = [
  "student_id", "first_name", "last_name", "sex", "birth_date", "birth_place", "phone", "email", "address", "city", "education_level",
  "contact_first_name", "contact_last_name", "contact_phone", "contact_relationship", "session_id", "group_id", "plan", "installments",
  "first_due_on", "discount", "discount_reason", "payment_amount", "payment_method", "payment_reference", "payer_name", "notes",
] as const;

export async function enrollLearner(
  _: ActionResult<{ studentId: string; invoiceId: string | null; paymentId: string | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ studentId: string; invoiceId: string | null; paymentId: string | null }>> {
  const auth = await trainingAuth("enrollments.manage");
  if (!auth.ok) return auth;
  const parsed = parse(enrollSchema, readFields(formData, ENROLL_FIELDS));
  if (!parsed.ok) return parsed.result as ActionResult<never>;
  const d = parsed.data;
  if ((d.payment_amount ?? 0) > 0 && !auth.context.permissions.has("finance.payments.create")) {
    return { ok: false, message: "L'encaissement nécessite la permission finance.payments.create : laissez le versement à 0." };
  }
  if ((d.discount ?? 0) > 0 && !auth.context.permissions.has("finance.invoices.manage")) {
    return { ok: false, message: "Une remise nécessite la permission finance.invoices.manage." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enroll_learner", {
    p_organization_id: auth.context.organization.id,
    p_payload: {
      student_id: d.student_id ?? null,
      student: d.student_id
        ? { education_level: d.education_level ?? "" }
        : {
            first_name: d.first_name,
            last_name: d.last_name,
            sex: d.sex ?? "",
            birth_date: d.birth_date ?? "",
            birth_place: d.birth_place ?? "",
            phone: d.phone ?? "",
            email: d.email ?? "",
            address: d.address ?? "",
            city: d.city ?? "",
            education_level: d.education_level ?? "",
          },
      guardian: d.contact_last_name && d.contact_first_name
        ? { first_name: d.contact_first_name, last_name: d.contact_last_name, phone: d.contact_phone ?? "", relationship: d.contact_relationship ?? "other" }
        : null,
      session_id: d.session_id,
      group_id: d.group_id ?? null,
      plan: d.plan,
      installments: d.installments ?? null,
      first_due_on: d.first_due_on ?? null,
      discount: d.discount ?? 0,
      discount_reason: d.discount_reason ?? "",
      payment: { amount: d.payment_amount ?? 0, method: d.payment_method ?? "cash", reference: d.payment_reference ?? "", payer_name: d.payer_name ?? "" },
      notes: d.notes ?? "",
    },
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "L'inscription n'a pas pu être enregistrée.") };
  const result = data as { student_id: string; invoice_id: string | null; payment_id: string | null };
  revalidatePath("/formation", "layout");
  revalidatePath("/eleves", "layout");
  revalidatePath("/finances", "layout");
  return {
    ok: true,
    message: "Inscription enregistrée.",
    data: { studentId: result.student_id, invoiceId: result.invoice_id, paymentId: result.payment_id },
  };
}

// --------------------------------------------------------------------------- Badges apprenants

export async function issueLearnerBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Apprenant introuvable." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_student_badge", { p_student_id: studentId, p_reason: reason || undefined });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/eleves/${studentId}`, "/formation/badges"], reason ? "Ancien badge désactivé, nouveau badge généré." : "Badge généré.");
}

export async function revokeLearnerBadge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (!isUuid(studentId)) return { ok: false, message: "Apprenant introuvable." };
  if (reason.length < 3) return { ok: false, message: "Indiquez le motif de désactivation.", fieldErrors: { reason: ["Motif obligatoire."] } };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("student_badges")
    .update({ status: "revoked", revoked_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Aucun badge actif à désactiver.") };
  return done([`/eleves/${studentId}`, "/formation/badges"], "Badge désactivé : il ne peut plus être scanné.");
}

export async function issueSessionBadges(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.badges.manage");
  if (!auth.ok) return auth;
  const sessionId = String(formData.get("session_id") ?? "");
  if (!isUuid(sessionId)) return { ok: false, message: "Choisissez une session." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_session_badges", { p_class_id: sessionId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done(["/formation/badges", `/formation/sessions/${sessionId}`], data ? `${data} badge(s) généré(s).` : "Tous les apprenants de la session ont déjà un badge actif.");
}

// --------------------------------------------------------------------------- Stages

const internshipSchema = z
  .object({
    student_id: uuid,
    enrollment_id: uuid.optional(),
    company_name: text(160),
    company_address: optionalText(300),
    company_phone: optionalText(40),
    company_email: optionalText(160),
    tutor_name: optionalText(120),
    tutor_title: optionalText(120),
    tutor_phone: optionalText(40),
    tutor_email: optionalText(160),
    missions: optionalText(2000),
    starts_on: date,
    ends_on: date,
    status: z.enum(["planned", "ongoing", "completed", "cancelled"]),
    evaluation_score: z.coerce.number().min(0, { error: "Note sur 20." }).max(20, { error: "Note sur 20." }).optional(),
    evaluation_comment: optionalText(2000),
  })
  .refine((v) => v.ends_on >= v.starts_on, { error: "La fin doit suivre le début.", path: ["ends_on"] });
const INTERNSHIP_FIELDS = [
  "student_id", "enrollment_id", "company_name", "company_address", "company_phone", "company_email", "tutor_name", "tutor_title",
  "tutor_phone", "tutor_email", "missions", "starts_on", "ends_on", "status", "evaluation_score", "evaluation_comment",
] as const;

export async function saveInternship(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.update");
  if (!auth.ok) return auth;
  const parsed = parse(internshipSchema, readFields(formData, INTERNSHIP_FIELDS));
  if (!parsed.ok) return parsed.result;
  const d = parsed.data;
  const values = {
    enrollment_id: d.enrollment_id ?? null,
    company_name: d.company_name,
    company_address: d.company_address || null,
    company_phone: d.company_phone || null,
    company_email: d.company_email || null,
    tutor_name: d.tutor_name || null,
    tutor_title: d.tutor_title || null,
    tutor_phone: d.tutor_phone || null,
    tutor_email: d.tutor_email || null,
    missions: d.missions || null,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
    status: d.status,
    evaluation_score: d.evaluation_score ?? null,
    evaluation_comment: d.evaluation_comment || null,
  };
  const id = String(formData.get("internship_id") ?? "");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("internships").update(values).eq("organization_id", auth.context.organization.id).eq("id", id)
    : await supabase.from("internships").insert({ organization_id: auth.context.organization.id, student_id: d.student_id, ...values });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/eleves/${d.student_id}`], isUuid(id) ? "Stage mis à jour." : "Stage enregistré.");
}

// --------------------------------------------------------------------------- Pièces du dossier

export async function uploadLearnerDocument(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.update");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  const category = String(formData.get("category") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Apprenant introuvable." };
  if (!(category in LEARNER_DOCUMENT_CATEGORIES)) return { ok: false, message: "Choisissez le type de document." };
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("id").eq("organization_id", auth.context.organization.id).eq("id", studentId).maybeSingle();
  if (!student) return { ok: false, message: "Apprenant introuvable." };
  const stored = await storeUpload(supabase, {
    organizationId: auth.context.organization.id,
    file: formData.get("file") as File,
    owner: "student",
    ownerId: studentId,
    category,
    accept: ["pdf", "image"],
  });
  if (!stored.ok) return stored;
  return done([`/eleves/${studentId}`], "Document ajouté au dossier.");
}

export async function deleteLearnerDocument(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("students.update");
  if (!auth.ok) return auth;
  const fileId = String(formData.get("file_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(fileId)) return { ok: false, message: "Document introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("file_objects")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("owner_type", "student")
    .eq("owner_id", studentId)
    .eq("id", fileId)
    .neq("category", "photo");
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Suppression impossible.") };
  return done([`/eleves/${studentId}`], "Document retiré du dossier.");
}

// --------------------------------------------------------------------------- Modules (cours) d'une formation

export async function saveModule(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({
      program_id: uuid,
      name: text(120),
      code: z.string({ error: "Code requis." }).trim().regex(/^[A-Za-z0-9_-]{1,20}$/, { error: "Code : lettres, chiffres, - ou _ (20 max)." }),
    }),
    readFields(formData, ["program_id", "name", "code"]),
  );
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("subjects").insert({
    organization_id: auth.context.organization.id,
    program_id: parsed.data.program_id,
    name: parsed.data.name,
    code: parsed.data.code.toUpperCase(),
    kind: "module",
  });
  if (error) return { ok: false, message: error.code === "23505" ? "Un module utilise déjà ce code." : dbErrorMessage(error) };
  return done([`/formation/formations/${parsed.data.program_id}`], "Module ajouté à la formation.");
}

/** Module d'une session : affecte le formateur qui l'enseigne (class_subjects). */
export async function assignSessionModule(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await trainingAuth("academic.manage");
  if (!auth.ok) return auth;
  const parsed = parse(
    z.object({ session_id: uuid, subject_id: uuid, teacher_id: uuid.optional(), weekly_hours: z.coerce.number().min(0).max(60).optional() }),
    readFields(formData, ["session_id", "subject_id", "teacher_id", "weekly_hours"]),
  );
  if (!parsed.ok) return parsed.result;
  const supabase = await createClient();
  const { error } = await supabase.from("class_subjects").upsert(
    {
      organization_id: auth.context.organization.id,
      class_id: parsed.data.session_id,
      subject_id: parsed.data.subject_id,
      teacher_id: parsed.data.teacher_id ?? null,
      weekly_hours: parsed.data.weekly_hours ?? null,
    },
    { onConflict: "class_id,subject_id" },
  );
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return done([`/formation/sessions/${parsed.data.session_id}`], "Module et formateur enregistrés.");
}
