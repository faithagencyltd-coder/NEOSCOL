"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/guards";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function markAllNotificationsRead(): Promise<void> {
  const context = await requireSession();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const context = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.user.id).eq("id", id);
  revalidatePath("/", "layout");
}

export type LiveNotification = { id: string; type: string; title: string; body: string | null; link: string | null; created_at: string };

/**
 * Nouvelles notifications depuis `since` (RLS : uniquement celles de
 * l'utilisateur, dans l'établissement actif). Sert à l'affichage en direct.
 */
export async function pollNotifications(since: string): Promise<LiveNotification[]> {
  const context = await getSessionContext();
  if (!context?.organization || Number.isNaN(Date.parse(since))) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, created_at")
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .gt("created_at", new Date(since).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  return data ?? [];
}
