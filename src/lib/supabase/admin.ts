import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Client « service role » : contourne la RLS. À n'utiliser que pour des
 * opérations système (invitations, journalisation d'échecs de connexion),
 * APRÈS un contrôle de permission explicite. Renvoie null si non configuré.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publicEnv.supabaseUrl || !serviceKey) {
    return null;
  }
  return createClient<Database>(publicEnv.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
