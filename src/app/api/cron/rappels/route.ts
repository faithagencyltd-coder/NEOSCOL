import { processCampaignBatch } from "@/features/communication/campaigns";
import { cronUnauthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rappels automatiques d'échéance et d'impayé pour tous les établissements
 * actifs. À appeler chaque jour par un planificateur (Vercel Cron, Supabase
 * pg_cron…) avec l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 * Puis relances automatiques des impayés par SMS / e-mail / WhatsApp pour les
 * établissements qui les ont activées (centre d'envois).
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request, "/api/cron/rappels");
  if (denied) return denied;
  const admin = createAdminClient();
  if (!admin) return new Response("Configuration serveur incomplète.", { status: 500 });
  const { data: organizations } = await admin.from("organizations").select("id").eq("status", "active");
  const results: Record<string, unknown> = {};
  for (const org of organizations ?? []) {
    const { data, error } = await admin.rpc("send_invoice_reminders", { p_organization_id: org.id });
    results[org.id] = error ? { error: error.message } : data;
  }
  const automations: Record<string, unknown> = {};
  const { data: due } = await admin.rpc("due_communication_automations");
  for (const a of due ?? []) {
    const { data: campaignId, error } = await admin.rpc("create_message_campaign", {
      p_org: a.organization_id,
      p_template: a.template_id,
      p_name: `Relance automatique des impayés du ${new Date().toLocaleDateString("fr-FR")}`,
      p_audience: { kind: "unpaid" },
      p_source: "automation",
    });
    if (error || !campaignId) {
      automations[a.organization_id] = { skipped: error?.message ?? "aucun destinataire" };
      continue;
    }
    let sent = 0;
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 200; i++) {
      const outcome = await processCampaignBatch(campaignId, null, 50);
      if (!outcome.ok) break;
      sent += outcome.sent;
      if (outcome.pending === 0 || outcome.pending >= previous) break;
      previous = outcome.pending;
    }
    automations[a.organization_id] = { campaign: campaignId, sent };
  }
  return Response.json({ ok: true, results, automations });
}
