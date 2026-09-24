"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Toaster, toast } from "sonner";

import type { ActionResult } from "@/lib/utils/action-result";

/**
 * Système global de notifications (succès, attention, erreur, information) :
 * glissement + fondu, empilement, fermeture automatique. Un seul point
 * d'entrée pour toute l'application : notify.* et notifyResult().
 */
export function AnimatedToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      duration={4200}
      gap={10}
      icons={{
        success: <CheckCircle2 className="size-5 text-success anim-pop" aria-hidden />,
        error: <XCircle className="size-5 text-danger anim-pop" aria-hidden />,
        warning: <AlertTriangle className="size-5 text-warning anim-pop" aria-hidden />,
        info: <Info className="size-5 text-info anim-pop" aria-hidden />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !border-border !bg-surface !text-foreground !shadow-xl !font-sans",
          title: "!font-semibold",
          description: "!text-muted-foreground",
          success: "!border-l-4 !border-l-[var(--success)]",
          error: "!border-l-4 !border-l-[var(--danger)]",
          warning: "!border-l-4 !border-l-[var(--warning)]",
          info: "!border-l-4 !border-l-[var(--info)]",
        },
      }}
    />
  );
}

export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  error: (title: string, description?: string) => toast.error(title, { description }),
  warning: (title: string, description?: string) => toast.warning(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
};

/** Affiche le résultat d'une Server Action (succès ou erreur). */
export function notifyResult(result: ActionResult<unknown> | null | undefined) {
  if (!result) return;
  if (result.ok) notify.success(result.message ?? "Enregistré.");
  else notify.error(result.message ?? "L'opération a échoué.");
}
