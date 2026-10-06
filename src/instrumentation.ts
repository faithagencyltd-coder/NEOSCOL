/**
 * Au démarrage du serveur : enregistre la version réellement mise en service
 * (Super Admin › Maintenance › Versions). Sans effet si la clé de service
 * n'est pas configurée ; une erreur n'empêche jamais le démarrage.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    if (!admin) return;
    await admin.rpc("record_release", {
      p_version: process.env.APP_VERSION ?? "0.0.0",
      p_commit: process.env.APP_COMMIT ?? "",
      p_built_at: process.env.APP_BUILT_AT ?? new Date().toISOString(),
    });
  } catch {
    // Mesure facultative.
  }
}
