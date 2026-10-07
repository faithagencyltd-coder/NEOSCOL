import { GraduationCap, Presentation, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { vocabularyFor } from "@/lib/vocabulary";

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
  parent: { label: "Portail Parent", sub: "Parents et tuteurs", icon: Users, method: "Téléphone et mot de passe" },
  enseignant: { label: "Portail Enseignant / Formateur", sub: "Enseignants, professeurs, formateurs", icon: Presentation, method: "E-mail ou matricule et mot de passe" },
  eleve: { label: "Portail Élève / Étudiant", sub: "Élèves, étudiants, apprenants", icon: GraduationCap, method: "Matricule, date de naissance et mot de passe" },
  personnel: { label: "Portail Administration", sub: "Direction, secrétariat, comptabilité", icon: ShieldCheck, method: "E-mail ou matricule et mot de passe" },
};

type PortalInfo = { label: string; sub: string; icon: LucideIcon; method: string };

/**
 * Portails nommés selon le module de l'établissement (séparation des modules) :
 * « Portail Enseignant » + « Portail Élève » (école), « Portail Formateur » +
 * « Portail Apprenant » (formation), « Portail Enseignant » + « Portail
 * Étudiant » (université). Sans établissement connu : libellés généraux.
 */
export function portalsFor(organizationType: string | null | undefined): Record<PortalKind, PortalInfo> {
  if (!organizationType) return PORTALS;
  const v = vocabularyFor(organizationType);
  const teacher =
    v.family === "training"
      ? { label: "Portail Formateur", sub: "Formateurs et formatrices" }
      : v.family === "higher"
        ? { label: "Portail Enseignant", sub: "Enseignants et chargés de cours" }
        : { label: "Portail Enseignant", sub: "Enseignants et professeurs" };
  const student =
    v.family === "training"
      ? { label: "Portail Apprenant", sub: "Apprenants" }
      : v.family === "higher"
        ? { label: "Portail Étudiant", sub: "Étudiants" }
        : { label: "Portail Élève", sub: "Élèves" };
  return { ...PORTALS, enseignant: { ...PORTALS.enseignant, ...teacher }, eleve: { ...PORTALS.eleve, ...student } };
}

export function isPortalKind(value: unknown): value is PortalKind {
  return typeof value === "string" && (PORTAL_KINDS as readonly string[]).includes(value);
}

/** Code établissement normalisé (A-Z, 0-9, 2 à 10 caractères) ou null. */
export function normalizeOrgCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{2,10}$/.test(code) ? code : null;
}
