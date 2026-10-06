import { SupportChat } from "@/features/support/components/support-chat";
import { createClient } from "@/lib/supabase/server";

/** Affiche l'assistant NeoScool si le Super Admin l'a activé pour cet emplacement (site public ou portails). */
export async function SupportChatMount({ placement, locale = "fr" }: { placement: "site" | "app" | "portal"; locale?: "fr" | "en" }) {
  let settings: { chatbot_enabled: boolean; chatbot_on_site: boolean; chatbot_in_portals: boolean; welcome_message: string; handoff_message: string } | null = null;
  try {
    const { data } = await (await createClient()).from("support_settings").select("chatbot_enabled, chatbot_on_site, chatbot_in_portals, welcome_message, handoff_message").eq("id", 1).maybeSingle();
    settings = data;
  } catch {
    settings = null;
  }
  if (!settings?.chatbot_enabled || (placement === "site" ? !settings.chatbot_on_site : !settings.chatbot_in_portals)) return null;
  return <SupportChat welcome={settings.welcome_message} handoffLabel={settings.handoff_message} locale={locale} placement={placement === "app" ? "app" : "site"} />;
}
