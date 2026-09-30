import "server-only";

import { createClient } from "@/lib/supabase/server";

export type AccessRule = { enabled: boolean; price: number; currency: string; period_months: number; grace_days: number };

export type MyMembership = {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  organization_type: string;
  city: string | null;
  status: "active" | "invited";
  joined_at: string;
  invited_by: string | null;
  roles: string[];
  extra: boolean;
  access_state: string | null;
  period_end: string | null;
  status_reason: string | null;
};

export type MyAccessPayment = {
  reference: string;
  organization_name: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paid_at: string | null;
  created_at: string;
  covers_from: string | null;
  covers_to: string | null;
};

export type MyOrganizationAccesses = { rule: AccessRule; memberships: MyMembership[]; payments: MyAccessPayment[] };

/** Établissements, invitations et accès supplémentaires du compte connecté (calculés en base). */
export async function getMyOrganizationAccesses(): Promise<MyOrganizationAccesses | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_organization_accesses");
  if (error || !data) return null;
  return data as unknown as MyOrganizationAccesses;
}

export type PlatformTeacherAccess = {
  user_id: string;
  organization_id: string;
  teacher_name: string | null;
  email: string | null;
  organization_name: string;
  other_organizations: string[];
  membership_status: string | null;
  access_status: string | null;
  access_state: string;
  period_start: string | null;
  period_end: string | null;
  status_reason: string | null;
  last_payment: { reference: string; amount: number; currency: string; status: string; provider: string; at: string } | null;
  paid_total: number;
};

export type PlatformTeacherPayment = {
  id: string;
  reference: string;
  user_id: string;
  organization_id: string;
  teacher_name: string | null;
  email: string | null;
  organization_name: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  mode: string;
  method: string | null;
  paid_at: string | null;
  created_at: string;
  covers_from: string | null;
  covers_to: string | null;
  failure_reason: string | null;
  note: string | null;
};

/** Console Super Admin : règle, enseignants concernés, paiements. */
export async function getPlatformTeacherAccessData() {
  const supabase = await createClient();
  const [{ data: rule }, { data: accesses }, { data: payments }, { data: history }] = await Promise.all([
    supabase.from("platform_teacher_access_settings").select("enabled, price, currency, period_months, grace_days, updated_at").eq("id", 1).maybeSingle(),
    supabase.rpc("platform_teacher_accesses"),
    supabase.rpc("platform_teacher_access_payments", { p_limit: 200 }),
    supabase.from("platform_teacher_access_settings_history").select("id, enabled, price, currency, period_months, grace_days, changed_at").order("id", { ascending: false }).limit(10),
  ]);
  return {
    rule,
    accesses: (accesses ?? []) as unknown as PlatformTeacherAccess[],
    payments: (payments ?? []) as unknown as PlatformTeacherPayment[],
    history: history ?? [],
  };
}
