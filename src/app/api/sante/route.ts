import { createClient } from "@/lib/supabase/server";

/**
 * Sonde de disponibilité publique, pour un service de surveillance externe
 * (vérification toutes les quelques minutes, alerte en cas de panne).
 * Répond seulement : l'application et la base répondent-elles, et en combien
 * de temps. Aucune donnée, aucune configuration.
 */
export async function GET() {
  const started = Date.now();
  let database = "ok";
  try {
    const { error } = await (await createClient()).rpc("health_ping");
    if (error) database = "erreur";
  } catch {
    database = "erreur";
  }
  const ok = database === "ok";
  return Response.json(
    { status: ok ? "ok" : "degrade", database, response_ms: Date.now() - started, checked_at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
