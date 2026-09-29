import { IdCard } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { MyBadgeView } from "@/features/badges/components/my-badge-view";
import type { MyBadge } from "@/features/badges/types";
import { createClient } from "@/lib/supabase/server";

/** Contenu commun de « Mon badge » (application et portail). */
export async function MyBadgeContent({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_badge", { p_org: organizationId });
  const badge = data as MyBadge | null;
  if (!badge) {
    return (
      <EmptyState
        icon={IdCard}
        title="Aucun badge actif"
        description="Votre badge n'a pas encore été émis ou a été désactivé. Adressez-vous à l'administration de l'établissement."
      />
    );
  }
  return <MyBadgeView badge={badge} photoUrl={badge.photo_file_id ? `/api/fichiers/${badge.photo_file_id}` : null} />;
}
