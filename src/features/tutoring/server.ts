import "server-only";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Pays proposé par défaut : compte particulier, sinon établissement actif, sinon Côte d'Ivoire. */
export async function defaultTutoringCountry(): Promise<{ country: string; city: string | null }> {
  const context = await getSessionContext();
  if (!context) return { country: "CI", city: null };
  const supabase = await createClient();
  const { data: account } = await supabase.from("public_accounts").select("country, city").eq("user_id", context.user.id).maybeSingle();
  if (account?.country) return { country: account.country, city: account.city };
  if (context.organization) {
    const { data: org } = await supabase.from("organizations").select("country").eq("id", context.organization.id).maybeSingle();
    if (org?.country) return { country: org.country, city: null };
  }
  return { country: "CI", city: null };
}
