import "server-only";

import type { ImportKind } from "@/features/migration/fields";
import { createClient } from "@/lib/supabase/server";

export type HistoricalOverview = {
  former_total: number;
  alumni: number;
  graduated: number;
  transferred: number;
  withdrawn: number;
  archived: number;
  imported: number;
  manual: number;
  diplomas: number;
  history_lines: number;
  grades: number;
  years: { id: string; name: string; status: string; is_current: boolean; history: number; enrollments: number }[];
};

export async function getHistoricalOverview(organizationId: string): Promise<HistoricalOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("historical_overview", { p_organization_id: organizationId });
  if (error || !data) throw new Error("Impossible de charger les données historiques.");
  return data as unknown as HistoricalOverview;
}

export type StudentStatusCounts = { current: number; former: number; graduated: number; transferred: number; archived: number };

export async function getStudentStatusCounts(organizationId: string): Promise<StudentStatusCounts> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_status_counts", { p_organization_id: organizationId });
  return (data as unknown as StudentStatusCounts) ?? { current: 0, former: 0, graduated: 0, transferred: 0, archived: 0 };
}

export type BatchStats = Partial<
  Record<
    | "rows" | "valid" | "warnings" | "invalid" | "duplicates" | "pending_decisions" | "students" | "created" | "linked" | "merged"
    | "skipped" | "imported" | "history" | "diplomas" | "grades" | "payments" | "years_created" | "errors" | "rejected",
    number
  >
>;

export async function listImportBatches(organizationId: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("migration_batches")
    .select("id, kind, status, file_name, file_size, row_count, stats, created_at, completed_at, author:profiles!migration_batches_created_by_fkey(first_name, last_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((b) => ({ ...b, kind: b.kind as ImportKind, stats: (b.stats ?? {}) as BatchStats }));
}

export async function getImportBatch(organizationId: string, batchId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("migration_batches")
    .select("id, kind, status, file_name, file_size, headers, row_count, mapping, options, stats, created_at, analyzed_at, started_at, completed_at, author:profiles!migration_batches_created_by_fkey(first_name, last_name, email)")
    .eq("organization_id", organizationId)
    .eq("id", batchId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    kind: data.kind as ImportKind,
    mapping: (data.mapping ?? {}) as Record<string, string>,
    options: (data.options ?? {}) as Record<string, unknown>,
    stats: (data.stats ?? {}) as BatchStats,
  };
}

export type ImportRowView = "preview" | "duplicates" | "problems" | "rejected" | "all";

export type ImportRow = {
  id: string;
  row_number: number;
  status: string;
  normalized: Record<string, unknown>;
  data: Record<string, string>;
  issues: { level: "error" | "warning"; field: string | null; message: string }[];
  group_key: string | null;
  duplicate_score: number | null;
  duplicate_reasons: string[] | null;
  resolution: string | null;
  duplicate: { id: string; first_name: string; last_name: string; matricule: string; legacy_matricule: string | null; birth_date: string | null; status: string; archived_at: string | null } | null;
  student: { id: string; first_name: string; last_name: string; matricule: string } | null;
};

export async function listImportRows(organizationId: string, batchId: string, view: ImportRowView, page = 1, pageSize = 50) {
  const supabase = await createClient();
  let query = supabase
    .from("migration_rows")
    .select(
      `id, row_number, status, normalized, data, issues, group_key, duplicate_score, duplicate_reasons, resolution,
       duplicate:students!migration_rows_organization_id_duplicate_student_id_fkey(id, first_name, last_name, matricule, legacy_matricule, birth_date, status, archived_at),
       student:students!migration_rows_organization_id_student_id_fkey(id, first_name, last_name, matricule)`,
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("batch_id", batchId);
  if (view === "duplicates") query = query.not("duplicate_student_id", "is", null);
  // Toute ligne portant une remarque : erreurs, avertissements, lignes en double dans le fichier.
  if (view === "problems") query = query.neq("issues", "[]");
  if (view === "rejected") query = query.in("status", ["invalid", "rejected"]);
  const from = (page - 1) * pageSize;
  const { data, count } = await query.order("row_number").range(from, from + pageSize - 1);
  return { rows: (data ?? []) as unknown as ImportRow[], total: count ?? 0 };
}

/** Parcours antérieur d'un élève : années, notes, paiements (si finance.read), diplômes. */
export async function getStudentPastRecords(organizationId: string, studentId: string, withPayments: boolean) {
  const supabase = await createClient();
  const [history, grades, payments, diplomas] = await Promise.all([
    supabase
      .from("student_history")
      .select("id, year_label, class_name, level_name, program_name, average, rank, decision, absences, absences_justified, notes, source, created_at")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("year_label", { ascending: false }),
    supabase
      .from("student_history_grades")
      .select("id, year_label, period_label, subject, score, max_score, coefficient, appreciation")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("year_label", { ascending: false })
      .order("period_label")
      .order("subject")
      .limit(2000),
    withPayments
      ? supabase
          .from("student_history_payments")
          .select("id, year_label, label, amount, paid_on, method, reference")
          .eq("organization_id", organizationId)
          .eq("student_id", studentId)
          .order("paid_on", { ascending: false, nullsFirst: false })
          .limit(1000)
      : Promise.resolve({ data: [] }),
    supabase
      .from("student_diplomas")
      .select("id, kind, title, year_label, mention, number, issued_on, issuer, file_id, notes, source")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("year_label", { ascending: false, nullsFirst: false }),
  ]);
  return {
    history: history.data ?? [],
    grades: grades.data ?? [],
    payments: payments.data ?? [],
    diplomas: diplomas.data ?? [],
  };
}
