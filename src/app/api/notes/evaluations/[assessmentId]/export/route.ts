import type { NextRequest } from "next/server";

import { getAssessmentSheet } from "@/features/grades/queries";
import { assessmentRows } from "@/features/grades/transfer";
import { toDelimitedCsv } from "@/features/migration/csv";
import { canAny, getSessionContext } from "@/lib/auth/session";
import { safeFileName } from "@/lib/pdf/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/write";

/**
 * Export des notes d'une évaluation (Excel .xlsx par défaut, ou CSV) : sert
 * aussi de modèle d'import. Lecture sous RLS (enseignant : ses classes). Journalisé.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/notes/evaluations/[assessmentId]/export">) {
  const { assessmentId } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!isUuid(assessmentId) || !canAny(context, ["grades.read", "grades.enter", "grades.manage"])) return new Response("Introuvable.", { status: 404 });
  const sheet = await getAssessmentSheet(context.organization.id, assessmentId);
  if (!sheet) return new Response("Introuvable.", { status: 404 });
  const { assessment, students } = sheet;
  const rows = assessmentRows(students, assessment.grades, Number(assessment.max_score));
  const base = safeFileName(`notes-${assessment.class?.name ?? "classe"}-${assessment.subject?.name ?? "matiere"}-${assessment.title}`);
  const supabase = await createClient();
  const csv = request.nextUrl.searchParams.get("format") === "csv";
  await supabase.rpc("log_event", {
    p_organization_id: context.organization.id,
    p_action: "grades.exported",
    p_entity_type: "assessments",
    p_entity_id: assessmentId,
    p_summary: `Export ${csv ? "CSV" : "Excel"} des notes : ${assessment.title}`,
  });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (csv) {
    // CSV « Excel français » : séparateur « ; », virgule décimale.
    const body = rows.slice(1).map((r) => r.map((v) => (v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v)));
    return new Response(toDelimitedCsv((rows[0] ?? []).map(String), body, ";"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
    });
  }
  const xlsx = buildXlsx([{ name: assessment.title, rows, widths: [16, 22, 22, 14, 10, 10, 40] }]);
  return new Response(new Uint8Array(xlsx), {
    headers: { ...headers, "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}
