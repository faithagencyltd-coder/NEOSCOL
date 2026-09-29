"use server";

import { authorize } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils/action-result";

/** Nouveau QR code de « Mon badge » (fenêtre de 30 s), calculé et signé en base. */
export async function refreshMyBadge(): Promise<ActionResult<{ code: string; expires_at: string }>> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_badge", { p_org: auth.context.organization.id });
  const badge = data as { code: string; expires_at: string } | null;
  if (!badge) return { ok: false, message: "Aucun badge actif : adressez-vous à l'administration." };
  return { ok: true, data: { code: badge.code, expires_at: badge.expires_at } };
}
