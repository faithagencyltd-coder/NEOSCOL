import { cronUnauthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tâche quotidienne : suppression des données Analytics plus anciennes que la
 * durée de conservation (Console › Analytics › Réglages). Appelée par Vercel
 * Cron avec « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: Request) {
  const denied = cronUnauthorized(request, "/api/cron/analytics");
  if (denied) return denied;
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Configuration serveur incomplète." }, { status: 500 });
  const { data, error } = await admin.rpc("analytics_purge");
  if (error) return Response.json({ error: "Purge impossible." }, { status: 500 });
  return Response.json({ ok: true, purged: data });
}
