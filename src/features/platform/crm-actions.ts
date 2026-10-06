"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Suivi commercial d'une demande du site (statut, responsable, prochaine action, échange). */
export async function updateCrmLead(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  if (!canWritePlatform(role)) return { ok: false, message: platformDeniedMessage(role) };
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Demande introuvable." };
  const org = String(formData.get("organization_id") ?? "");
  const date = String(formData.get("next_action_at") ?? "");
  const { error } = await (await createClient()).rpc("platform_crm_update_lead", {
    p_id: id,
    p_status: String(formData.get("status") ?? ""),
    p_assign_me: formData.get("assign_me") === "on" || formData.get("assign_me") === "true",
    p_next_action: String(formData.get("next_action") ?? ""),
    p_next_action_at: (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null) as string,
    p_organization: (isUuid(org) ? org : null) as string,
    p_event_kind: String(formData.get("event_kind") ?? "note"),
    p_event_body: String(formData.get("event_body") ?? ""),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/commercial");
  revalidatePath("/plateforme/site-web");
  return { ok: true, message: "Suivi enregistré." };
}
