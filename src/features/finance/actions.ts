"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { storeUpload } from "@/features/files/server";
import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";
import { dbErrorMessage } from "@/lib/utils/db-error";
import { readFields } from "@/lib/utils/form-data";
import { isUuid } from "@/lib/utils/search-params";

const METHODS = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;
const amount = z.coerce.number({ error: "Montant invalide." }).positive({ error: "Le montant doit être positif." }).max(1_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Date invalide." });

function refresh(invoiceId?: string) {
  revalidatePath("/finances", "layout");
  revalidatePath("/eleves", "layout");
  revalidatePath("/portail", "layout");
  if (invoiceId) revalidatePath(`/finances/factures/${invoiceId}`);
}

const paymentSchema = z.object({
  invoice_id: z.uuid(),
  amount,
  method: z.enum(METHODS, { error: "Mode de paiement invalide." }),
  reference: z.string().trim().max(80).optional(),
  payer_name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Paiement reçu à l'administration : enregistré = validé. Le solde, le statut
 * de la facture et les restrictions du portail sont recalculés immédiatement
 * en base ; la famille est notifiée (et prévenue si l'accès est rétabli).
 */
export async function recordPayment(_: ActionResult<{ paymentId: string }> | null, formData: FormData): Promise<ActionResult<{ paymentId: string }>> {
  const auth = await authorize("finance.payments.create");
  if (!auth.ok) return auth;
  const parsed = paymentSchema.safeParse(readFields(formData, ["invoice_id", "amount", "method", "reference", "payer_name", "notes"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({ organization_id: auth.context.organization.id, ...parsed.data })
    .select("id, number, balance_after")
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Le paiement n'a pas pu être enregistré.") };
  refresh(parsed.data.invoice_id);
  return { ok: true, message: `Paiement ${data.number} enregistré. Reste dû : ${Number(data.balance_after ?? 0).toLocaleString("fr-FR")}.`, data: { paymentId: data.id } };
}

export async function cancelPayment(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.payments.cancel");
  if (!auth.ok) return auth;
  const id = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Paiement introuvable." };
  if (reason.length < 3) return { ok: false, message: "Le motif d'annulation est obligatoire." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "cancelled", cancelled_reason: reason })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .select("invoice_id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Annulation impossible.") };
  refresh(data.invoice_id);
  return { ok: true, message: "Paiement annulé (il reste visible dans l'historique)." };
}

const invoiceSchema = z.object({
  student_id: z.uuid({ error: "Choisissez l'élève." }),
  fee_type_id: z.uuid().optional(),
  description: z.string({ error: "Désignation requise." }).trim().min(2, { error: "Désignation requise." }).max(200),
  amount,
  due_on: isoDate.optional(),
});

/** Facture ponctuelle (tenue, transport…) : créée puis émise ; la famille est notifiée. */
export async function createInvoice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.invoices.manage");
  if (!auth.ok) return auth;
  const parsed = invoiceSchema.safeParse(readFields(formData, ["student_id", "fee_type_id", "description", "amount", "due_on"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const supabase = await createClient();
  const organizationId = auth.context.organization.id;
  const { data: year } = await supabase.from("academic_years").select("id").eq("organization_id", organizationId).eq("is_current", true).maybeSingle();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({ organization_id: organizationId, student_id: parsed.data.student_id, academic_year_id: year?.id ?? null, due_on: parsed.data.due_on ?? null })
    .select("id")
    .single();
  if (error || !invoice) return { ok: false, message: dbErrorMessage(error, "Création impossible.") };
  const { error: lineError } = await supabase.from("invoice_lines").insert({
    organization_id: organizationId,
    invoice_id: invoice.id,
    fee_type_id: parsed.data.fee_type_id ?? null,
    description: parsed.data.description,
    unit_amount: parsed.data.amount,
  });
  if (lineError) return { ok: false, message: dbErrorMessage(lineError) };
  const { error: issueError } = await supabase.from("invoices").update({ status: "issued" }).eq("id", invoice.id);
  if (issueError) return { ok: false, message: dbErrorMessage(issueError) };
  refresh();
  redirect(`/finances/factures/${invoice.id}?creee=1`);
}

export async function cancelInvoice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.invoices.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("invoice_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Facture introuvable." };
  if (reason.length < 3) return { ok: false, message: "Le motif est obligatoire." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("invoices")
    .update({ status: "cancelled", cancelled_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Annulation impossible.") };
  refresh(id);
  return { ok: true, message: "Facture annulée." };
}

export async function sendReminders(): Promise<ActionResult> {
  const auth = await authorize("finance.invoices.manage");
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_invoice_reminders", { p_organization_id: auth.context.organization.id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  const result = (data ?? {}) as { upcoming?: number; overdue?: number };
  return { ok: true, message: `${result.overdue ?? 0} rappel(s) d'impayé et ${result.upcoming ?? 0} rappel(s) d'échéance envoyés.` };
}

export async function sendReminder(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.invoices.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("invoice_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Facture introuvable." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_invoice_reminder", { p_invoice_id: id });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh(id);
  return { ok: true, message: `Rappel envoyé à ${data ?? 0} destinataire(s).` };
}

const expenseSchema = z.object({
  category_id: z.uuid({ error: "Choisissez une catégorie." }),
  label: z.string({ error: "Libellé requis." }).trim().min(2, { error: "Libellé requis." }).max(200),
  amount,
  spent_on: isoDate,
  supplier: z.string().trim().max(120).optional(),
  payment_method: z.enum(METHODS),
  reference: z.string().trim().max(80).optional(),
  comment: z.string().trim().max(1000).optional(),
});
const EXPENSE_FIELDS = ["category_id", "label", "amount", "spent_on", "supplier", "payment_method", "reference", "comment"] as const;

async function receipt(formData: FormData, organizationId: string) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: true as const, id: undefined };
  const supabase = await createClient();
  return storeUpload(supabase, { organizationId, file, owner: "expense", category: "justificatif", accept: ["pdf", "image"] });
}

export async function createExpense(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.manage");
  if (!auth.ok) return auth;
  const parsed = expenseSchema.safeParse(readFields(formData, EXPENSE_FIELDS));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const stored = await receipt(formData, auth.context.organization.id);
  if (!stored.ok) return stored;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({ organization_id: auth.context.organization.id, ...parsed.data, receipt_file_id: stored.id ?? null })
    .select("number")
    .single();
  if (error || !data) return { ok: false, message: dbErrorMessage(error, "Enregistrement impossible.") };
  refresh();
  return { ok: true, message: `Dépense ${data.number} enregistrée.` };
}

export async function updateExpense(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("expense_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Dépense introuvable." };
  const parsed = expenseSchema.safeParse(readFields(formData, EXPENSE_FIELDS));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const stored = await receipt(formData, auth.context.organization.id);
  if (!stored.ok) return stored;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("expenses")
    .update(
      {
        ...parsed.data,
        supplier: parsed.data.supplier ?? null,
        reference: parsed.data.reference ?? null,
        comment: parsed.data.comment ?? null,
        ...(stored.id ? { receipt_file_id: stored.id } : {}),
      },
      { count: "exact" },
    )
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Modification impossible.") };
  refresh();
  return { ok: true, message: "Dépense modifiée." };
}

export async function cancelExpense(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("expense_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!isUuid(id)) return { ok: false, message: "Dépense introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("expenses")
    .update({ status: "cancelled", cancelled_reason: reason }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Annulation impossible.") };
  refresh();
  return { ok: true, message: "Dépense annulée." };
}

export async function setExpenseArchived(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.manage");
  if (!auth.ok) return auth;
  const id = String(formData.get("expense_id") ?? "");
  const archive = formData.get("archive") === "true";
  if (!isUuid(id)) return { ok: false, message: "Dépense introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("expenses")
    .update({ archived_at: archive ? new Date().toISOString() : null }, { count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: archive ? "Dépense archivée." : "Dépense restaurée." };
}

export async function deleteExpense(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.delete");
  if (!auth.ok) return auth;
  const id = String(formData.get("expense_id") ?? "");
  if (!isUuid(id)) return { ok: false, message: "Dépense introuvable." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("expenses").delete({ count: "exact" }).eq("organization_id", auth.context.organization.id).eq("id", id);
  if (error || count === 0) return { ok: false, message: dbErrorMessage(error, "Suppression refusée.") };
  refresh();
  return { ok: true, message: "Dépense supprimée définitivement (trace conservée dans le journal d'audit)." };
}

export async function createExpenseCategory(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorize("finance.expenses.manage");
  if (!auth.ok) return auth;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Nom de catégorie invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").insert({ organization_id: auth.context.organization.id, name });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: "Catégorie ajoutée." };
}
