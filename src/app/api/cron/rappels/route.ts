import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rappels automatiques d'échéance et d'impayé pour tous les établissements
 * actifs. À appeler chaque jour par un planificateur (Vercel Cron, Supabase
 * pg_cron…) avec l'en-tête « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return new Response("Non autorisé.", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Configuration serveur incomplète.", { status: 500 });
  const { data: organizations } = await admin.from("organizations").select("id").eq("status", "active");
  const results: Record<string, unknown> = {};
  for (const org of organizations ?? []) {
    const { data, error } = await admin.rpc("send_invoice_reminders", { p_organization_id: org.id });
    results[org.id] = error ? { error: error.message } : data;
  }
  return Response.json({ ok: true, results });
}
