import "server-only";

import { notFound, redirect } from "next/navigation";

import type { Permission } from "@/config/permissions";
import { can, getSessionContext, type OrganizationSummary, type SessionContext } from "@/lib/auth/session";

export type OrgSessionContext = SessionContext & { organization: OrganizationSummary };

/** Exige une session valide (sinon redirection vers la connexion). */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) {
    redirect("/connexion");
  }
  return context;
}

/** Exige une session ET un établissement actif accessible. */
export async function requireOrganization(): Promise<OrgSessionContext> {
  const context = await requireSession();
  if (!context.organization) {
    redirect("/acces-indisponible");
  }
  return context as OrgSessionContext;
}

/** Exige une permission ; renvoie 404 pour ne pas révéler l'existence de la ressource. */
export async function requirePermission(permission: Permission): Promise<OrgSessionContext> {
  const context = await requireOrganization();
  if (!can(context, permission)) {
    notFound();
  }
  return context;
}
