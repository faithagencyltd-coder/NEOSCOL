"use client";

import { Flag } from "lucide-react";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Button } from "@/components/ui/button";
import { reportContent } from "@/features/ecosystem/public-actions";

/** « Signaler » : transmis à la modération NeoScool (compte requis, contre les abus). */
export function ReportButton({ targetType, targetId, reasons, signedIn, path }: { path: string; targetType: "profile" | "campaign" | "opportunity"; targetId: string; reasons: { value: string; label: string }[]; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <a href={`/connexion?suite=${encodeURIComponent(path)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <Flag className="size-3.5" aria-hidden /> Signaler (connexion requise)
      </a>
    );
  }
  return (
    <QuickFormDialog
      title="Signaler ce contenu"
      description="L'équipe NeoScool examine chaque signalement. N'indiquez pas d'informations sensibles."
      submitLabel="Envoyer le signalement"
      action={reportContent}
      hidden={{ target_type: targetType, target_id: targetId }}
      trigger={
        <Button variant="ghost" size="sm" data-testid="report-button">
          <Flag aria-hidden /> Signaler
        </Button>
      }
      fields={[
        { name: "reason", label: "Motif", type: "select", required: true, options: reasons, wide: true },
        { name: "details", label: "Précisions", type: "textarea", wide: true },
      ]}
    />
  );
}
