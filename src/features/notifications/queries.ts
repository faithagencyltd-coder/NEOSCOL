import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getRecentNotifications(organizationId: string) {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at, read_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("read_at", null),
  ]);
  return { items: data ?? [], unread: count ?? 0 };
}

/** Centre de notifications : toutes les notifications de l'utilisateur (RLS : les siennes uniquement). */
export async function listNotifications(organizationId: string, filters: { unread?: boolean; type?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link, created_at, read_at")
    .eq("organization_id", organizationId);
  if (filters.unread) query = query.is("read_at", null);
  if (filters.type) query = query.like("type", `${filters.type}%`);
  const { data } = await query.order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}
