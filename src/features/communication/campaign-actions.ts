"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import { processCampaignBatch } from "./campaigns";

/**
 * Centre d'envois : droits, public, contacts, quotas et journal sont vérifiés
 * EN BASE et par le serveur ; le navigateur n'envoie que des identifiants.
 */
const refresh = () => revalidatePath("/communication/envois");

export type AudiencePreview = { total: number; reachable: number; sample: { name: string; contact: string; variables: Record<string, string> }[] };

function audienceFrom(formData: FormData) {
  const kind = String(formData.get("audience") ?? "guardians");
  return { kind, class_ids: kind === "classes" ? formData.getAll("class_ids").map(String).filter(isUuid) : [] };
}

export async function saveMessageTemplate(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const channel = String(formData.get("channel") ?? "sms");
  const waTemplate = String(formData.get("whatsapp_template_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_message_template", {
    p_org: auth.context.organization.id,
    p_id: (isUuid(id) ? id : null) as string,
    p_name: String(formData.get("name") ?? ""),
    p_channel: channel,
    p_subject: String(formData.get("subject") ?? ""),
    p_body: String(formData.get("body") ?? ""),
    p_whatsapp_template: (isUuid(waTemplate) ? waTemplate : null) as string,
    p_whatsapp_variables: String(formData.get("whatsapp_variables") ?? "")
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean),
    p_active: formData.get("is_active") === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Modèle enregistré." };
}

export async function previewAudience(formData: FormData): Promise<ActionResult<AudiencePreview>> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_message_audience", {
    p_org: auth.context.organization.id,
    p_audience: audienceFrom(formData),
    p_channel: String(formData.get("channel") ?? "sms"),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, data: data as unknown as AudiencePreview };
}

/** Prépare l'envoi (destinataires figés en base) ; l'envoi suit par lots. */
export async function createCampaign(formData: FormData): Promise<ActionResult<{ id: string; total: number }>> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const template = String(formData.get("template_id") ?? "");
  if (!isUuid(template)) return { ok: false, message: "Choisissez un modèle de message." };
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_message_campaign", {
    p_org: auth.context.organization.id,
    p_template: template,
    p_name: String(formData.get("name") ?? ""),
    p_audience: audienceFrom(formData),
  });
  if (error || !id) return { ok: false, message: dbErrorMessage(error, "L'envoi n'a pas pu être préparé.") };
  const { data: c } = await supabase.from("message_campaigns").select("total").eq("id", id).single();
  return { ok: true, data: { id, total: c?.total ?? 0 } };
}

/** Envoie le lot suivant d'un envoi de l'établissement actif. */
export async function sendCampaignBatch(campaignId: string): Promise<ActionResult<{ pending: number; sent: number }>> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  if (!isUuid(campaignId)) return { ok: false, message: "Envoi introuvable." };
  const supabase = await createClient();
  // Lecture sous RLS : l'envoi doit appartenir à l'établissement actif de l'utilisateur.
  const { data: campaign } = await supabase.from("message_campaigns").select("id").eq("id", campaignId).eq("organization_id", auth.context.organization.id).maybeSingle();
  if (!campaign) return { ok: false, message: "Envoi introuvable." };
  const outcome = await processCampaignBatch(campaignId, auth.context.user.id);
  if (!outcome.ok) return outcome;
  if (outcome.pending === 0) refresh();
  return { ok: true, data: { pending: outcome.pending, sent: outcome.sent } };
}

export async function cancelCampaign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const id = String(formData.get("campaign_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Envoi introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_message_campaign", { p_campaign: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Envoi arrêté : les destinataires restants ne seront pas contactés." };
}

export async function saveAutomation(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("communication.send");
  if (!auth.ok) return auth;
  const template = String(formData.get("template_id") ?? "");
  const enabled = formData.get("enabled") === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_communication_automation", {
    p_org: auth.context.organization.id,
    p_kind: "invoice_overdue",
    p_template: (isUuid(template) ? template : null) as string,
    p_enabled: enabled,
    p_interval: Math.min(60, Math.max(1, Number(formData.get("interval_days") ?? 7) || 7)),
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: enabled ? "Relance automatique des impayés activée." : "Relance automatique désactivée." };
}
