"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireSession } from "@/lib/auth/guards";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/utils/db-error";

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
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("id", id);
  revalidatePath("/", "layout");
}

export type LiveNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

/**
 * Nouvelles notifications depuis `since` (RLS : uniquement celles de
 * l'utilisateur, dans l'établissement actif). Sert à l'affichage en direct.
 */
export async function pollNotifications(
  since: string,
): Promise<LiveNotification[]> {
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

const B64URL = /^[A-Za-z0-9_-]+$/;

/** Enregistre cet appareil pour les notifications push (compte connecté uniquement). */
export async function registerPushDevice(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ ok: boolean; message: string }> {
  const context = await getSessionContext();
  if (!context)
    return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  const { endpoint, p256dh, auth } = input ?? {};
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 1000
  )
    return { ok: false, message: "Appareil non pris en charge." };
  if (
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !B64URL.test(p256dh) ||
    !B64URL.test(auth)
  )
    return { ok: false, message: "Appareil non pris en charge." };
  const supabase = await createClient();
  const agent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: agent ?? undefined,
  });
  if (error)
    return {
      ok: false,
      message: dbErrorMessage(error, "Activation impossible."),
    };
  return { ok: true, message: "Notifications activées sur cet appareil." };
}

export async function unregisterPushDevice(
  endpoint: string,
): Promise<{ ok: boolean; message: string }> {
  const context = await getSessionContext();
  if (!context || typeof endpoint !== "string")
    return { ok: false, message: "Votre session a expiré." };
  const supabase = await createClient();
  // RLS : seul un appareil du compte connecté peut être retiré.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true, message: "Notifications désactivées sur cet appareil." };
}
