"use client";

import { useActionState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import type { ActionResult } from "@/lib/utils/action-result";

type ServerAction<T> = (state: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/**
 * useActionState + retour visuel centralisé : toast de succès ou d'erreur,
 * rappel onSuccess (fermer une fenêtre, réinitialiser, rediriger…).
 * Les erreurs de validation restent aussi affichées dans le formulaire.
 */
export function useFeedbackAction<T = undefined>(
  action: ServerAction<T>,
  options: { onSuccess?: (result: ActionResult<T>) => void; toastSuccess?: boolean; toastError?: boolean } = {},
) {
  const { onSuccess, toastSuccess = true, toastError = true } = options;
  return useActionState(async (prev: ActionResult<T> | null, formData: FormData) => {
    const result = await action(prev, formData);
    if ((result.ok && toastSuccess) || (!result.ok && toastError)) notifyResult(result);
    if (result.ok) onSuccess?.(result);
    return result;
  }, null);
}
