/** Libellés du programme d'affiliation (espace affilié et console). */
export const AFFILIATE_KINDS: Record<string, string> = {
  teacher: "Enseignant ou professionnel de l'éducation",
  ambassador: "Ambassadeur NeoScool",
  freelance: "Commercial indépendant",
  partner: "Partenaire institutionnel",
  other: "Autre",
};

export const AFFILIATE_STATUS = {
  pending: { label: "En attente", tone: "warning" as const },
  approved: { label: "Approuvé", tone: "success" as const },
  suspended: { label: "Suspendu", tone: "danger" as const },
  rejected: { label: "Refusé", tone: "neutral" as const },
};

export const COMMISSION_STATUS = {
  pending: { label: "En attente", tone: "neutral" as const },
  in_review: { label: "En vérification", tone: "warning" as const },
  validated: { label: "Validée", tone: "info" as const },
  payable: { label: "Payable", tone: "primary" as const },
  paid: { label: "Payée", tone: "success" as const },
  cancelled: { label: "Annulée", tone: "neutral" as const },
  rejected: { label: "Refusée", tone: "danger" as const },
};

export const PAYOUT_METHODS: Record<string, string> = { mobile_money: "Mobile Money", bank: "Virement bancaire", other: "Autre" };
export const ATTRIBUTION_SOURCES: Record<string, string> = { link: "Lien", code: "Code saisi", promo: "Code promo", manual: "Correction manuelle" };
export const ATTRIBUTION_FLAGS: Record<string, string> = {
  conflict: "Code et lien de deux affiliés différents",
  self_referral: "Auto-parrainage (refusé)",
  duplicate_school: "École peut-être déjà cliente",
};

export function rewardText(r: { reward_type: string; reward_value: number; reward_event: string; reward_months: number }, currency = "FCFA") {
  const value = r.reward_type === "percent" ? `${r.reward_value} %` : `${r.reward_value.toLocaleString("fr-FR")} ${currency}`;
  return r.reward_event === "first_payment"
    ? `${value} du premier paiement d'abonnement de chaque établissement recommandé`
    : `${value} de chaque paiement d'abonnement pendant ${r.reward_months} mois`;
}
