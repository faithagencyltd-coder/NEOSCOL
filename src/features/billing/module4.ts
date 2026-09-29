import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { Module4Component } from "./constants";

export type Module4Space = {
  id: string;
  name: string;
  code: string;
  type: string;
  component: Module4Component;
  status: string;
  member: boolean;
  access: "full" | "read_only";
};

export type Module4Overview = {
  group: { id: string; name: string; code: string; member: boolean };
  status: string;
  interval: "MONTHLY" | "YEARLY";
  monthly_price: number;
  annual_price: number;
  currency: string;
  components: Module4Component[];
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  spaces: Module4Space[];
};

/**
 * Module 4 : établissement principal, abonnement, domaines et espaces, vus depuis
 * le principal ou l'un de ses espaces (null hors Module 4). Contrôlé en base
 * (appartenance à l'établissement demandé).
 */
export async function module4Overview(organizationId: string): Promise<Module4Overview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("module4_overview", { p_org: organizationId });
  if (error || !data) return null;
  return data as unknown as Module4Overview;
}
