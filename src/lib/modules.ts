import type { Vocabulary } from "@/lib/vocabulary";

type Family = Vocabulary["family"];

/**
 * Séparation des modules : droits propres à un module (les autres sont
 * communs aux trois). Un établissement ne voit que les droits de son module ;
 * la base de données reste la seule barrière de sécurité.
 */
const PERMISSION_FAMILIES: Record<string, readonly Family[]> = {
  "report_cards.manage": ["school"],
  "report_cards.publish": ["school"],
  "deliberations.read": ["higher"],
  "deliberations.manage": ["higher"],
  "theses.manage": ["higher"],
  "diplomas.manage": ["higher"],
};

export function permissionInModule(code: string, family: Family): boolean {
  const families = PERMISSION_FAMILIES[code];
  return !families || families.includes(family);
}

/** Rôles propres à un module : masqués ailleurs tant qu'aucun compte ne les utilise (jamais supprimés). */
const ROLE_FAMILIES: Record<string, readonly Family[]> = {
  training_manager: ["training"],
  jury: ["higher"],
  program_head: ["higher"],
  registrar: ["higher"],
};

export function roleInModule(key: string, family: Family, memberCount = 0): boolean {
  const families = ROLE_FAMILIES[key];
  return !families || families.includes(family) || memberCount > 0;
}
