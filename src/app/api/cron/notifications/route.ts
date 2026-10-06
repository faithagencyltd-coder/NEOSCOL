import { cronUnauthorized } from "@/lib/cron-auth";
import { processPushQueue } from "@/lib/push/server";

/**
 * Envoi des notifications push en attente. À appeler toutes les minutes par un
 * planificateur (Vercel Cron, Supabase pg_cron…) avec l'en-tête
 * « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request, "/api/cron/notifications");
  if (denied) return denied;
  let processed = 0;
  let sent = 0;
  // Jusqu'à 10 lots de 100 par appel.
  for (let i = 0; i < 10; i++) {
    const result = await processPushQueue(100);
    if (!result.ok) return Response.json(result, { status: 500 });
    processed += result.processed;
    sent += result.sent;
    if (result.processed < 100)
      return Response.json({ ...result, processed, sent });
  }
  return Response.json({ ok: true, processed, sent });
}
