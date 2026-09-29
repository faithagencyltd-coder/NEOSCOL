"use server";

import { revalidatePath } from "next/cache";

import { parseImportFile } from "@/features/migration/parse";
import { authorize } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import { parseColumnsText, type CcImportResult, type CcMapping } from "./types";

/**
 * Country Connect : échanges par fichiers avec les systèmes nationaux (aucune
 * API inventée). Droits, format de l'identifiant, rattachement des élèves et
 * journal sont vérifiés EN BASE ; ces actions lisent le fichier et relaient.
 */
const refresh = () => {
  revalidatePath("/parametres/country-connect");
  revalidatePath("/plateforme/country-connect");
};

/** Correspondance de l'établissement actif, ou modèle d'un pays (Super Admin). */
export async function saveMapping(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const scope = String(formData.get("scope") ?? "organization");
  let org: string | null = null;
  let country: string | null = null;
  if (scope === "country") {
    country = String(formData.get("country") ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return { ok: false, message: "Pays invalide." };
  } else {
    const auth = await authorize("settings.manage");
    if (!auth.ok) return auth;
    org = auth.context.organization.id;
  }
  const columns = parseColumnsText(String(formData.get("columns") ?? ""));
  if (!columns.ok) return columns;
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_country_connect_mapping", {
    p_org: org as string,
    p_country: country as string,
    p_id: (isUuid(id) ? id : null) as string,
    p_name: String(formData.get("name") ?? "").trim(),
    p_direction: direction,
    p_columns: columns.columns,
    p_delimiter: String(formData.get("delimiter") ?? ";"),
    p_date_format: String(formData.get("date_format") ?? "dd/MM/yyyy"),
    p_active: formData.get("is_active") === "on",
    p_description: String(formData.get("description") ?? "").slice(0, 500),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Correspondance enregistrée." };
}

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

/** Import d'un fichier national : vérification (aucune écriture) ou application. */
export async function runCountryImport(formData: FormData): Promise<ActionResult<CcImportResult>> {
  const auth = await authorize("students.import", "students.update");
  if (!auth.ok) return auth;
  const mappingId = String(formData.get("mapping_id") ?? "");
  if (!isUuid(mappingId)) return { ok: false, message: "Choisissez une correspondance d'import." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Aucun fichier sélectionné." };
  const apply = formData.get("apply") === "1";

  const supabase = await createClient();
  const { data: mapping } = await supabase.from("country_connect_mappings").select("*").eq("id", mappingId).maybeSingle();
  if (!mapping || mapping.direction !== "import") return { ok: false, message: "Correspondance d'import introuvable." };
  const parsed = await parseImportFile(file);
  if (!parsed.ok) return parsed;

  const columns = (mapping as unknown as CcMapping).columns.filter((c) => c.field !== "ignore");
  const byHeader = new Map(parsed.table.headers.map((h) => [normalizeHeader(h), h]));
  const missing = columns.filter((c) => !byHeader.has(normalizeHeader(c.header))).map((c) => c.header);
  if (missing.length > 0) {
    return { ok: false, message: `Colonne(s) absente(s) du fichier : ${missing.join(", ")}. Vérifiez la correspondance choisie.` };
  }
  const rows = parsed.table.rows.map((row, i) => {
    const out: Record<string, string | number> = { line: i + 2 };
    for (const c of columns) out[c.field] = row[byHeader.get(normalizeHeader(c.header)) as string] ?? "";
    return out;
  });

  const { data, error } = await supabase.rpc("country_connect_import", {
    p_org: auth.context.organization.id,
    p_mapping: mappingId,
    p_rows: rows,
    p_apply: apply,
    p_file_name: file.name.slice(0, 200),
  });
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Le fichier n'a pas pu être traité.") };
  const result = data as unknown as CcImportResult;
  refresh();
  if (apply) revalidatePath("/eleves");
  return {
    ok: true,
    data: result,
    message: apply
      ? `${result.updated} identifiant(s) enregistré(s), ${result.errors} ligne(s) en erreur.`
      : `Vérification : ${result.ok} ligne(s) valide(s), ${result.errors} erreur(s). Rien n'a été modifié.`,
  };
}

/** Saisie manuelle de l'identifiant national d'un élève (format contrôlé en base). */
export async function setNationalId(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("students.update");
  if (!auth.ok) return auth;
  const studentId = String(formData.get("student_id") ?? "");
  if (!isUuid(studentId)) return { ok: false, message: "Élève introuvable." };
  const value = String(formData.get("national_id") ?? "").trim();
  if (value.length < 2 || value.length > 60) return { ok: false, message: "Identifiant invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .update({ national_id: value })
    .eq("id", studentId)
    .eq("organization_id", auth.context.organization.id)
    .is("national_id", null)
    .select("id, last_name, first_name");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const student = data?.[0];
  if (!student) return { ok: false, message: "Élève introuvable ou identifiant déjà renseigné (modifiez-le depuis sa fiche)." };
  await supabase.rpc("log_event", {
    p_action: "student.national_id_set",
    p_organization_id: auth.context.organization.id,
    p_entity_type: "students",
    p_entity_id: studentId,
    p_summary: `Identifiant national saisi pour ${student.last_name} ${student.first_name}`,
  });
  refresh();
  return { ok: true, message: "Identifiant national enregistré." };
}
