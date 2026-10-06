import { createBrowserClient } from "@supabase/ssr";

import { assertSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Client navigateur : réservé à l'authentification et au temps réel. */
export function createClient() {
  assertSupabaseConfigured("client navigateur");
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
