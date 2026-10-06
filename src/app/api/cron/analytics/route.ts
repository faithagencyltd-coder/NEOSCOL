import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tâche quotidienne : suppression des données Analytics plus anciennes que la
 * durée de conservation (Console › Analytics › Réglages). Appelée par Vercel
 * Cron avec « Authorization: Bearer <CRON_SECRET> ».
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || provided !== secret) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Configuration serveur incomplète." }, { status: 500 });
  const { data, error } = await admin.rpc("analytics_purge");
  if (error) return Response.json({ error: "Purge impossible." }, { status: 500 });
  return Response.json({ ok: true, purged: data });
}
