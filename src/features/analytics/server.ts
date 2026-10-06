import "server-only";

import { cache } from "react";

import type { AnalyticsConfig } from "@/features/analytics/client";
import { createClient } from "@/lib/supabase/server";

/** Réglages publics de la mesure d'audience (Super Admin › Analytics › Réglages). */
export const getAnalyticsConfig = cache(async (): Promise<AnalyticsConfig> => {
  try {
    const { data } = await (await createClient()).from("analytics_settings").select("enabled, consent_required, track_clicks").eq("id", 1).maybeSingle();
    return { enabled: data?.enabled ?? true, consentRequired: data?.consent_required ?? true, clicks: data?.track_clicks ?? true };
  } catch {
    return { enabled: true, consentRequired: true, clicks: true };
  }
});
