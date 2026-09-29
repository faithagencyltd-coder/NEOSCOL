import type { NextRequest } from "next/server";

import { DELIMITERS, formatCcDate, type CcMapping } from "@/features/country-connect/types";
import { toDelimitedCsv } from "@/features/migration/csv";
import { canAny, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/**
 * Export Country Connect : fichier au format attendu par le système national
 * (colonnes, séparateur, format de date de la correspondance). Les lignes
 * viennent de la base (droits + journal vérifiés par country_connect_export).
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/country-connect/export/[id]">) {
  const { id } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!canAny(context, ["students.import", "settings.manage"])) return new Response("Accès refusé.", { status: 403 });
  if (!isUuid(id)) return new Response("Correspondance introuvable.", { status: 404 });

  const supabase = await createClient();
  const { data: mapping } = await supabase.from("country_connect_mappings").select("*").eq("id", id).maybeSingle();
  if (!mapping) return new Response("Correspondance introuvable.", { status: 404 });
  const { data, error } = await supabase.rpc("country_connect_export", { p_org: context.organization.id, p_mapping: id });
  if (error) return new Response(error.message, { status: 400 });

  const m = mapping as unknown as CcMapping;
  const columns = m.columns.filter((c) => c.field !== "ignore");
  const rows = (data ?? []).map(({ row_data }) => {
    const r = row_data as Record<string, string | null>;
    return columns.map((c) => (c.field === "birth_date" ? formatCcDate(r.birth_date, m.date_format) : String(r[c.field] ?? "")));
  });
  const csv = toDelimitedCsv(
    columns.map((c) => c.header),
    rows,
    DELIMITERS[m.delimiter],
  );
  const slug = m.name
    .normalize("NFD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="country-connect-${slug || "export"}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
