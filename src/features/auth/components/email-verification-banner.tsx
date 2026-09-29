import { MailWarning } from "lucide-react";

import { ResendVerificationButton } from "@/features/auth/components/resend-verification-button";
import { createClient } from "@/lib/supabase/server";

/**
 * Établissement dont l'adresse e-mail n'est pas encore vérifiée : lecture seule
 * (appliquée par la base) jusqu'au clic sur le lien reçu par e-mail.
 */
export async function EmailVerificationBanner({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("email_verification_state", { p_org: organizationId });
  if (!(data as { pending?: boolean } | null)?.pending) return null;
  return (
    <div role="alert" className="anim-fade-up flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning">
      <span className="inline-flex items-center gap-2">
        <MailWarning className="size-4 shrink-0" aria-hidden /> Activez votre établissement : cliquez sur le lien reçu par e-mail. En attendant, tout est consultable mais rien ne peut être modifié.
      </span>
      <ResendVerificationButton />
    </div>
  );
}
