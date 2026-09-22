/** Résultat standard d'une Server Action consommée avec useActionState. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

export const initialActionState: ActionResult<never> | null = null;
