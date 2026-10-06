import type { NextRequest } from "next/server";

import { toDelimitedCsv } from "@/features/migration/csv";
import { GROWTH_COLUMNS, monthLabel, type Growth } from "@/features/platform/growth";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Export CSV des séries mensuelles de croissance (Super Admin). */
export async function GET(request: NextRequest) {
  if (!(await getSessionContext())) return new Response("Session expirée.", { status: 401 });
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return new Response("Introuvable.", { status: 404 });
  const months = Number(request.nextUrl.searchParams.get("mois") ?? 12);
  const { data, error } = await supabase.rpc("platform_growth", { p_months: Number.isFinite(months) ? months : 12 });
  if (error || !data) return new Response("Analyse indisponible.", { status: 400 });
  const g = data as unknown as Growth;
  const currencies = Array.from(new Set(g.months.flatMap((m) => Object.keys(m.revenue)))).sort();
  const header = ["Mois", ...GROWTH_COLUMNS.map((c) => c.label), ...currencies.map((c) => `Revenus NeoScool (${c})`)];
  const rows = g.months.map((m) => [monthLabel(m.month), ...GROWTH_COLUMNS.map((c) => String(m[c.key])), ...currencies.map((c) => String(m.revenue[c] ?? 0))]);
  return new Response(toDelimitedCsv(header, rows, ";"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="neoscool-croissance-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
