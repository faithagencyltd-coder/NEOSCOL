import { Wrench } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import type { MaintenanceState } from "@/lib/maintenance";

/** Écran affiché aux utilisateurs pendant une maintenance de la plateforme : aucune donnée n'est touchée. */
export function MaintenanceScreen({ state }: { state: MaintenanceState }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4" data-testid="maintenance-screen">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <Logo />
        <span className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <Wrench className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">Maintenance en cours</h1>
        <p className="text-muted-foreground">{state.message}</p>
        {state.ends_at ? <p className="text-sm">Retour prévu : {new Date(state.ends_at).toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })} (GMT).</p> : null}
        <p className="text-xs text-muted-foreground">Vos données sont conservées. Rechargez la page dans quelques minutes.</p>
      </div>
    </main>
  );
}
