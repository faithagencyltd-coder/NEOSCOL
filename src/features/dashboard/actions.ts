"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";

import { DASHBOARD_BLOCKS } from "./blocks";

/** Blocs affichés sur le tableau de bord de l'utilisateur (établissement actif). */
export async function saveDashboardPreferences(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context?.organization)
    return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const offered = String(formData.get("offered") ?? "").split(",");
  const hidden = DASHBOARD_BLOCKS.filter(
    (b) => offered.includes(b.key) && formData.get(`show_${b.key}`) !== "on",
  ).map((b) => b.key);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_dashboard_preferences", {
    p_org: context.organization.id,
    p_hidden: hidden,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/tableau-de-bord");
  return {
    ok: true,
    message: hidden.length
      ? `Tableau de bord personnalisé : ${hidden.length} bloc(s) masqué(s).`
      : "Tous les blocs sont affichés.",
  };
}
