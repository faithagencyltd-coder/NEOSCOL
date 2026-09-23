import "server-only";

import { createClient } from "@/lib/supabase/server";
import { likePattern, normalizeSearch } from "@/lib/utils/search-params";

export const FINANCE_PAGE_SIZE = 25;

export type InvoiceFilters = { q?: string; status?: string; page: number };

/** Factures avec soldes calculés en base (vue invoice_balances). */
export async function listInvoices(organizationId: string, filters: InvoiceFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("invoice_balances")
    .select("invoice_id, number, status, issued_on, due_on, total, paid, balance, payment_status, next_due_on, is_overdue, student_id", { count: "exact" })
    .eq("organization_id", organizationId)
    .neq("status", "draft");
  if (filters.status === "overdue") query = query.eq("is_overdue", true);
  else if (filters.status === "cancelled") query = query.eq("status", "cancelled");
  else if (filters.status) query = query.eq("payment_status", filters.status);
  if (filters.q) {
    const { data: students } = await supabase
      .from("students")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("search_text", likePattern(normalizeSearch(filters.q)))
      .limit(200);
    const ids = (students ?? []).map((s) => s.id);
    query = ids.length ? query.or(`number.ilike.${likePattern(filters.q.toUpperCase())},student_id.in.(${ids.join(",")})`) : query.ilike("number", likePattern(filters.q.toUpperCase()));
  }
  const from = (filters.page - 1) * FINANCE_PAGE_SIZE;
  const { data, count } = await query.order("issued_on", { ascending: false }).order("number", { ascending: false }).range(from, from + FINANCE_PAGE_SIZE - 1);
  const rows = data ?? [];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter((id): id is string => Boolean(id)))];
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, first_name, last_name, matricule").in("id", studentIds)
    : { data: [] };
  return {
    rows: rows.map((r) => ({ ...r, student: (students ?? []).find((s) => s.id === r.student_id) ?? null })),
    total: count ?? 0,
  };
}

export async function getInvoice(organizationId: string, id: string) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: balance }, { data: reminders }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        `id, number, status, issued_on, due_on, subtotal, discount_total, total, notes, cancelled_reason,
         student:students(id, first_name, last_name, matricule),
         invoice_lines(id, description, quantity, unit_amount, discount_amount, discount_reason, amount, sort_order),
         installments(id, label, due_on, amount, sequence),
         payments(id, number, amount, method, reference, payer_name, paid_at, received_by_name, balance_after, status, cancelled_reason)`,
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("invoice_balances").select("paid, balance, payment_status, next_due_on, is_overdue").eq("invoice_id", id).maybeSingle(),
    supabase.from("invoice_reminders").select("id, kind, sent_at, amount_due, recipients").eq("invoice_id", id).order("sent_at", { ascending: false }).limit(20),
  ]);
  return invoice ? { invoice, balance, reminders: reminders ?? [] } : null;
}

export async function listPayments(organizationId: string, filters: { from: string; to: string; method?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("payments")
    .select("id, number, amount, method, reference, paid_at, status, received_by_name, invoice_id, student:students(id, first_name, last_name, matricule)")
    .eq("organization_id", organizationId)
    .gte("paid_at", `${filters.from}T00:00:00Z`)
    .lte("paid_at", `${filters.to}T23:59:59Z`);
  if (filters.method) query = query.eq("method", filters.method as "cash");
  const { data } = await query.order("paid_at", { ascending: false }).limit(300);
  return data ?? [];
}

export async function listExpenses(organizationId: string, filters: { from: string; to: string; categoryId?: string; archived?: boolean; q?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("id, number, label, amount, spent_on, supplier, payment_method, reference, comment, status, cancelled_reason, archived_at, receipt_file_id, category:expense_categories(id, name)")
    .eq("organization_id", organizationId)
    .gte("spent_on", filters.from)
    .lte("spent_on", filters.to);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.q) query = query.ilike("search_text", likePattern(normalizeSearch(filters.q)));
  const { data } = await query.order("spent_on", { ascending: false }).order("number", { ascending: false }).limit(300);
  return data ?? [];
}

export async function listExpenseCategories(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("expense_categories").select("id, name, is_active").eq("organization_id", organizationId).order("name");
  return data ?? [];
}

export async function listReminders(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_reminders")
    .select("id, kind, sent_at, amount_due, balance, recipients, invoice:invoices(id, number), student:students(first_name, last_name)")
    .eq("organization_id", organizationId)
    .order("sent_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

/** Synthèse de la période : encaissements, dépenses, solde, restes dus. */
export async function getFinanceSummary(organizationId: string, from: string, to: string) {
  const supabase = await createClient();
  const [{ data: payments }, { data: expenses }, { data: balances }] = await Promise.all([
    supabase.from("payments").select("amount").eq("organization_id", organizationId).eq("status", "completed").gte("paid_at", `${from}T00:00:00Z`).lte("paid_at", `${to}T23:59:59Z`),
    supabase.from("expenses").select("amount, category:expense_categories(name)").eq("organization_id", organizationId).eq("status", "recorded").gte("spent_on", from).lte("spent_on", to),
    supabase.from("invoice_balances").select("balance, is_overdue, total").eq("organization_id", organizationId).eq("status", "issued"),
  ]);
  const income = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const spent = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) byCategory.set(e.category?.name ?? "—", (byCategory.get(e.category?.name ?? "—") ?? 0) + Number(e.amount));
  return {
    income,
    spent,
    net: income - spent,
    invoiced: (balances ?? []).reduce((s, b) => s + Number(b.total ?? 0), 0),
    outstanding: (balances ?? []).reduce((s, b) => s + Math.max(Number(b.balance ?? 0), 0), 0),
    overdueInvoices: (balances ?? []).filter((b) => b.is_overdue).length,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export async function listStudentsForInvoice(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name, matricule")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .in("status", ["active", "prospect"])
    .order("last_name")
    .limit(1000);
  return data ?? [];
}

export async function listFeeTypes(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("fee_types").select("id, name, code").eq("organization_id", organizationId).eq("is_active", true).order("name");
  return data ?? [];
}

/** Paramétrage des frais : types, tarifs de l'année en cours et cibles possibles. */
export async function getFeeSetup(organizationId: string) {
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_years").select("id, name").eq("organization_id", organizationId).eq("is_current", true).maybeSingle();
  const [types, rates, levels, programs, classes] = await Promise.all([
    supabase.from("fee_types").select("id, name, code, category, is_active").eq("organization_id", organizationId).order("name"),
    year
      ? supabase
          .from("fee_rates")
          .select("id, fee_type_id, level_id, program_id, class_id, amount, is_mandatory, installment_plan, notes, fee_type:fee_types(name, category), level:levels(name), program:programs(name), class:classes(name)")
          .eq("organization_id", organizationId)
          .eq("academic_year_id", year.id)
      : Promise.resolve({ data: [] }),
    supabase.from("levels").select("id, name").eq("organization_id", organizationId).order("sequence"),
    supabase.from("programs").select("id, name").eq("organization_id", organizationId).order("name"),
    year ? supabase.from("classes").select("id, name").eq("organization_id", organizationId).eq("academic_year_id", year.id).order("name") : Promise.resolve({ data: [] }),
  ]);
  const rows = (rates.data ?? []).slice().sort((a, b) => (a.fee_type?.name ?? "").localeCompare(b.fee_type?.name ?? "", "fr") || Number(b.amount) - Number(a.amount));
  return {
    year,
    types: types.data ?? [],
    rates: rows,
    levels: levels.data ?? [],
    programs: programs.data ?? [],
    classes: classes.data ?? [],
  };
}

/** Reliquats par élève (factures émises non soldées), du plus endetté au moins endetté. */
export async function listOutstandingBalances(organizationId: string, filters: { q?: string; overdueOnly?: boolean }) {
  const supabase = await createClient();
  const { data: balances } = await supabase
    .from("invoice_balances")
    .select("invoice_id, student_id, number, total, paid, balance, due_on, next_due_on, is_overdue")
    .eq("organization_id", organizationId)
    .eq("status", "issued")
    .gt("balance", 0)
    .order("due_on")
    .limit(2000);
  const rows = balances ?? [];
  const ids = [...new Set(rows.map((r) => r.student_id).filter((id): id is string => Boolean(id)))];
  const { data: students } = ids.length
    ? await supabase
        .from("students")
        .select("id, first_name, last_name, matricule, enrollments(status, class:classes(name))")
        .eq("organization_id", organizationId)
        .in("id", ids)
    : { data: [] };
  const byId = new Map((students ?? []).map((s) => [s.id, s]));
  const grouped = new Map<string, { student: NonNullable<ReturnType<typeof byId.get>>; invoices: typeof rows; total: number; paid: number; balance: number; overdue: boolean; nextDue: string | null }>();
  for (const r of rows) {
    const student = r.student_id ? byId.get(r.student_id) : undefined;
    if (!student) continue;
    const g = grouped.get(student.id) ?? { student, invoices: [], total: 0, paid: 0, balance: 0, overdue: false, nextDue: null };
    g.invoices.push(r);
    g.total += Number(r.total ?? 0);
    g.paid += Number(r.paid ?? 0);
    g.balance += Number(r.balance ?? 0);
    g.overdue ||= Boolean(r.is_overdue);
    const due = r.next_due_on ?? r.due_on;
    if (due && (!g.nextDue || due < g.nextDue)) g.nextDue = due;
    grouped.set(student.id, g);
  }
  const q = filters.q ? normalizeSearch(filters.q) : "";
  return [...grouped.values()]
    .map((g) => ({ ...g, className: g.student.enrollments.find((e) => e.status === "validated")?.class?.name ?? null }))
    .filter((g) => !filters.overdueOnly || g.overdue)
    .filter((g) => !q || normalizeSearch(`${g.student.last_name} ${g.student.first_name} ${g.student.matricule} ${g.className ?? ""}`).includes(q))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.balance - a.balance);
}
