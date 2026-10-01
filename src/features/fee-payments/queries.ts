import "server-only";

import { createClient } from "@/lib/supabase/server";

/** État des paiements en ligne vu par l'établissement (aucune clé : seulement un indice). */
export async function getFeeAdminState(organizationId: string) {
  const supabase = await createClient();
  const [{ data: platform }, { data: settings }, { data: providers }] = await Promise.all([
    supabase.from("platform_payment_settings").select("school_payments_enabled").eq("id", 1).maybeSingle(),
    supabase.from("org_payment_settings").select("online_enabled, allow_partial, min_partial_amount, pending_minutes").eq("organization_id", organizationId).maybeSingle(),
    supabase
      .from("org_payment_providers")
      .select("id, adapter, label, country, currency, methods, mode, is_active, is_default, priority, secret_hint, last_test_at, last_test_ok, last_test_message, archived_at, created_at")
      .eq("organization_id", organizationId)
      .order("archived_at", { ascending: true, nullsFirst: true })
      .order("is_default", { ascending: false })
      .order("priority")
      .order("label"),
  ]);
  return {
    globalEnabled: platform?.school_payments_enabled ?? false,
    settings: settings ?? { online_enabled: false, allow_partial: false, min_partial_amount: 0, pending_minutes: 60 },
    providers: providers ?? [],
  };
}

export async function getFeeProvider(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_payment_providers")
    .select("id, adapter, label, country, currency, methods, mode, is_active, is_default, priority, config, custom_definition, secret_hint, webhook_token, last_test_at, last_test_ok, last_test_message, archived_at, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  return data;
}

export type FeeOptions = {
  global_enabled: boolean;
  org_enabled: boolean;
  open: boolean;
  allow_partial: boolean;
  min_partial: number;
  providers: { id: string; label: string; methods: string[]; mode: string; currency: string; is_default: boolean }[];
};

/** Ce que voit la famille : ouverture et fournisseurs actifs (sans configuration). */
export async function getFeeOptions(organizationId: string): Promise<FeeOptions> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fee_payment_options", { p_org: organizationId });
  return (data as unknown as FeeOptions) ?? { global_enabled: false, org_enabled: false, open: false, allow_partial: false, min_partial: 0, providers: [] };
}

const TX_COLUMNS =
  "id, internal_reference, invoice_id, installment_id, student_id, provider_id, adapter, provider_label, mode, method, amount, currency, purpose, status, provider_transaction_id, payment_id, refunded_amount, needs_review, review_reason, failure_reason, expires_at, confirmed_at, created_at, updated_at";

/** Paiements en ligne d'un élève (portail : RLS limitée aux enfants rattachés). */
export async function getStudentFeeTransactions(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_transactions")
    .select(TX_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export type FeeTxFilters = { from?: string; to?: string; status?: string; provider?: string; method?: string; q?: string; review?: boolean };

export async function listFeeTransactions(organizationId: string, f: FeeTxFilters, limit = 100) {
  const supabase = await createClient();
  let query = supabase
    .from("fee_payment_transactions")
    .select(`${TX_COLUMNS}, student:students(first_name, last_name, matricule), payment:payments(number)`)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00`);
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59`);
  if (f.status) query = query.eq("status", f.status);
  if (f.provider) query = query.eq("provider_id", f.provider);
  if (f.method) query = query.eq("method", f.method);
  if (f.review) query = query.eq("needs_review", true);
  if (f.q) {
    const q = f.q.replace(/[%,()]/g, "").slice(0, 60);
    if (q) query = query.or(`internal_reference.ilike.%${q}%,provider_transaction_id.ilike.%${q}%`);
  }
  const { data } = await query;
  return data ?? [];
}

export type FeeStats = {
  count: number;
  collected: number;
  success: number;
  pending: number;
  failed: number;
  refunded: number;
  review: number;
  by_provider: { label: string; count: number; amount: number }[];
  by_method: { method: string; count: number; amount: number }[];
  currencies: string[];
};

export async function getFeeStats(organizationId: string, from: string, to: string): Promise<FeeStats | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("fee_payment_stats", { p_org: organizationId, p_from: from, p_to: to });
  return (data as unknown as FeeStats) ?? null;
}

export async function getFeeTransaction(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("fee_payment_transactions")
    .select(`${TX_COLUMNS}, student:students(first_name, last_name, matricule), payment:payments(number, status, balance_after), invoice:invoices(number, total, currency)`)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (!tx) return null;
  const [{ data: events }, { data: refunds }, { data: webhooks }] = await Promise.all([
    supabase.from("fee_payment_events").select("id, kind, summary, created_at, actor").eq("transaction_id", id).order("created_at"),
    supabase.from("fee_payment_refunds").select("id, amount, reason, mode, status, external_reference, note, requested_at, processed_at").eq("transaction_id", id).order("requested_at"),
    supabase.from("fee_payment_webhooks").select("id, received_at, processing_status, error, ip").eq("transaction_id", id).order("received_at"),
  ]);
  return { tx, events: events ?? [], refunds: refunds ?? [], webhooks: webhooks ?? [] };
}

export async function listFeeRefunds(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_refunds")
    .select("id, transaction_id, amount, reason, mode, status, external_reference, requested_at, processed_at, tx:fee_payment_transactions(internal_reference, currency, provider_label, student:students(first_name, last_name))")
    .eq("organization_id", organizationId)
    .order("requested_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listFeeEvents(organizationId: string, limit = 150) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_events")
    .select("id, kind, summary, created_at, transaction_id, provider_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listFeeWebhooks(organizationId: string, limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_webhooks")
    .select("id, received_at, processing_status, error, provider_transaction_id, transaction_id, provider:org_payment_providers(label)")
    .eq("organization_id", organizationId)
    .order("received_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listProviderEvents(organizationId: string, providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_payment_events")
    .select("id, kind, summary, created_at")
    .eq("organization_id", organizationId)
    .eq("provider_id", providerId)
    .is("transaction_id", null)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}
