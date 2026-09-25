/**
 * MODULE 2 — FORMATION PROFESSIONNELLE. Fichier partagé serveur / navigateur :
 * réglages du centre (organizations.settings.training) et libellés. Aucun accès
 * aux données ici.
 */
import type { Tone } from "@/lib/labels";

export type TrainingConfig = {
  groupsEnabled: boolean;
  lateToleranceMinutes: number;
  openBeforeMinutes: number;
  entryWithoutCourse: boolean;
};

export const TRAINING_ORG_TYPES = ["vocational_center", "technical_center"] as const;

export function isTrainingOrg(type: string | null | undefined): boolean {
  return (TRAINING_ORG_TYPES as readonly (string | null | undefined)[]).includes(type);
}

/** Réglages effectifs (null : établissement hors Module Formation professionnelle). */
export function trainingConfigOf(type: string | null | undefined, settings: unknown): TrainingConfig | null {
  if (!isTrainingOrg(type)) return null;
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).training : null) as Record<string, unknown> | null;
  const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return {
    groupsEnabled: raw?.groups_enabled === true,
    lateToleranceMinutes: num(raw?.late_tolerance_minutes, 5),
    openBeforeMinutes: num(raw?.open_before_minutes, 30),
    entryWithoutCourse: raw?.entry_without_course === true,
  };
}

export const COMPETENCY_LEVELS: Record<string, { label: string; tone: Tone }> = {
  not_acquired: { label: "Non acquise", tone: "danger" },
  in_progress: { label: "En cours d'acquisition", tone: "warning" },
  acquired: { label: "Acquise", tone: "success" },
  mastered: { label: "Maîtrisée", tone: "primary" },
};

export const INTERNSHIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  planned: { label: "Prévu", tone: "info" },
  ongoing: { label: "En cours", tone: "primary" },
  completed: { label: "Terminé", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const BADGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Actif", tone: "success" },
  revoked: { label: "Désactivé", tone: "danger" },
};

/** État d'une session selon ses dates. */
export function sessionState(session: { starts_on: string | null; ends_on: string | null }, today: string): { key: "planned" | "ongoing" | "finished"; label: string; tone: Tone } {
  if (session.starts_on && session.starts_on > today) return { key: "planned", label: "À venir", tone: "info" };
  if (session.ends_on && session.ends_on < today) return { key: "finished", label: "Terminée", tone: "neutral" };
  return { key: "ongoing", label: "En cours", tone: "success" };
}

/** Pièces du dossier de l'apprenant (file_objects.category). */
export const LEARNER_DOCUMENT_CATEGORIES: Record<string, string> = {
  piece_identite: "Pièce d'identité",
  photo_identite: "Photo d'identité",
  dossier_inscription: "Dossier d'inscription",
  engagement: "Engagement signé",
  diplome: "Diplôme / attestation antérieure",
  autre: "Autre document",
};

/** Motifs de refus du scan unifié (titres courts affichés sur la tablette). */
export const SCAN_REJECTIONS: Record<string, string> = {
  unknown_badge: "QR invalide",
  revoked_badge: "Badge désactivé",
  other_organization: "Autre établissement",
  inactive_staff: "Utilisateur non autorisé",
  inactive_learner: "Apprenant inactif",
  no_active_session: "Aucune session en cours",
  no_course: "Aucun cours prévu",
  wrong_room: "Mauvaise salle",
  duplicate: "Scan déjà enregistré",
  already_checked_in: "Déjà pointé",
};

export function formatMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
