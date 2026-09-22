import "server-only";

import type { Permission } from "@/config/permissions";
import { can, getSessionContext, type OrganizationSummary, type SessionContext } from "@/lib/auth/session";

export type AuthorizedContext = SessionContext & { organization: OrganizationSummary };

/**
 * Garde des Server Actions : session + établissement actif + une des permissions.
 * Renvoie un message d'erreur au lieu de rediriger (l'action l'affiche dans le formulaire).
 * La RLS reste la barrière finale côté base.
 */
export async function authorize(
  ...permissions: Permission[]
): Promise<{ ok: true; context: AuthorizedContext } | { ok: false; message: string }> {
  const context = await getSessionContext();
  if (!context) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  if (!context.organization) return { ok: false, message: "Aucun établissement actif." };
  if (permissions.length > 0 && !permissions.some((p) => can(context, p))) {
    return { ok: false, message: "Vous n'avez pas les droits nécessaires pour cette opération." };
  }
  return { ok: true, context: context as AuthorizedContext };
}
