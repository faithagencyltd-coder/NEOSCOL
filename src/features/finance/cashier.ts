"use server";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { isUuid, likePattern, normalizeSearch } from "@/lib/utils/search-params";

/**
 * Caisse : retrouver un élève et ses factures ouvertes pour encaisser une
 * tranche. Lecture seule, sous RLS, limitée à l'établissement de la session ;
 * l'encaissement lui-même passe par recordPayment (mêmes contrôles en base).
 */

export type PayableInstallment = { id: string; label: string; dueOn: string; amount: number; remaining: number };
export type PayableInvoice = {
  id: string;
  number: string;
  total: number;
  paid: number;
  balance: number;
  isOverdue: boolean;
  label: string;
  installments: PayableInstallment[];
};
export type PayableStudent = { id: string; firstName: string; lastName: string; matricule: string | null; invoices: PayableInvoice[] };

/** Répartit le montant déjà payé sur les tranches, dans l'ordre (la plus ancienne d'abord). */
function allocate(paid: number, installments: { id: string; label: string; due_on: string; amount: number | string; sequence: number }[]): PayableInstallment[] {
  let left = paid;
  return [...installments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((i) => {
      const amount = Number(i.amount);
      const covered = Math.min(amount, Math.max(0, left));
      left -= covered;
      return { id: i.id, label: i.label, dueOn: i.due_on, amount, remaining: Math.round((amount - covered) * 100) / 100 };
    });
}

async function loadPayable(organizationId: string, studentIds: string[]): Promise<PayableStudent[]> {
  if (!studentIds.length) return [];
  const supabase = await createClient();
  const [{ data: students }, { data: balances }] = await Promise.all([
    supabase.from("students").select("id, first_name, last_name, matricule").eq("organization_id", organizationId).in("id", studentIds),
    supabase
      .from("invoice_balances")
      .select("invoice_id, number, total, paid, balance, is_overdue, student_id, issued_on")
      .eq("organization_id", organizationId)
      .eq("status", "issued")
      .gt("balance", 0)
      .in("student_id", studentIds)
      .order("issued_on", { ascending: true }),
  ]);
  const invoiceIds = (balances ?? []).map((b) => b.invoice_id).filter((id): id is string => Boolean(id));
  const [{ data: installments }, { data: lines }] = invoiceIds.length
    ? await Promise.all([
        supabase.from("installments").select("id, invoice_id, label, due_on, amount, sequence").eq("organization_id", organizationId).in("invoice_id", invoiceIds),
        supabase.from("invoice_lines").select("invoice_id, description, sort_order").eq("organization_id", organizationId).in("invoice_id", invoiceIds).order("sort_order"),
      ])
    : [{ data: [] }, { data: [] }];
  const byStudent = new Map<string, PayableInvoice[]>();
  for (const b of balances ?? []) {
    if (!b.invoice_id || !b.student_id) continue;
    const paid = Number(b.paid ?? 0);
    const invoiceLines = (lines ?? []).filter((l) => l.invoice_id === b.invoice_id);
    const list = byStudent.get(b.student_id) ?? [];
    list.push({
      id: b.invoice_id,
      number: b.number ?? "",
      total: Number(b.total ?? 0),
      paid,
      balance: Number(b.balance ?? 0),
      isOverdue: Boolean(b.is_overdue),
      label: invoiceLines.length ? invoiceLines[0]!.description + (invoiceLines.length > 1 ? ` (+${invoiceLines.length - 1})` : "") : "",
      installments: allocate(paid, (installments ?? []).filter((i) => i.invoice_id === b.invoice_id)),
    });
    byStudent.set(b.student_id, list);
  }
  return (students ?? [])
    .map((s) => ({ id: s.id, firstName: s.first_name, lastName: s.last_name, matricule: s.matricule, invoices: byStudent.get(s.id) ?? [] }))
    .sort((a, b) => Number(b.invoices.length > 0) - Number(a.invoices.length > 0) || a.lastName.localeCompare(b.lastName, "fr"));
}

/** Recherche par nom, prénom ou matricule (8 résultats au plus). */
export async function searchPayableStudents(query: string): Promise<ActionResult<PayableStudent[]>> {
  const auth = await authorize("finance.payments.create");
  if (!auth.ok) return auth;
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, message: "", data: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("id")
    .eq("organization_id", auth.context.organization.id)
    .ilike("search_text", likePattern(normalizeSearch(q)))
    .order("last_name")
    .limit(8);
  return { ok: true, message: "", data: await loadPayable(auth.context.organization.id, (data ?? []).map((s) => s.id)) };
}

/** Élève d'une facture donnée (bouton « Encaisser » d'une ligne de facture). */
export async function payableForInvoice(invoiceId: string): Promise<ActionResult<PayableStudent | null>> {
  const auth = await authorize("finance.payments.create");
  if (!auth.ok) return auth;
  if (!isUuid(invoiceId)) return { ok: true, message: "", data: null };
  const supabase = await createClient();
  const { data } = await supabase.from("invoices").select("student_id").eq("organization_id", auth.context.organization.id).eq("id", invoiceId).maybeSingle();
  if (!data?.student_id) return { ok: true, message: "", data: null };
  const [student] = await loadPayable(auth.context.organization.id, [data.student_id]);
  return { ok: true, message: "", data: student ?? null };
}
