import "server-only";

import { rpcArgs, type AnalyticsFilters } from "@/features/analytics/shared";
import { createClient } from "@/lib/supabase/server";

/** Données de la rubrique Analytics (fonctions de base réservées à l'administration de la plateforme). */

export type Overview = {
  realtime: number;
  realtime_pages: { path: string | null; n: number }[];
  today: number;
  week: number;
  month: number;
  visitors: number;
  sessions: number;
  pageviews: number;
  avg_duration_ms: number | null;
  bounce_rate: number | null;
  consented_sessions: number;
  returning_sessions: number;
  new_sessions: number;
  conversions: number;
  previous: { visitors: number; sessions: number; pageviews: number; conversions: number };
  by_day: { day: string; visitors: number; sessions: number; pageviews: number }[];
};
export type Geo = { countries: { country: string; visitors: number; sessions: number; conversions: number }[]; cities: { country: string; city: string; visitors: number }[]; unknown_country: number };
export type Behavior = {
  pages: { path: string; views: number; sessions: number; avg_duration_ms: number | null }[];
  clicks: { label: string; path: string; clicks: number }[];
  links: { target: string; label: string | null; clicks: number }[];
  entries: { path: string; sessions: number }[];
  exits: { path: string; sessions: number }[];
  routes: { route: string; sessions: number }[];
  referrers: { source: string; sessions: number }[];
  campaigns: { source: string; campaign: string; sessions: number; conversions: number }[];
};
export type Devices = { devices: Record<string, number>; os: Record<string, number>; browsers: Record<string, number>; conversion_by_device: Record<string, number> };
export type Conversion = {
  sessions: number;
  converted_sessions: number;
  events: Record<string, number>;
  signup_started_sessions: number;
  business: { demo_requests: number; contact_requests: number; discover_requests: number; signups_completed: number; public_accounts: number; paid_subscriptions: number };
};
export type Organizations = {
  active_organizations: number;
  organizations_with_activity: number;
  logins: number;
  active_users: number;
  modules: { module: string; views: number; organizations: number; users: number }[];
  rows: { id: string; name: string; type: string; country: string; status: string; logins: number; login_users: number; last_login: string | null; actions: number; page_views: number; usage_users: number; top_modules: string[] }[];
};

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)(fn, args);
  return error ? null : (data as T);
}

export const loadOverview = (f: AnalyticsFilters) => call<Overview>("platform_analytics_overview", rpcArgs(f));
export const loadGeo = (f: AnalyticsFilters) => call<Geo>("platform_analytics_geo", rpcArgs(f));
export const loadBehavior = (f: AnalyticsFilters) => call<Behavior>("platform_analytics_behavior", rpcArgs(f));
export const loadDevices = (f: AnalyticsFilters) => call<Devices>("platform_analytics_devices", rpcArgs(f));
export const loadConversion = (f: AnalyticsFilters) => call<Conversion>("platform_analytics_conversion", rpcArgs(f));
export const loadOrganizations = (f: AnalyticsFilters) => call<Organizations>("platform_analytics_organizations", { p_from: f.from, p_to: f.to, p_country: f.country });

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code === "—" ? "Non déterminé" : code;
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
