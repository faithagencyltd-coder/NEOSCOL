import type { OrganizationSummary } from "@/lib/auth/session";

export type FeatureFlag = "medical_records" | "ranking" | "conduct" | "parent_portal" | "student_portal" | "messaging" | "assistant" | "voice_checkin";

/** Fonctionnalités réglables par établissement (et arrêtables par le Super Admin). */
export const FEATURE_FLAGS: { key: FeatureFlag; label: string; hint: string }[] = [
  { key: "parent_portal", label: "Portail parent", hint: "Les parents consultent notes, présences, finances et documents." },
  { key: "student_portal", label: "Portail élève / apprenant / étudiant", hint: "Espace personnel de l'élève sur téléphone." },
  { key: "messaging", label: "Messagerie", hint: "Échanges entre le personnel et les familles." },
  { key: "assistant", label: "Assistant IA", hint: "Questions en langage naturel sur les données de l'établissement." },
  { key: "voice_checkin", label: "Messages vocaux de la tablette", hint: "La tablette annonce les arrivées à voix haute." },
  { key: "medical_records", label: "Informations médicales", hint: "Fiche santé dans le dossier de l'élève." },
  { key: "ranking", label: "Classement (rang)", hint: "Rang affiché sur les bulletins et relevés." },
  { key: "conduct", label: "Discipline et conduite", hint: "Suivi de la conduite des élèves." },
];

function flags(organization: OrganizationSummary, key: "features" | "platform_features"): Record<string, unknown> {
  const settings = organization.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const value = (settings as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Arrêt forcé par le Super Admin pour cet établissement (prime sur son propre réglage). */
export function featureLockedByPlatform(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  return flags(organization, "platform_features")[flag] === false;
}

/**
 * Fonctionnalité active pour l'établissement : ni arrêtée par la plateforme
 * (settings.platform_features), ni désactivée par l'établissement (settings.features).
 * Activée par défaut.
 */
export function featureEnabled(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  if (featureLockedByPlatform(organization, flag)) return false;
  return flags(organization, "features")[flag] !== false;
}
