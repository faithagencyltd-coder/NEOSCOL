import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { VoiceSettingsForm } from "@/features/voice-checkin/components/voice-settings-form";
import type { VoiceConfig } from "@/features/voice-checkin/messages";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages vocaux" };

/** Voice Check-in : messages prononcés par la tablette de pointage à l'arrivée. */
export default async function VoiceCheckinPage() {
  const context = await requirePermission("voice_checkin.manage");
  const supabase = await createClient();
  const { data } = await supabase.rpc("voice_checkin_config", { p_org: context.organization.id });
  const config = data as unknown as VoiceConfig;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Messages vocaux à l'arrivée"
        description="Voice Check-in : la tablette de pointage annonce l'arrivée, le retard, le départ ou le refus, dans la langue de l'établissement."
      />
      <VoiceSettingsForm config={config} />
    </div>
  );
}
