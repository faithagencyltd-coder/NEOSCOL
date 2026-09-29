import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";

/** Activation / désactivation d'un élément du référentiel (rien n'est supprimé). */
export function ToggleButton({
  id,
  active,
  action,
  label,
  onLabel = "Activer",
  offLabel = "Désactiver",
}: {
  id: string;
  active: boolean;
  action: (s: never, f: FormData) => Promise<unknown>;
  label: string;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm">
          {active ? offLabel : onLabel}
        </Button>
      }
      title={`${active ? offLabel : onLabel} ${label} ?`}
      description="Rien n'est supprimé : l'historique (étudiants, résultats, présences) est conservé."
      confirmLabel={active ? offLabel : onLabel}
      action={action as never}
      fields={{ id, active: active ? "false" : "true" }}
    />
  );
}
