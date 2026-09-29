"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Passage d'année : droits, cohérence des classes et des années, doublons et
 * journal sont vérifiés EN BASE ; ces actions relaient les demandes.
 */
const refresh = () => {
  revalidatePath("/passage-annee");
  revalidatePath("/inscriptions");
  revalidatePath("/structure");
};

export async function prepareNextYear(): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_next_academic_year", { p_org: auth.context.organization.id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { year_name: string; created_year: boolean; classes: number; periods: number; rates: number };
  refresh();
  return {
    ok: true,
    message: `Année ${r.year_name} ${r.created_year ? "créée" : "déjà prête"} : ${r.classes} classe(s), ${r.periods} période(s), ${r.rates} tarif(s) ajoutés.`,
  };
}

export async function createReenrollments(items: { student_id: string; class_id: string }[]): Promise<ActionResult<{ created: number; skipped: number }>> {
  const auth = await authorize("enrollments.manage");
  if (!auth.ok) return auth;
  const clean = items.filter((i) => isUuid(i.student_id) && isUuid(i.class_id)).slice(0, 5000);
  if (clean.length === 0) return { ok: false, message: "Sélectionnez au moins un élève avec une classe cible." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_reenrollments", { p_org: auth.context.organization.id, p_items: clean });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { created: number; skipped: unknown[]; year_name: string };
  refresh();
  return {
    ok: true,
    data: { created: r.created, skipped: r.skipped.length },
    message: `${r.created} réinscription(s) créée(s) pour ${r.year_name} (en attente de validation)${r.skipped.length ? `, ${r.skipped.length} ignorée(s)` : ""}.`,
  };
}

export async function closeYear(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("academic.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_academic_year", {
    p_org: auth.context.organization.id,
    p_mark_graduates: formData.get("mark_graduates") === "true",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { closed: string; current: string; graduates: number };
  revalidatePath("/", "layout");
  return { ok: true, message: `Année ${r.closed} clôturée : ${r.current} est désormais l'année en cours${r.graduates ? ` (${r.graduates} ancien(s) élève(s))` : ""}.` };
}
