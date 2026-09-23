import type { NextRequest } from "next/server";

import { getReportSection } from "@/features/reports/queries";
import { isReportSection, REPORT_SECTIONS, toCsv } from "@/features/reports/sections";
import { can, getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Export CSV d'une section de rapport (reports.export ; reports.finance pour les finances). Journalisé. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/rapports/[section]">) {
  const { section } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!isReportSection(section)) return new Response("Rapport introuvable.", { status: 404 });
  const supabase = await createClient();
  const allowed = can(context, "reports.export") && (section !== "finances" || can(context, "reports.finance"));
  if (!allowed) {
    await supabase.rpc("log_event", {
      p_organization_id: context.organization.id,
      p_action: "export.denied",
      p_summary: `Export refusé : rapport ${section}`,
      p_result: "denied",
    });
    return new Response("Vous n'avez pas l'autorisation d'exporter ce rapport.", { status: 403 });
  }
  const data = await getReportSection(context.organization.id, section);
  if (!data) return new Response("Rapport indisponible.", { status: 403 });
  await supabase.rpc("log_event", {
    p_organization_id: context.organization.id,
    p_action: "export.report",
    p_summary: `Export CSV : ${REPORT_SECTIONS[section].title}`,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(REPORT_SECTIONS[section].columns, data.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="neoscol-${section}-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
