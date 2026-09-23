import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function listAnnouncementsForManagement(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, audience, is_pinned, published_at, expires_at, author_name, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function listMyThreads(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_threads", { p_organization_id: organizationId });
  return data ?? [];
}

/** Messages d'une conversation (participant uniquement) ; la marque comme lue. */
export async function getThreadMessages(threadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("thread_messages", { p_thread_id: threadId });
  if (error) return null;
  await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
  return data ?? [];
}

export async function listMessageContacts(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("message_contacts", { p_organization_id: organizationId });
  return (data ?? []).sort((a, b) => a.kind.localeCompare(b.kind, "fr") || a.name.localeCompare(b.name, "fr"));
}
