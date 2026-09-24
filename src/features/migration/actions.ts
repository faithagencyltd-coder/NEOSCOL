"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { IMPORT_FIELDS, missingRequired, suggestMapping, type ImportKind, type Resolution } from "@/features/migration/fields";
import { parseImportFile, profileColumns } from "@/features/migration/parse";
import { listImportRows, type BatchStats, type ImportRowView } from "@/features/migration/queries";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

const KINDS = ["students", "grades", "payments"] as const;

export type UploadedImport = {
  batchId: string;
  kind: ImportKind;
  fileName: string;
  sheet: string | null;
  format: "xlsx" | "csv";
  rowCount: number;
  headers: string[];
  profile: ReturnType<typeof profileColumns>;
  mapping: Record<string, string>;
};

/** Étape 1 : lecture du fichier, création du lot et mise en attente des lignes. */
export async function uploadImportFile(_: ActionResult<UploadedImport> | null, formData: FormData): Promise<ActionResult<UploadedImport>> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  const kind = String(formData.get("kind") ?? "");
  if (!(KINDS as readonly string[]).includes(kind)) return { ok: false, message: "Choisissez le type de données à importer." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Aucun fichier sélectionné." };
  const parsed = await parseImportFile(file);
  if (!parsed.ok) return parsed;
  const { table } = parsed;

  const supabase = await createClient();
  const sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const { data: batchId, error } = await supabase.rpc("migration_create_batch", {
    p_organization_id: auth.context.organization.id,
    p_kind: kind,
    p_file_name: file.name || "import",
    p_file_size: file.size,
    p_file_sha256: sha256,
    p_headers: table.headers,
  });
  if (error || !batchId) return { ok: false, message: dbErrorMessage(error, "L'import n'a pas pu être créé.") };

  for (let i = 0; i < table.rows.length; i += 1000) {
    const chunk = table.rows.slice(i, i + 1000).map((d, j) => ({ n: i + j + 2, d }));
    const { error: appendError } = await supabase.rpc("migration_append_rows", { p_batch_id: batchId, p_rows: chunk });
    if (appendError) {
      await supabase.rpc("migration_cancel", { p_batch_id: batchId });
      return { ok: false, message: dbErrorMessage(appendError, "Les lignes n'ont pas pu être enregistrées.") };
    }
  }
  await supabase.rpc("log_event", {
    p_action: "migration.uploaded",
    p_organization_id: auth.context.organization.id,
    p_entity_type: "migration_batches",
    p_entity_id: batchId,
    p_summary: `Fichier « ${file.name} » chargé : ${table.rows.length} ligne(s), ${table.headers.length} colonne(s)`,
  });
  return {
    ok: true,
    data: {
      batchId,
      kind: kind as ImportKind,
      fileName: file.name,
      sheet: table.sheet ?? null,
      format: table.format,
      rowCount: table.rows.length,
      headers: table.headers,
      profile: profileColumns(table),
      mapping: suggestMapping(kind as ImportKind, table.headers),
    },
  };
}

const optionsSchema = z.object({
  default_status: z.enum(["alumni", "graduated", "transferred", "withdrawn", "inactive", "active"]).default("alumni"),
  create_years: z.boolean().default(true),
  archive: z.boolean().default(false),
});

/** Étapes 3 → 4 : correspondance validée, normalisation, contrôles et doublons en base. */
export async function analyzeImport(batchId: string, mapping: Record<string, string>, options: unknown): Promise<ActionResult<BatchStats>> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  if (!isUuid(batchId)) return { ok: false, message: "Import introuvable." };
  const supabase = await createClient();
  const { data: batch } = await supabase.from("migration_batches").select("kind").eq("id", batchId).maybeSingle();
  if (!batch) return { ok: false, message: "Import introuvable." };
  const kind = batch.kind as ImportKind;
  const allowed = new Set(IMPORT_FIELDS[kind].map((f) => f.key));
  const clean = Object.fromEntries(Object.entries(mapping).filter(([k, v]) => allowed.has(k) && typeof v === "string" && v));
  const missing = missingRequired(kind, clean);
  if (missing) return { ok: false, message: missing };
  const opts = optionsSchema.safeParse(options ?? {});
  if (!opts.success) return { ok: false, message: "Options invalides." };
  const { data, error } = await supabase.rpc("migration_analyze", { p_batch_id: batchId, p_mapping: clean, p_options: opts.data });
  if (error) return { ok: false, message: dbErrorMessage(error, "L'analyse a échoué.") };
  return { ok: true, data: data as BatchStats };
}

export async function fetchImportRows(batchId: string, view: ImportRowView, page = 1) {
  const auth = await authorize("students.import");
  if (!auth.ok || !isUuid(batchId)) return { rows: [], total: 0 };
  return listImportRows(auth.context.organization.id, batchId, view, Math.max(1, page));
}

/** Étape 5 : décision sur un doublon (appliquée à toutes les lignes du même élève). */
export async function resolveImportDuplicates(batchId: string, rowIds: string[], resolution: Resolution): Promise<ActionResult<{ pending: number }>> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  if (!isUuid(batchId) || !rowIds.every(isUuid) || !["existing", "merge", "create", "skip"].includes(resolution)) {
    return { ok: false, message: "Décision invalide." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("migration_resolve", { p_batch_id: batchId, p_row_ids: rowIds, p_resolution: resolution });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const { data } = await supabase.from("migration_batches").select("stats").eq("id", batchId).maybeSingle();
  return { ok: true, data: { pending: Number((data?.stats as BatchStats | null)?.pending_decisions ?? 0) } };
}

/** Étape 8 : import par tranches (la progression affichée est réelle). */
export async function runImportChunk(batchId: string): Promise<ActionResult<{ remaining: number; done: boolean; stats: BatchStats }>> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  if (!isUuid(batchId)) return { ok: false, message: "Import introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("migration_import_chunk", { p_batch_id: batchId, p_limit: 250 });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "L'import a été interrompu : relancez-le, il reprendra où il s'est arrêté.") };
  const result = data as { remaining: number; done: boolean; stats: BatchStats };
  if (result.done) {
    revalidatePath("/eleves");
    revalidatePath("/donnees-historiques");
  }
  return { ok: true, data: result };
}

export async function cancelImport(batchId: string): Promise<ActionResult> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  if (!isUuid(batchId)) return { ok: false, message: "Import introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("migration_cancel", { p_batch_id: batchId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/donnees-historiques");
  return { ok: true, message: "Import annulé : aucune donnée n'a été importée." };
}

const yearsSchema = z
  .object({
    from: z.coerce.number().int().min(1950, { error: "Année de début : 1950 au plus tôt." }),
    to: z.coerce.number().int(),
  })
  .refine((v) => v.to >= v.from, { error: "L'année de fin doit suivre l'année de début." })
  .refine((v) => v.to <= new Date().getFullYear(), { error: "Pas d'année future." })
  .refine((v) => v.to - v.from <= 60, { error: "60 ans au plus." });

/** Anciennes années scolaires (clôturées) : 2015-2016, 2016-2017… */
export async function createPastYears(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.import", "academic.manage");
  if (!auth.ok) return auth;
  const parsed = yearsSchema.safeParse({ from: formData.get("from"), to: formData.get("to") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Période invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_past_academic_years", {
    p_organization_id: auth.context.organization.id,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/donnees-historiques");
  revalidatePath("/structure");
  return {
    ok: true,
    message: data ? `${data} année(s) scolaire(s) créée(s), clôturée(s).` : "Toutes ces années existaient déjà : rien à créer.",
  };
}

// -----------------------------------------------------------------------------
// Ajout manuel d'un ancien élève (avec détection des doublons)
// -----------------------------------------------------------------------------
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optionalYear = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .refine((v) => v === undefined || (Number.isInteger(v) && v >= 1950 && v <= new Date().getFullYear() + 1), { error: "Année invalide." });

const legacySchema = z
  .object({
    last_name: z.string().trim().min(1, { error: "Le nom est obligatoire." }).max(80),
    first_name: z.string().trim().min(1, { error: "Le prénom est obligatoire." }).max(80),
    other_names: optionalText(120),
    sex: z.enum(["M", "F", ""]).optional(),
    birth_date: z
      .string()
      .optional()
      .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v > "1900-01-01" && v <= new Date().toISOString().slice(0, 10)), { error: "Date de naissance invalide." }),
    birth_place: optionalText(120),
    nationality: optionalText(60),
    phone: optionalText(40),
    email: z.union([z.literal(""), z.email({ error: "E-mail invalide." })]).optional(),
    address: optionalText(200),
    city: optionalText(80),
    legacy_matricule: optionalText(60),
    entry_year: optionalYear,
    exit_year: optionalYear,
    legacy_program: optionalText(200),
    status: z.enum(["alumni", "graduated", "transferred", "withdrawn", "inactive"]),
    status_reason: optionalText(500),
    notes: optionalText(2000),
    archive: z.boolean(),
    confirm_duplicate: z.boolean(),
  })
  .refine((v) => !v.entry_year || !v.exit_year || v.exit_year >= v.entry_year, { error: "L'année de sortie doit suivre l'année d'entrée.", path: ["exit_year"] });

export type LegacyDuplicate = { student_id: string; full_name: string; matricule: string; legacy_matricule: string | null; birth_date: string | null; status: string; archived: boolean; score: number; reasons: string[] };

export async function createLegacyStudent(
  _: ActionResult<{ id?: string; duplicates?: LegacyDuplicate[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ id?: string; duplicates?: LegacyDuplicate[] }>> {
  const auth = await authorize("students.create");
  if (!auth.ok) return auth;
  const text = (k: string) => String(formData.get(k) ?? "");
  const parsed = legacySchema.safeParse({
    ...Object.fromEntries(
      ["last_name", "first_name", "other_names", "sex", "birth_date", "birth_place", "nationality", "phone", "email", "address", "city",
        "legacy_matricule", "entry_year", "exit_year", "legacy_program", "status", "status_reason", "notes"].map((k) => [k, text(k)]),
    ),
    archive: formData.get("archive") === "on",
    confirm_duplicate: formData.get("confirm_duplicate") === "1",
  });
  if (!parsed.success) {
    return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const s = parsed.data;
  const organizationId = auth.context.organization.id;
  const supabase = await createClient();

  if (!s.confirm_duplicate) {
    const { data: duplicates } = await supabase.rpc("find_student_duplicates", {
      p_organization_id: organizationId,
      p_last_name: s.last_name,
      p_first_name: s.first_name,
      // Paramètres facultatifs côté SQL (NULL accepté) ; les types générés les déclarent non nuls.
      p_birth_date: (s.birth_date || null) as string,
      p_matricule: s.legacy_matricule,
      p_limit: 5,
    });
    if (duplicates && duplicates.length > 0) {
      // Pas encore créé : l'interface propose « utiliser l'existant » ou « créer malgré le doublon ».
      return { ok: true, data: { duplicates: duplicates as LegacyDuplicate[] } };
    }
  }

  const history = {
    year_label: text("h_year_label"),
    class_name: text("h_class_name"),
    level_name: text("h_level_name"),
    program_name: text("h_program_name") || s.legacy_program || "",
    average: text("h_average").replace(",", "."),
    decision: text("h_decision"),
    absences: text("h_absences"),
  };
  if (history.average && !(Number(history.average) >= 0 && Number(history.average) <= 100)) {
    return { ok: false, message: "Moyenne invalide.", fieldErrors: { h_average: ["Moyenne invalide."] } };
  }
  if (history.absences && !(Number.isInteger(Number(history.absences)) && Number(history.absences) >= 0)) {
    return { ok: false, message: "Nombre d'absences invalide.", fieldErrors: { h_absences: ["Nombre invalide."] } };
  }
  const diploma = { title: text("d_title"), kind: text("d_kind") || "diploma", year_label: text("d_year_label"), mention: text("d_mention"), number: text("d_number") };

  const { data: id, error } = await supabase.rpc("create_legacy_student", {
    p_organization_id: organizationId,
    p_student: { ...s, sex: s.sex || null, birth_date: s.birth_date || null, email: s.email || null },
    p_history: history,
    p_diploma: diploma,
  });
  if (error || !id) return { ok: false, message: dbErrorMessage(error, "Le dossier n'a pas pu être créé.") };
  revalidatePath("/eleves");
  revalidatePath("/donnees-historiques");
  return { ok: true, message: "Ancien élève enregistré.", data: { id } };
}

// -----------------------------------------------------------------------------
// Parcours et diplômes saisis depuis le dossier
// -----------------------------------------------------------------------------
const historySchema = z.object({
  student_id: z.uuid(),
  year_label: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").replace("/", "-"))
    .refine((v) => /^\d{4}-\d{4}$/.test(v) && Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, { error: "Année scolaire au format 2017-2018." }),
  class_name: optionalText(120),
  level_name: optionalText(120),
  program_name: optionalText(200),
  average: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined))
    .refine((v) => v === undefined || (v >= 0 && v <= 100), { error: "Moyenne invalide." }),
  rank: z.string().trim().optional().transform((v) => (v ? Number(v) : undefined)).refine((v) => v === undefined || (Number.isInteger(v) && v > 0), { error: "Rang invalide." }),
  decision: optionalText(200),
  absences: z.string().trim().optional().transform((v) => (v ? Number(v) : undefined)).refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), { error: "Nombre invalide." }),
  notes: optionalText(2000),
});

export async function addHistoryLine(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.update");
  if (!auth.ok) return auth;
  const parsed = historySchema.safeParse(Object.fromEntries(["student_id", "year_label", "class_name", "level_name", "program_name", "average", "rank", "decision", "absences", "notes"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const organizationId = auth.context.organization.id;
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_years").select("id").eq("organization_id", organizationId).eq("name", parsed.data.year_label).maybeSingle();
  const { error } = await supabase.from("student_history").insert({
    organization_id: organizationId,
    academic_year_id: year?.id ?? null,
    source: "manual",
    ...parsed.data,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/eleves/${parsed.data.student_id}`);
  return { ok: true, message: "Année ajoutée au parcours." };
}

export async function deleteHistoryLine(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.update");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const table = String(formData.get("table") ?? "");
  if (!isUuid(id) || !["student_history", "student_diplomas", "student_history_grades"].includes(table)) return { ok: false, message: "Élément introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from(table as "student_history")
    .delete({ count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || !count) return { ok: false, message: dbErrorMessage(error, "Suppression impossible.") };
  revalidatePath("/eleves", "layout");
  return { ok: true, message: "Élément supprimé." };
}

const diplomaSchema = z.object({
  student_id: z.uuid(),
  kind: z.enum(["diploma", "certificate", "attestation", "other"]),
  title: z.string().trim().min(2, { error: "Intitulé obligatoire." }).max(200),
  year_label: optionalText(20),
  mention: optionalText(120),
  number: optionalText(120),
  issued_on: z.string().optional().transform((v) => v || undefined).refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Date invalide." }),
  issuer: optionalText(200),
  notes: optionalText(1000),
});

/** Diplôme, certificat ou attestation (scan PDF/image facultatif, stocké en base). */
export async function addDiploma(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.update");
  if (!auth.ok) return auth;
  const parsed = diplomaSchema.safeParse(Object.fromEntries(["student_id", "kind", "title", "year_label", "mention", "number", "issued_on", "issuer", "notes"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Certains champs sont à corriger.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const organizationId = auth.context.organization.id;
  const supabase = await createClient();
  let fileId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const stored = await storeUpload(supabase, { organizationId, file, owner: "student", ownerId: parsed.data.student_id, category: "diploma", accept: ["pdf", "image"] });
    if (!stored.ok) return stored;
    fileId = stored.id;
  }
  const { error } = await supabase.from("student_diplomas").insert({ organization_id: organizationId, file_id: fileId, source: "manual", ...parsed.data });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/eleves/${parsed.data.student_id}`);
  return { ok: true, message: "Document ajouté au dossier." };
}

export type ImportSummary = {
  rows: number;
  toImport: number;
  newStudents: number;
  linked: number;
  merged: number;
  skipped: number;
  rejected: number;
  warnings: number;
  pending: number;
  years: string[];
};

/** Étape 7 : bilan exact avant import (décisions sur les doublons comprises). */
export async function getImportSummary(batchId: string): Promise<ActionResult<ImportSummary>> {
  const auth = await authorize("students.import");
  if (!auth.ok) return auth;
  if (!isUuid(batchId)) return { ok: false, message: "Import introuvable." };
  const supabase = await createClient();
  const rows: { status: string; resolution: string | null; group_key: string | null; normalized: unknown }[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await supabase
      .from("migration_rows")
      .select("status, resolution, group_key, normalized")
      .eq("organization_id", auth.context.organization.id)
      .eq("batch_id", batchId)
      .order("row_number")
      .range(from, from + 999);
    if (error) return { ok: false, message: dbErrorMessage(error) };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const importable = rows.filter((r) => ["valid", "warning", "duplicate"].includes(r.status) && r.resolution !== "skip");
  const groups = new Map<string, string | null>();
  for (const r of importable) if (r.group_key && !groups.has(r.group_key)) groups.set(r.group_key, r.resolution);
  const decisions = [...groups.values()];
  const { data: existingYears } = await supabase.from("academic_years").select("name").eq("organization_id", auth.context.organization.id);
  const known = new Set((existingYears ?? []).map((y) => y.name));
  const years = [...new Set(importable.map((r) => (r.normalized as { year_label?: string } | null)?.year_label).filter((y): y is string => Boolean(y) && !known.has(y!)))].sort();
  return {
    ok: true,
    data: {
      rows: rows.length,
      toImport: importable.length,
      newStudents: decisions.filter((d) => d === null || d === "create").length,
      linked: decisions.filter((d) => d === "existing").length,
      merged: decisions.filter((d) => d === "merge").length,
      skipped: rows.filter((r) => r.resolution === "skip").length,
      rejected: rows.filter((r) => r.status === "invalid" || r.status === "rejected").length,
      warnings: rows.filter((r) => r.status === "warning").length,
      pending: rows.filter((r) => r.resolution === "pending").length,
      years,
    },
  };
}
