import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cycle de vie quotidien des abonnements NéoScol : fin d'essai (rappels J-7, J-3,
 * J-1, jour J), factures de renouvellement, impayés (PAST_DUE → GRACE_PERIOD →
 * RESTRICTED → EXPIRED), paiements abandonnés. À appeler chaque jour avec
 * « Authorization: Bearer <CRON_SECRET> ». L'accès est de toute façon calculé
 * sur les dates : un retard du planificateur ne prolonge jamais un accès.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || provided.length !== secret.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return new Response("Non autorisé.", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Configuration serveur incomplète.", { status: 500 });
  const { data, error } = await admin.rpc("billing_process_lifecycle");
  if (error) return Response.json({ ok: false, error: "Traitement impossible." }, { status: 500 });
  return Response.json({ ok: true, result: data });
}
