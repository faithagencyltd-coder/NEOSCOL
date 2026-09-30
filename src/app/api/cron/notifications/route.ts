import { timingSafeEqual } from "node:crypto";

import { processPushQueue } from "@/lib/push/server";

/**
 * Envoi des notifications push en attente. À appeler toutes les minutes par un
 * planificateur (Vercel Cron, Supabase pg_cron…) avec l'en-tête
 * « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (
    !secret ||
    provided.length !== secret.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  ) {
    return new Response("Non autorisé.", { status: 401 });
  }
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
