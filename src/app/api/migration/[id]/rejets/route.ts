import type { NextRequest } from "next/server";

import { toImportCsv } from "@/features/migration/csv";
import { getImportBatch, listImportRows } from "@/features/migration/queries";
import { can, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Données rejetées ou à vérifier d'un import, au format du fichier d'origine
 * (+ n° de ligne et motifs) : l'établissement corrige puis réimporte.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/migration/[id]/rejets">) {
  const { id } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!can(context, "students.import")) return new Response("Accès refusé.", { status: 403 });
  if (!isUuid(id)) return new Response("Import introuvable.", { status: 404 });
  const batch = await getImportBatch(context.organization.id, id);
  if (!batch) return new Response("Import introuvable.", { status: 404 });
  const all = request.nextUrl.searchParams.get("tout") === "1";
  const rows: Awaited<ReturnType<typeof listImportRows>>["rows"] = [];
  for (let page = 1; page <= 100; page++) {
    const chunk = await listImportRows(context.organization.id, id, all ? "problems" : "rejected", page, 500);
    rows.push(...chunk.rows);
    if (chunk.rows.length < 500) break;
  }
  const supabase = await createClient();
  await supabase.rpc("log_event", {
    p_organization_id: context.organization.id,
    p_action: "migration.export_rejects",
    p_entity_type: "migration_batches",
    p_entity_id: id,
    p_summary: `Export des lignes ${all ? "à vérifier" : "rejetées"} : ${batch.file_name}`,
  });
  const csv = toImportCsv(
    ["Ligne", "Statut", "Motifs", ...batch.headers],
    rows.map((r) => [
      String(r.row_number),
      r.status === "invalid" || r.status === "rejected" ? "Rejetée" : r.status === "skipped" || r.resolution === "skip" ? "Ignorée" : "À vérifier",
      r.issues.map((i) => i.message).join(" | "),
      ...batch.headers.map((h) => r.data[h] ?? ""),
    ]),
  );
  const base = batch.file_name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${all ? "a-verifier" : "rejets"}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
