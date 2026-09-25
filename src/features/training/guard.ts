import "server-only";

import { notFound } from "next/navigation";

import type { Permission } from "@/config/permissions";
import { requireOrganization, type OrgSessionContext } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

import { isTrainingOrg, trainingConfigOf, type TrainingConfig } from "./config";

/**
 * Pages du module Formation professionnelle : établissement de formation et une
 * des permissions demandées (sinon 404, comme les autres modules non disponibles).
 */
export async function requireTraining(...anyOf: Permission[]): Promise<OrgSessionContext & { training: TrainingConfig }> {
  const context = await requireOrganization();
  if (!isTrainingOrg(context.organization.type)) notFound();
  if (anyOf.length > 0 && !anyOf.some((p) => can(context, p))) notFound();
  return { ...context, training: trainingConfigOf(context.organization.type, context.organization.settings)! };
}
