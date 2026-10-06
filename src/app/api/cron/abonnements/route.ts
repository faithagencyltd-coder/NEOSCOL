import { cronUnauthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cycle de vie quotidien des abonnements NeoScool : fin d'essai (rappels J-7, J-3,
 * J-1, jour J), factures de renouvellement, impayés (PAST_DUE → GRACE_PERIOD →
 * RESTRICTED → EXPIRED), paiements abandonnés. À appeler chaque jour avec
 * « Authorization: Bearer <CRON_SECRET> ». L'accès est de toute façon calculé
 * sur les dates : un retard du planificateur ne prolonge jamais un accès.
 * Affiliation : commissions validées dont le délai de vérification est écoulé → payables.
 * Tutor Match : suggestions de soutien (si activées par le Super Admin).
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request, "/api/cron/abonnements");
  if (denied) return denied;
  const admin = createAdminClient();
  if (!admin) return new Response("Configuration serveur incomplète.", { status: 500 });
  const { data, error } = await admin.rpc("billing_process_lifecycle");
  if (error) return Response.json({ ok: false, error: "Traitement impossible." }, { status: 500 });
  const { data: payable } = await admin.rpc("affiliate_promote_payable");
  const { data: suggestions } = await admin.rpc("tutor_generate_suggestions");
  return Response.json({ ok: true, result: data, affiliate_payable: payable ?? 0, tutor_suggestions: suggestions ?? 0 });
}
