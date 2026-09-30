"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth/session";
import { sendEmail } from "@/lib/messaging/server";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { isUuid } from "@/lib/utils/search-params";

import { ANNOUNCEMENT_TONES, CAMPAIGN_STATUSES, campaignEmailHtml, checkedValues, MODULES } from "./communication";

async function requirePlatformAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data ? { ok: true, userId: context.user.id } : { ok: false, message: "Réservé à l'administration de la plateforme NeoScool." };
}

const dateTimeOrNull = (value: FormDataEntryValue | null, endOfDay = false) => {
  const v = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}Z`).toISOString();
};

/** Annonce (bandeau) affichée dans l'application des établissements. */
export async function saveAnnouncement(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const id = String(formData.get("id") ?? "");
  const tone = String(formData.get("tone") ?? "info");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_save_announcement", {
    p_id: isUuid(id) ? id : (null as never),
    p_title: String(formData.get("title") ?? ""),
    p_body: String(formData.get("body") ?? ""),
    p_tone: ANNOUNCEMENT_TONES.some((t) => t.value === tone) ? tone : "info",
    p_modules: checkedValues(formData, "module", MODULES),
    p_audience: formData.get("audience") === "direction" ? "direction" : "staff",
    p_link_url: String(formData.get("link_url") ?? ""),
    p_link_label: String(formData.get("link_label") ?? ""),
    p_starts_at: dateTimeOrNull(formData.get("starts_on")) ?? (null as never),
    p_ends_at: dateTimeOrNull(formData.get("ends_on"), true) ?? (null as never),
    p_is_active: formData.get("is_active") === "on",
    p_dismissible: formData.get("dismissible") === "on",
    p_notify: formData.get("notify") === "on",
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plateforme/communication");
  const notified = Number((data as { notified?: number } | null)?.notified ?? 0);
  return { ok: true, message: notified ? `Annonce enregistrée ; ${notified} personne(s) notifiée(s).` : "Annonce enregistrée." };
}

export type CampaignPreview = { organizations: number; recipients: number; with_email: number } | null;

function campaignFilters(formData: FormData) {
  return {
    modules: checkedValues(formData, "module", MODULES),
    statuses: checkedValues(formData, "status", CAMPAIGN_STATUSES),
    includeDemo: formData.get("include_demo") === "on",
  };
}

/** Nombre d'établissements et de destinataires correspondant aux filtres. */
export async function previewCampaign(formData: FormData): Promise<CampaignPreview> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return null;
  const f = campaignFilters(formData);
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_campaign_preview", { p_modules: f.modules, p_statuses: f.statuses, p_include_demo: f.includeDemo });
  return (data as CampaignPreview) ?? null;
}

type CampaignStart = { id: string; organizations: number; recipients: number; in_app: number; emails: { email: string; name: string | null; organization_name: string }[] };

/**
 * Envoi groupé aux directions : notifications tout de suite (base), puis
 * e-mails réels via l'intégration e-mail configurée. Sans intégration, aucun
 * e-mail n'est prétendu envoyé : le résultat l'indique.
 */
export async function startCampaign(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const f = campaignFilters(formData);
  const channels = [formData.get("channel_in_app") === "on" ? "in_app" : null, formData.get("channel_email") === "on" ? "email" : null].filter(Boolean) as string[];
  if (!channels.length) return { ok: false, message: "Choisissez au moins un canal (notification ou e-mail)." };
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_start_campaign", {
    p_subject: subject,
    p_body: body,
    p_modules: f.modules,
    p_statuses: f.statuses,
    p_channels: channels,
    p_include_demo: f.includeDemo,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const start = data as unknown as CampaignStart;

  let sent = 0;
  let failed = 0;
  let notConfigured = 0;
  if (channels.includes("email")) {
    for (const [index, r] of start.emails.entries()) {
      const result = await sendEmail(
        { to: r.email, subject, html: campaignEmailHtml(subject, body, r.name, r.organization_name), text: body },
        { purpose: "platform_campaign", userId: auth.userId },
      );
      if (result.ok) sent++;
      else if (result.status === "not_configured") {
        // Intégration absente : inutile d'essayer les suivants.
        notConfigured += start.emails.length - index;
        break;
      } else failed++;
    }
    const { error: finishError } = await supabase.rpc("platform_finish_campaign", { p_id: start.id, p_sent: sent, p_failed: failed, p_not_configured: notConfigured });
    if (finishError) return { ok: false, message: dbErrorMessage(finishError) };
  }
  revalidatePath("/plateforme/communication");
  const parts = [`${start.recipients} destinataire(s) dans ${start.organizations} établissement(s)`];
  if (channels.includes("in_app")) parts.push(`${start.in_app} notification(s) envoyée(s)`);
  if (channels.includes("email")) {
    parts.push(`${sent} e-mail(s) envoyé(s)`);
    if (failed) parts.push(`${failed} échec(s)`);
    if (notConfigured) parts.push("e-mail non configuré : activez l'envoi d'e-mails dans Intégrations");
  }
  return { ok: !notConfigured || channels.includes("in_app"), message: `Envoi terminé : ${parts.join(" · ")}.` };
}
