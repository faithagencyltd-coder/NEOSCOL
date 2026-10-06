/** Assistance et incidents : libellés partagés (établissement et console). */
export const TICKET_CATEGORIES: Record<string, string> = {
  connexion: "Connexion / accès",
  paiement: "Paiements / abonnement",
  donnees: "Données (élèves, notes…)",
  documents: "Documents / PDF",
  notifications: "Notifications / messages",
  bug: "Problème technique",
  question: "Question",
  autre: "Autre",
};

export const TICKET_SEVERITIES: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "danger" }> = {
  low: { label: "Faible", tone: "neutral" },
  medium: { label: "Moyenne", tone: "info" },
  high: { label: "Élevée", tone: "warning" },
  critical: { label: "Critique", tone: "danger" },
};

export const TICKET_STATUSES: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "primary" }> = {
  open: { label: "Ouverte", tone: "warning" },
  in_progress: { label: "En cours", tone: "primary" },
  waiting: { label: "En attente de votre réponse", tone: "info" },
  resolved: { label: "Résolue", tone: "success" },
  closed: { label: "Fermée", tone: "neutral" },
};

export const options = (map: Record<string, string | { label: string }>) =>
  Object.entries(map).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));
