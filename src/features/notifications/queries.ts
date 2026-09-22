import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getRecentNotifications(organizationId: string) {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, created_at, read_at")
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
