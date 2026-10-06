import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Usage des établissements : module de l'application consulté (premier segment
 * de l'adresse, ex. « eleves », « notes »). Établissement et utilisateur sont
 * lus dans la session côté serveur, jamais fournis par le navigateur. Aucun contenu.
 */
export async function POST(request: Request) {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const appModule = typeof body?.path === "string" ? body.path.split(/[?#]/)[0]!.split("/")[1] ?? "" : "";
  if (!/^[a-z0-9-]{1,40}$/.test(appModule)) return done;
  const context = await getSessionContext();
  if (!context?.organization) return done;
  const admin = createAdminClient();
  if (!admin) return done;
  await admin.rpc("record_app_usage", { p_org: context.organization.id, p_user: context.user.id, p_module: appModule });
  return done;
}
