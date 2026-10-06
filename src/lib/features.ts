import type { OrganizationSummary } from "@/lib/auth/session";

export type FeatureFlag =
  | "medical_records" | "ranking" | "conduct" | "parent_portal" | "student_portal" | "messaging" | "assistant" | "voice_checkin"
  | PublicModule;

/** Modules de l'écosystème public : fermés tant que le Super Admin ne les ouvre pas (Contrôle des modules). */
export type PublicModule = "discover" | "promotion" | "media_kit" | "leads" | "opportunities" | "external_ads";
export const PUBLIC_MODULES: readonly PublicModule[] = ["discover", "promotion", "media_kit", "leads", "opportunities", "external_ads"];
export const isPublicModule = (key: string): key is PublicModule => (PUBLIC_MODULES as readonly string[]).includes(key);

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
  { key: "discover", label: "NeoScool Discover", hint: "Fiche publique de l'établissement dans l'annuaire NeoScool." },
  { key: "leads", label: "NeoScool Leads", hint: "Demandes d'information reçues par la fiche publique et les campagnes." },
  { key: "promotion", label: "NeoScool Promotion", hint: "Campagnes de promotion (inscriptions, formations, événements)." },
  { key: "media_kit", label: "NeoScool Media Kit", hint: "Visuels prêts à publier (affiches, réseaux sociaux, QR codes)." },
  { key: "opportunities", label: "NeoScool Opportunities", hint: "Offres de recrutement et candidatures." },
  { key: "external_ads", label: "Publicité externe", hint: "Demandes de campagnes Facebook, Instagram, TikTok (sans lancement automatique)." },
];

function flags(organization: OrganizationSummary, key: "features" | "platform_features"): Record<string, unknown> {
  const settings = organization.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const value = (settings as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Option de la formule correspondant à une fonctionnalité (les autres ne dépendent pas de la formule). */
const PLAN_FEATURE: Partial<Record<FeatureFlag, string>> = {
  parent_portal: "parents",
  student_portal: "student_portal",
  messaging: "communication",
  assistant: "assistant",
  voice_checkin: "voice_checkin",
};

/** Fonctionnalité non incluse dans la formule souscrite (Super Admin › Formules). */
export function featureExcludedByPlan(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  const code = PLAN_FEATURE[flag];
  return Boolean(code && organization.plan_features && organization.plan_features[code] === false);
}

/**
 * Arrêt forcé par le Super Admin (prime sur le réglage de l'établissement) :
 * pour cet établissement, ou par une règle plateforme / pays / type (Contrôle des modules).
 */
export function featureLockedByPlatform(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  return flags(organization, "platform_features")[flag] === false || organization.platform_locked_features?.[flag] === false;
}

/**
 * Fonctionnalité active pour l'établissement : ni arrêtée par la plateforme
 * (settings.platform_features), ni désactivée par l'établissement (settings.features).
 * Activée par défaut.
 */
export function featureEnabled(organization: OrganizationSummary, flag: FeatureFlag): boolean {
  if (featureLockedByPlatform(organization, flag) || featureExcludedByPlan(organization, flag)) return false;
  return flags(organization, "features")[flag] !== false;
}
