"use client";

import { useActionState, type ReactNode } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/utils/action-result";

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Formulaire relié à une action serveur : retour affiché (toast + message), saisie conservée en cas d'erreur. */
export function FeeForm({ action, children, className, testId, showSuccess = false }: { action: Action; children: ReactNode; className?: string; testId?: string; showSuccess?: boolean }) {
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  return (
    <ActionForm dispatch={dispatch} pending={pending} className={className} data-testid={testId}>
      {children}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      {state && state.ok && showSuccess && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </ActionForm>
  );
}
