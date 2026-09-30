"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils/search-params";

/** Masque une annonce de la plateforme pour l'utilisateur connecté. */
export async function dismissAnnouncement(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.rpc("dismiss_platform_announcement", { p_id: id });
  revalidatePath("/", "layout");
}
