import "server-only";

import type { Client } from "./server";
import type { CreditSummary } from "./types";

/** Seuil de validation d'une matière (sur 20) : organizations.settings.grading.credit_threshold, 10 par défaut. */
export async function creditThreshold(supabase: Client, organizationId: string): Promise<number> {
  const { data } = await supabase.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const grading = ((data?.settings ?? {}) as { grading?: { credit_threshold?: unknown } }).grading;
  const value = Number(grading?.credit_threshold);
  return Number.isFinite(value) && value > 0 && value <= 20 ? value : 10;
}

/** Crédits par matière pour chaque classe : Map<classe, Map<nom de matière, crédits>>. */
export async function subjectCredits(supabase: Client, classIds: string[]): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (!classIds.length) return result;
  const { data } = await supabase.from("class_subjects").select("class_id, subject:subjects(name, credits)").in("class_id", classIds);
  for (const row of data ?? []) {
    const credits = Number(row.subject?.credits ?? 0);
    if (!row.subject || !(credits > 0)) continue;
    const map = result.get(row.class_id) ?? new Map<string, number>();
    map.set(row.subject.name, credits);
    result.set(row.class_id, map);
  }
  return result;
}

/** Total et crédits acquis (moyenne ≥ seuil) ; null si aucune matière ne porte de crédits. */
export function summarizeCredits(rows: { credits?: number | null; average: number | null }[], threshold: number): CreditSummary | null {
  const withCredits = rows.filter((r) => (r.credits ?? 0) > 0);
  if (!withCredits.length) return null;
  const total = withCredits.reduce((s, r) => s + (r.credits ?? 0), 0);
  const earned = withCredits.reduce((s, r) => s + (r.average !== null && r.average >= threshold ? (r.credits ?? 0) : 0), 0);
  return { threshold, earned, total };
}
