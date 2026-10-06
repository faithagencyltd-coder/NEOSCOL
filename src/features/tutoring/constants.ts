/** Libellés de NEOSCOOL Tutor Match. */
export const TUTOR_MODES: Record<string, string> = { home: "À domicile", online: "En ligne", center: "Dans un lieu d'accueil" };
export const RATE_UNITS: Record<string, string> = { hour: "heure", session: "séance", month: "mois" };
export const TUTOR_LANGUAGES: Record<string, string> = { fr: "Français", en: "Anglais", ar: "Arabe", es: "Espagnol", pt: "Portugais", de: "Allemand" };

export const TUTOR_STATUS = {
  pending: { label: "En attente de validation", tone: "warning" as const },
  approved: { label: "Visible", tone: "success" as const },
  hidden: { label: "Masquée par vous", tone: "neutral" as const },
  suspended: { label: "Suspendue", tone: "danger" as const },
  rejected: { label: "Refusée", tone: "danger" as const },
};

export const VERIFICATION = {
  unverified: { label: "Qualifications déclarées (non vérifiées)", tone: "neutral" as const },
  requested: { label: "Vérification demandée", tone: "warning" as const },
  verified: { label: "Profil vérifié par NeoScool", tone: "success" as const },
  rejected: { label: "Vérification refusée", tone: "danger" as const },
};

export const REQUEST_STATUS = {
  sent: { label: "Envoyée", tone: "info" as const },
  accepted: { label: "Acceptée par le tuteur", tone: "primary" as const },
  proposed: { label: "Autre disponibilité proposée", tone: "warning" as const },
  declined: { label: "Refusée par le tuteur", tone: "neutral" as const },
  confirmed: { label: "Modalités confirmées", tone: "success" as const },
  cancelled: { label: "Annulée", tone: "neutral" as const },
  closed: { label: "Terminée", tone: "neutral" as const },
};

export const SESSION_STATUS = {
  planned: { label: "Prévue", tone: "info" as const },
  done: { label: "Effectuée", tone: "success" as const },
  cancelled: { label: "Annulée", tone: "neutral" as const },
};

export const money = (v: number, c = "XOF") => `${v.toLocaleString("fr-FR")} ${c === "XOF" ? "FCFA" : c}`;
export const splitList = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
