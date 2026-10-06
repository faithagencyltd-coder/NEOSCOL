import { Lock } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { FEATURE_FLAGS, featureEnabled, type PublicModule } from "@/lib/features";
import type { OrganizationSummary } from "@/lib/auth/session";

/** Module public fermé (par défaut) : message clair, aucune action possible. */
export function moduleClosed(organization: OrganizationSummary, module: PublicModule) {
  if (featureEnabled(organization, module)) return null;
  const label = FEATURE_FLAGS.find((f) => f.key === module)?.label ?? module;
  return (
    <EmptyState
      icon={Lock}
      title={`${label} n'est pas encore ouvert pour votre établissement`}
      description="L'équipe NeoScool ouvre ces services progressivement. Contactez l'assistance pour en bénéficier."
    />
  );
}
