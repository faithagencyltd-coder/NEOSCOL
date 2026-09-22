"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/guards";
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
