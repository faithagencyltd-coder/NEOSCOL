"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import type { AcademicRules, RuleResult } from "./types";

/**
 * Moteur académique : toutes les vérifications (droits, validité des règles,
 * formules sûres, gel des résultats validés) sont faites EN BASE ; ces actions
 * ne font que relayer les demandes.
 */
const refresh = () => {
  revalidatePath("/parametres/regles-academiques");
  revalidatePath("/plateforme/regles");
  revalidatePath("/resultats-annuels");
};

function parseRules(raw: FormDataEntryValue | null): AcademicRules | null {
  try {
    const rules = JSON.parse(String(raw ?? "")) as AcademicRules;
    return rules && typeof rules === "object" ? rules : null;
  } catch {
    return null;
  }
}

/** Nouvelle version en brouillon (établissement actif, ou modèle pays pour le Super Admin). */
export async function saveRuleDraft(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const scope = String(formData.get("scope") ?? "organization");
  const rules = parseRules(formData.get("rules"));
  if (!rules) return { ok: false, message: "Règles illisibles." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, message: "Donnez un nom aux règles." };
  const supabase = await createClient();
  let org: string | null = null;
  let country: string | null = null;
  if (scope === "country") {
    country = String(formData.get("country") ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return { ok: false, message: "Pays invalide." };
  } else {
    const auth = await authorize("academic.manage");
    if (!auth.ok) return auth;
    org = auth.context.organization.id;
  }
  const { data, error } = await supabase.rpc("save_academic_rule_draft", {
    p_org: org as string,
    p_country: country as string,
    p_education_type: "school",
    p_name: name,
    p_rules: rules,
    p_notes: String(formData.get("notes") ?? "").slice(0, 1000),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Brouillon enregistré. Publiez-le pour l'appliquer.", data: { id: data as string } };
}

export async function publishRuleSet(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Version introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_academic_rule_set", { p_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Règles publiées : elles s'appliquent aux prochains calculs. Les résultats déjà validés ne changent pas." };
}

export async function deleteRuleDraft(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Brouillon introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_academic_rule_draft", { p_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Brouillon supprimé." };
}

export async function adoptTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("template_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Modèle introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adopt_academic_template", { p_org: auth.context.organization.id, p_template: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Modèle du pays copié en brouillon : adaptez-le puis publiez-le." };
}

/** Essai des règles sur des moyennes saisies (éditeur) — calcul fait en base. */
export async function tryRules(rules: AcademicRules, values: (number | null)[]): Promise<RuleResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("try_academic_rules", { p_rules: rules, p_values: values as number[] });
  if (error) return { average: null, complete: false, passed: false, mention: null, decision_code: null, decision_label: null, error: dbErrorMessage(error) };
  return data as unknown as RuleResult;
}

export type SimulationRow = { student_id: string; student_name: string; inputs: { period: string; variable: string; average: number | null }[]; current_result: RuleResult; simulated_result: RuleResult };

export async function simulateRules(classId: string, rules: AcademicRules): Promise<{ ok: true; rows: SimulationRow[] } | { ok: false; message: string }> {
  if (!isUuid(classId)) return { ok: false, message: "Choisissez une classe." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("simulate_academic_rules", { p_class_id: classId, p_rules: rules });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, rows: (data ?? []) as unknown as SimulationRow[] };
}

export async function computeAnnualResults(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(classId)) return { ok: false, message: "Classe introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compute_annual_results", { p_class_id: classId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `${data ?? 0} résultat(s) annuel(s) calculé(s).` };
}

export async function setAnnualDecision(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("result_id") ?? "");
  const code = String(formData.get("decision") ?? "");
  if (!isUuid(id) || !/^[a-z_]{2,30}$/.test(code)) return { ok: false, message: "Décision invalide." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_annual_decision", { p_result: id, p_code: code, p_reason: String(formData.get("reason") ?? "").slice(0, 500) });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Décision enregistrée." };
}

export async function validateAnnualResults(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const classId = String(formData.get("class_id") ?? "");
  if (!isUuid(classId)) return { ok: false, message: "Classe introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_annual_results", { p_class_id: classId });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: `${data ?? 0} résultat(s) validé(s) : ils sont désormais figés avec les règles utilisées.` };
}
