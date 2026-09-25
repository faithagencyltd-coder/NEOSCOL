import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PlanWithFeatures = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  audience: string | null;
  monthly_price: number;
  annual_price: number;
  annual_list_price: number;
  annual_savings: number;
  annual_discount_percent: number;
  currency: string;
  trial_days: number;
  is_active: boolean;
  sort_order: number;
  features: { feature_code: string; enabled: boolean; limit_value: number | null }[];
};

/** Formules visibles (actives ; toutes pour la plateforme), avec leurs fonctionnalités. */
export async function listPlans(): Promise<PlanWithFeatures[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_plans")
    .select("id, code, name, description, audience, monthly_price, annual_price, annual_list_price, annual_savings, annual_discount_percent, currency, trial_days, is_active, sort_order, features:subscription_features(feature_code, enabled, limit_value)")
    .order("sort_order");
  return (data ?? []) as unknown as PlanWithFeatures[];
}

/** Abonnement de l'établissement (RLS : billing.read ou plateforme). */
export async function getSubscription(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*, plan:subscription_plans(id, code, name, description, monthly_price, annual_price, annual_list_price, annual_savings)")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

export async function listInvoices(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_invoices")
    .select("id, invoice_number, plan_name, plan_code, billing_interval, list_amount, discount_amount, amount, currency, status, kind, issued_at, due_at, paid_at, period_start, period_end, payment_method")
    .eq("organization_id", organizationId)
    .order("issued_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function listTransactions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_transactions")
    .select("id, internal_reference, provider, mode, amount, currency, status, payment_method, failure_reason, paid_at, created_at, invoice:subscription_invoices!payment_transactions_organization_id_invoice_id_fkey(invoice_number)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function listEvents(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_events")
    .select("id, event_type, metadata, created_at, user:profiles(first_name, last_name, email)")
    .eq("organization_id", organizationId)
    .neq("event_type", "notification_sent")
    .order("created_at", { ascending: false })
    .limit(40);
  return data ?? [];
}

export type AccessState = {
  status: string | null;
  access: "full" | "read_only";
  plan?: string;
  end_at?: string;
  days_left?: number;
  cancel_at_period_end?: boolean;
  is_demo?: boolean;
};

/** État d'accès (bandeaux) — tout membre de l'établissement. */
export async function getAccessState(organizationId: string): Promise<AccessState | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("billing_access_state", { p_org: organizationId });
  return (data as AccessState | null) ?? null;
}
