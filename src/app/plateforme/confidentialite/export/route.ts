import { getPlatformRole } from "@/lib/auth/platform";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeFileName } from "@/lib/pdf/format";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Export des données d'un établissement (JSON) : propriétaires de la plateforme
 * seulement, motif obligatoire, journalisé par la base avant toute lecture.
 * Les colonnes secrètes sont exclues par la base elle-même.
 */
export async function POST(request: Request) {
  if (!(await getSessionContext())) return new Response("Session expirée.", { status: 401 });
  if ((await getPlatformRole()) !== "owner") return new Response("Réservé aux propriétaires de la plateforme.", { status: 403 });
  const form = await request.formData();
  const org = String(form.get("organization_id") ?? "");
  if (!isUuid(org)) return new Response("Établissement introuvable.", { status: 400 });
  const supabase = await createClient();
  const { data: tables, error } = await supabase.rpc("platform_begin_org_export", { p_org: org, p_reason: String(form.get("reason") ?? "") });
  if (error || !tables) return new Response(error?.message ?? "Export refusé.", { status: 400 });
  const admin = createAdminClient();
  if (!admin) return new Response("Configuration serveur incomplète.", { status: 500 });
  const { data: organization } = await admin.from("organizations").select("*").eq("id", org).maybeSingle();
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), organization_id: org, tables: {} as Record<string, unknown[]> };
  for (const [table, columns] of Object.entries(tables as Record<string, string[]>).sort()) {
    const { data } = await (admin.from as unknown as (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { limit: (n: number) => Promise<{ data: unknown[] | null }> } } })(table)
      .select(columns.join(","))
      .eq("organization_id", org)
      .limit(50000);
    if (data?.length) (out.tables as Record<string, unknown[]>)[table] = data;
  }
  const name = safeFileName(`export-${(organization as { code?: string } | null)?.code ?? "etablissement"}-${new Date().toISOString().slice(0, 10)}`);
  return new Response(JSON.stringify(out, null, 1), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"`, "Cache-Control": "no-store" },
  });
}
