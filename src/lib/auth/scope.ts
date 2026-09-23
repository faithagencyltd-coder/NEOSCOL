import "server-only";

import type { OrgSessionContext } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Périmètre « mes classes » : un profil sans vue d'ensemble (ni students.read
 * ni academic.manage), typiquement l'enseignant, ne voit que les classes où il
 * enseigne ou dont il est professeur principal. null = aucune restriction.
 */
export async function ownClassScope(context: OrgSessionContext): Promise<Set<string> | null> {
  if (can(context, "students.read") || can(context, "academic.manage")) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_class_ids", { p_organization_id: context.organization.id });
  return new Set(data ?? []);
}
