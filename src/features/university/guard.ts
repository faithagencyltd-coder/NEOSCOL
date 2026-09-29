import "server-only";

import { notFound } from "next/navigation";

import type { Permission } from "@/config/permissions";
import { requireOrganization, type OrgSessionContext } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

import { isHigherOrg, universityConfigOf, type UniversityConfig, type UniversityFeature } from "./config";

/**
 * Pages du Module 3 : établissement d'enseignement supérieur, une des permissions
 * demandées et, le cas échéant, la fonctionnalité activée (sinon 404).
 */
export async function requireUniversity(
  permissions: Permission[],
  feature?: UniversityFeature,
): Promise<OrgSessionContext & { university: UniversityConfig }> {
  const context = await requireOrganization();
  if (!isHigherOrg(context.organization.type)) notFound();
  if (permissions.length > 0 && !permissions.some((p) => can(context, p))) notFound();
  const university = universityConfigOf(context.organization.type, context.organization.settings)!;
  if (feature && !university.features[feature]) notFound();
  return { ...context, university };
}
