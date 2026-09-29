import "server-only";

import { sendEmail, sendSms, sendWhatsApp, type SendResult } from "@/lib/messaging/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { renderEmailHtml, renderText } from "./render";

export type BatchOutcome = { ok: true; pending: number; sent: number } | { ok: false; message: string };

/**
 * Envoie un lot de destinataires d'un envoi groupé (clé de service, côté
 * serveur uniquement). Les contacts sont relus en base au moment de l'envoi ;
 * quotas et journal par les fournisseurs de la plateforme (P3). Sans
 * fournisseur actif, le destinataire est marqué « non configuré » : aucun
 * envoi n'est simulé.
 */
export async function processCampaignBatch(campaignId: string, userId: string | null, size = 25): Promise<BatchOutcome> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Configuration serveur incomplète." };
  const { data: campaign } = await admin
    .from("message_campaigns")
    .select("id, organization_id, channel, subject, body, whatsapp_template_name, whatsapp_language, whatsapp_variables, status, organization:organizations(name)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, message: "Envoi introuvable." };
  if (campaign.status === "done" || campaign.status === "cancelled") return { ok: true, pending: 0, sent: 0 };
  const { data: batch, error } = await admin.rpc("message_campaign_batch", { p_campaign: campaignId, p_limit: size });
  if (error) return { ok: false, message: "Lot introuvable." };
  const orgName = (campaign.organization as unknown as { name: string } | null)?.name ?? "Établissement";
  const ctx = { organizationId: campaign.organization_id, purpose: "campaign", userId };

  const results: { id: string; status: string; error: string | null }[] = [];
  const queue = [...(batch ?? [])];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const vars = (item.variables ?? {}) as Record<string, unknown>;
      let result: SendResult;
      if (!item.contact) {
        results.push({ id: item.recipient_id, status: "no_contact", error: null });
        continue;
      }
      if (campaign.channel === "email") {
        result = await sendEmail(
          { to: item.contact, subject: renderText(campaign.subject ?? "", vars), html: renderEmailHtml(campaign.body, vars, orgName), text: renderText(campaign.body, vars) },
          ctx,
        );
      } else if (campaign.channel === "sms") {
        result = await sendSms({ to: item.contact, text: renderText(campaign.body, vars) }, ctx);
      } else {
        result = await sendWhatsApp(
          {
            to: item.contact,
            template: campaign.whatsapp_template_name ?? "",
            language: campaign.whatsapp_language ?? "fr",
            variables: (campaign.whatsapp_variables ?? []).map((k) => String(vars[k] ?? "")),
          },
          ctx,
        );
      }
      results.push(result.ok ? { id: item.recipient_id, status: "sent", error: null } : { id: item.recipient_id, status: result.status, error: result.error });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const { data: recorded, error: recordError } = await admin.rpc("message_campaign_record", { p_campaign: campaignId, p_results: results });
  if (recordError) return { ok: false, message: "Résultats non enregistrés." };
  return { ok: true, pending: (recorded as { pending: number }).pending, sent: results.filter((r) => r.status === "sent").length };
}
