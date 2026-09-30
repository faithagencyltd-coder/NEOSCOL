import type { NextRequest } from "next/server";

import { getGradeBook } from "@/features/grades/queries";
import { toDelimitedCsv } from "@/features/migration/csv";
import { canAny, getSessionContext } from "@/lib/auth/session";
import { safeFileName } from "@/lib/pdf/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx/write";

/**
 * Carnet de notes d'une matière dans une classe : une ligne par élève, une
 * colonne par évaluation, moyenne pondérée sur 20. Excel (.xlsx) ou CSV.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/notes/carnets/[classSubjectId]/export">) {
  const { classSubjectId } = await ctx.params;
  const context = await getSessionContext();
  if (!context?.organization) return new Response("Session expirée.", { status: 401 });
  if (!isUuid(classSubjectId) || !canAny(context, ["grades.read", "grades.enter", "grades.manage"])) return new Response("Introuvable.", { status: 404 });
  const book = await getGradeBook(context.organization.id, classSubjectId);
  if (!book?.class) return new Response("Introuvable.", { status: 404 });
  const supabase = await createClient();
  const [{ data: enrollments }, { data: grades }] = await Promise.all([
    supabase.from("enrollments").select("student:students(id, first_name, last_name, matricule)").eq("class_id", book.class.id).eq("status", "validated"),
    supabase
      .from("grades")
      .select("assessment_id, student_id, score, is_absent, is_exempt")
      .in("assessment_id", book.assessments.map((a) => a.id).concat("00000000-0000-0000-0000-000000000000")),
  ]);
  const students = (enrollments ?? [])
    .flatMap((e) => (e.student ? [e.student] : []))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));
  const assessments = [...book.assessments].sort((a, b) => (a.assessed_on ?? "").localeCompare(b.assessed_on ?? ""));
  const grade = new Map((grades ?? []).map((g) => [`${g.assessment_id}:${g.student_id}`, g]));
  const header = ["Matricule", "Nom", "Prénom", ...assessments.map((a) => `${a.title} (/${Number(a.max_score)}, coef. ${Number(a.coefficient)})`), "Moyenne /20"];
  const rows: (string | number | null)[][] = [header];
  for (const s of students) {
    let sum = 0;
    let weight = 0;
    const cells = assessments.map((a) => {
      const g = grade.get(`${a.id}:${s.id}`);
      if (!g) return null;
      if (g.is_absent) return "abs";
      if (g.is_exempt) return "disp";
      if (g.score === null) return null;
      sum += (Number(g.score) / Number(a.max_score)) * 20 * Number(a.coefficient);
      weight += Number(a.coefficient);
      return Number(g.score);
    });
    rows.push([s.matricule, s.last_name, s.first_name, ...cells, weight ? Math.round((sum / weight) * 100) / 100 : null]);
  }
  const base = safeFileName(`carnet-${book.class.name}-${book.subject?.name ?? "matiere"}`);
  const csv = request.nextUrl.searchParams.get("format") === "csv";
  await supabase.rpc("log_event", {
    p_organization_id: context.organization.id,
    p_action: "grades.exported",
    p_entity_type: "class_subjects",
    p_entity_id: classSubjectId,
    p_summary: `Export ${csv ? "CSV" : "Excel"} du carnet : ${book.subject?.name ?? ""} · ${book.class.name}`,
  });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (csv) {
    const body = rows.slice(1).map((r) => r.map((v) => (v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : v)));
    return new Response(toDelimitedCsv(header, body, ";"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
    });
  }
  const xlsx = buildXlsx([{ name: `${book.subject?.name ?? "Notes"} ${book.class.name}`, rows, widths: [16, 22, 22, ...assessments.map(() => 18), 14] }]);
  return new Response(new Uint8Array(xlsx), {
    headers: { ...headers, "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}
