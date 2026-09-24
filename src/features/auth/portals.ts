import { GraduationCap, Presentation, ShieldCheck, Users, type LucideIcon } from "lucide-react";

/**
 * Portails d'un établissement, accessibles par un lien unique partageable
 * (/acces/CODE). Le portail choisit la méthode de connexion et le type de
 * compte attendu ; les droits restent ceux des rôles attribués.
 */
export type PortalKind = "parent" | "enseignant" | "eleve" | "personnel";

export type PortalTarget = { code: string; kind: PortalKind };

export const PORTAL_KINDS: readonly PortalKind[] = ["parent", "enseignant", "eleve", "personnel"];

/** Rôles (personas) acceptés par chaque portail. */
export const PORTAL_PERSONAS: Record<PortalKind, readonly string[]> = {
  parent: ["parent"],
  enseignant: ["teacher", "staff"],
  eleve: ["student"],
  personnel: ["staff", "teacher"],
};

export const PORTALS: Record<PortalKind, { label: string; sub: string; icon: LucideIcon; method: string }> = {
  parent: { label: "Portail Parent", sub: "Parents et tuteurs", icon: Users, method: "Téléphone, nom, prénom et code SMS" },
  enseignant: { label: "Portail Enseignant / Formateur", sub: "Enseignants, professeurs, formateurs", icon: Presentation, method: "E-mail ou matricule et mot de passe" },
  eleve: { label: "Portail Élève / Étudiant", sub: "Élèves, étudiants, apprenants", icon: GraduationCap, method: "Matricule, date de naissance et mot de passe" },
  personnel: { label: "Portail Administration", sub: "Direction, secrétariat, comptabilité", icon: ShieldCheck, method: "E-mail ou matricule et mot de passe" },
};

export function isPortalKind(value: unknown): value is PortalKind {
  return typeof value === "string" && (PORTAL_KINDS as readonly string[]).includes(value);
}

/** Code établissement normalisé (A-Z, 0-9, 2 à 10 caractères) ou null. */
export function normalizeOrgCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{2,10}$/.test(code) ? code : null;
}
