import "server-only";

import { getPlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export type MaintenanceState = { enabled: boolean; message: string; ends_at: string | null };

/** État du mode maintenance (Super Admin › Maintenance). */
export async function maintenanceState(): Promise<MaintenanceState | null> {
  const { data } = await (await createClient()).rpc("maintenance_state");
  const state = data as MaintenanceState | null;
  return state?.enabled ? state : null;
}

/** Maintenance en cours pour cet utilisateur (l'équipe de la plateforme garde l'accès pour vérifier). */
export async function maintenanceBlocks(): Promise<MaintenanceState | null> {
  const state = await maintenanceState();
  if (!state) return null;
  return (await getPlatformRole()) ? null : state;
}
