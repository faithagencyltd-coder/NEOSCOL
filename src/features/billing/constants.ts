import type { Tone } from "@/lib/labels";

/** Libellés des abonnements NéoScol (SYSTÈME A). Les valeurs sont fixées par la base. */
export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone; description: string }> = {
  TRIALING: { label: "Essai gratuit", tone: "info", description: "Toutes les fonctionnalités de la formule sont accessibles pendant l'essai." },
  ACTIVE: { label: "Actif", tone: "success", description: "Abonnement payé et en cours." },
  PAST_DUE: { label: "À régler", tone: "warning", description: "L'échéance est dépassée : réglez l'abonnement pour éviter toute restriction." },
  GRACE_PERIOD: { label: "Délai de grâce", tone: "warning", description: "Accès maintenu pour quelques jours encore, en attente du paiement." },
  RESTRICTED: { label: "Restreint", tone: "danger", description: "Lecture seule jusqu'au paiement. Aucune donnée n'est supprimée." },
  CANCELLED: { label: "Annulé", tone: "neutral", description: "Abonnement terminé à votre demande. Données conservées, en lecture seule." },
  EXPIRED: { label: "Expiré", tone: "danger", description: "Abonnement expiré. Données conservées ; un paiement réactive tout immédiatement." },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  PENDING: { label: "À payer", tone: "warning" },
  PAID: { label: "Payée", tone: "success" },
  FAILED: { label: "Échec", tone: "danger" },
  CANCELLED: { label: "Annulée", tone: "neutral" },
  REFUNDED: { label: "Remboursée", tone: "info" },
};

export const TRANSACTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "En attente", tone: "neutral" },
  PROCESSING: { label: "En cours", tone: "info" },
  SUCCESS: { label: "Réussi", tone: "success" },
  FAILED: { label: "Échoué", tone: "danger" },
  CANCELLED: { label: "Abandonné", tone: "neutral" },
  REFUNDED: { label: "Remboursé", tone: "info" },
};

export const INTERVAL_LABELS: Record<string, { label: string; short: string; period: string }> = {
  MONTHLY: { label: "Mensuel", short: "/mois", period: "1 mois" },
  YEARLY: { label: "Annuel", short: "/an", period: "12 mois" },
};

export const PROVIDER_LABELS: Record<string, string> = {
  paydunya: "PayDunya",
  simulation: "Paiement simulé (test)",
  manual: "Paiement manuel",
};

export const INVOICE_KIND: Record<string, string> = {
  subscription: "Souscription",
  renewal: "Renouvellement",
  plan_change: "Changement de formule",
  manual: "Émise par NéoScol",
};

export const EVENT_LABELS: Record<string, string> = {
  trial_started: "Essai gratuit démarré",
  plan_selected: "Formule choisie",
  checkout_created: "Paiement ouvert chez le fournisseur",
  payment_pending: "Paiement initié",
  payment_success: "Paiement confirmé",
  payment_failed: "Paiement échoué",
  payment_cancelled: "Paiement abandonné",
  invoice_created: "Facture créée",
  invoice_paid: "Facture payée",
  invoice_cancelled: "Facture annulée",
  subscription_activated: "Abonnement activé",
  subscription_renewed: "Abonnement renouvelé",
  subscription_cancelled: "Annulation demandée",
  subscription_resumed: "Annulation retirée",
  subscription_past_due: "Échéance dépassée",
  subscription_grace_period: "Délai de grâce",
  subscription_restricted: "Accès restreint (lecture seule)",
  subscription_expired: "Abonnement expiré",
  subscription_reactivated: "Abonnement réactivé",
  plan_changed: "Changement de formule",
  manual_payment: "Paiement manuel validé",
  notification_sent: "Notification envoyée",
};

export const FEATURE_LABELS: Record<string, string> = {
  students: "Élèves, étudiants, apprenants",
  teachers: "Enseignants et personnel",
  parents: "Parents et portail famille",
  finance: "Finances de l'établissement",
  attendance: "Présences et pointage",
  grades: "Notes et évaluations",
  bulletins: "Bulletins et relevés",
  documents: "Documents officiels (PDF)",
  qr: "Badges et vérification QR",
  reports: "Rapports et exports",
  assistant: "Assistant intelligent",
  communication: "Annonces et messagerie",
  pwa: "Application mobile (PWA)",
  multi_establishment: "Multi-établissements (vue groupe)",
};

export const PLAN_ACCENTS: Record<string, string> = {
  MATERNELLE_PRIMAIRE: "from-sky-500 to-cyan-400",
  COLLEGE_LYCEE: "from-blue-600 to-sky-500",
  CENTRE_FORMATION: "from-emerald-500 to-teal-400",
  UNIVERSITE: "from-indigo-600 to-blue-500",
  ENTERPRISE: "from-[#0b2559] to-[#1d63ed]",
};
