import type { OrganizationSummary } from "@/lib/auth/session";

export type FeatureFlag = "medical_records" | "ranking" | "conduct" | "parent_portal" | "student_portal" | "messaging";

/** Fonctionnalité activée par l'établissement (organizations.settings.features). Activée par défaut. */
export function featureEnabled(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  const settings = organization.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return true;
  const features = (settings as Record<string, unknown>).features;
  if (!features || typeof features !== "object" || Array.isArray(features)) return true;
  return (features as Record<string, unknown>)[flag] !== false;
}
