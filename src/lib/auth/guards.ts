import "server-only";

import { notFound, redirect } from "next/navigation";

import type { Permission } from "@/config/permissions";
import { mfaRequirement } from "@/lib/auth/security";
import { can, getSessionContext, type OrganizationSummary, type SessionContext } from "@/lib/auth/session";
import { vocabularyFor, type Vocabulary } from "@/lib/vocabulary";

export type OrgSessionContext = SessionContext & { organization: OrganizationSummary };

/**
 * Exige une session valide (sinon redirection vers la connexion). Double
 * authentification : code attendu → vérification ; obligatoire mais non
 * activée → page Sécurité. (La base refuse de toute façon tout droit à une
 * session non vérifiée : ceci n'est que le parcours.)
 */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) {
    redirect("/connexion");
  }
  const mfa = await mfaRequirement();
  if (mfa === "verify") redirect("/connexion/verification");
  if (mfa === "enroll") redirect("/securite?obligatoire=1");
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

/**
 * Séparation des modules : une page propre au module scolaire (bulletins,
 * résultats annuels, passage d'année, règles de calcul) n'existe pas pour un
 * centre de formation ni pour une université — « Page introuvable », comme une
 * école qui ouvrirait une page universitaire.
 */
export async function requireModule(...families: Vocabulary["family"][]): Promise<OrgSessionContext> {
  const context = await requireOrganization();
  if (!families.includes(vocabularyFor(context.organization.type).family)) notFound();
  return context;
}
