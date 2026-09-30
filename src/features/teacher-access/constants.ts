import type { Tone } from "@/lib/labels";

/** États d'accès d'un enseignant à un établissement (calculés en base). */
export const ACCESS_STATE: Record<string, { label: string; tone: Tone; hint: string }> = {
  not_required: { label: "Accès inclus", tone: "success", hint: "Aucun abonnement supplémentaire n'est demandé pour cet établissement." },
  pending: { label: "Paiement requis", tone: "warning", hint: "Un seul abonnement ouvre tous vos établissements supplémentaires, dès la confirmation du paiement." },
  active: { label: "Abonnement actif", tone: "success", hint: "Couvert par votre abonnement unique jusqu'à la fin de la période payée." },
  grace: { label: "Délai de grâce", tone: "warning", hint: "La période payée est terminée : renouvelez pour garder l'accès." },
  expired: { label: "Abonnement expiré", tone: "danger", hint: "Accès suspendu jusqu'au renouvellement. Votre compte et votre premier établissement ne sont pas concernés." },
  suspended: { label: "Suspendu par Neoscool", tone: "danger", hint: "Contactez l'administration Neoscool pour rétablir l'accès." },
  exempt: { label: "Accès offert", tone: "info", hint: "Accès accordé sans paiement par l'administration Neoscool." },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "En attente", tone: "warning" },
  PROCESSING: { label: "En cours", tone: "info" },
  SUCCESS: { label: "Payé", tone: "success" },
  FAILED: { label: "Échoué", tone: "danger" },
  CANCELLED: { label: "Annulé", tone: "neutral" },
};

export const PERIOD_OPTIONS = [
  { value: 1, label: "1 mois" },
  { value: 3, label: "3 mois (trimestre)" },
  { value: 6, label: "6 mois (semestre)" },
  { value: 12, label: "12 mois (année)" },
] as const;

export function periodLabel(months: number): string {
  return months === 1 ? "mois" : months === 12 ? "an" : `${months} mois`;
}

/** États dans lesquels l'enseignant peut payer (première fois ou renouvellement). */
export const PAYABLE_STATES = new Set(["pending", "expired", "grace", "active"]);
