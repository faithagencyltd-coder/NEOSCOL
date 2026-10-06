"use server";

import { revalidatePath } from "next/cache";

import { canWritePlatform, getPlatformRole, platformDeniedMessage } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

/** Assistance : chaque droit est revérifié par la base (établissement, auteur, plateforme). */

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createSupportTicket(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const context = await getSessionContext();
  if (!context?.organization) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const { error } = await (await createClient()).rpc("create_support_ticket", {
    p_org: context.organization.id,
    p_category: text(formData, "category"),
    p_severity: text(formData, "severity") || "medium",
    p_title: text(formData, "title"),
    p_description: text(formData, "description"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/assistance");
  return { ok: true, message: "Demande envoyée à l'équipe NeoScool. Vous serez prévenu de la réponse." };
}

export async function addSupportMessage(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const ticket = text(formData, "ticket_id");
  if (!isUuid(ticket)) return { ok: false, message: "Demande introuvable." };
  const { error } = await (await createClient()).rpc("add_support_message", {
    p_ticket: ticket,
    p_body: text(formData, "body"),
    p_internal: formData.get("internal") === "on" || formData.get("internal") === "true",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/assistance");
  revalidatePath(`/plateforme/incidents/${ticket}`);
  return { ok: true, message: "Message envoyé." };
}

async function platformWriter(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await getSessionContext())) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const role = await getPlatformRole();
  return canWritePlatform(role) ? { ok: true } : { ok: false, message: platformDeniedMessage(role) };
}

export async function updateSupportTicket(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await platformWriter();
  if (!auth.ok) return auth;
  const ticket = text(formData, "ticket_id");
  if (!isUuid(ticket)) return { ok: false, message: "Demande introuvable." };
  const { error } = await (await createClient()).rpc("platform_update_ticket", {
    p_ticket: ticket,
    p_status: text(formData, "status"),
    p_severity: text(formData, "severity"),
    p_assign_me: formData.get("assign_me") === "on" || formData.get("assign_me") === "true",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/plateforme/incidents/${ticket}`);
  revalidatePath("/plateforme/incidents");
  return { ok: true, message: "Demande mise à jour." };
}

export async function createPlatformIncident(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await platformWriter();
  if (!auth.ok) return auth;
  const org = text(formData, "organization_id");
  const { error } = await (await createClient()).rpc("platform_create_incident", {
    p_org: (isUuid(org) ? org : null) as string,
    p_category: text(formData, "category"),
    p_severity: text(formData, "severity"),
    p_title: text(formData, "title"),
    p_description: text(formData, "description"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/incidents");
  return { ok: true, message: "Incident enregistré." };
}
