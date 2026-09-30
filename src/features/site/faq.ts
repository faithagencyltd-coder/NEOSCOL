/** Questions fréquentes d'origine (affichées tant que le Super Admin n'a pas saisi les siennes). */
export function defaultFaq(trialDays: number): { q: string; a: string }[] {
  return [
  { q: `Que se passe-t-il après les ${trialDays} jours d'essai ?`, a: "Vous choisissez votre formule et payez en ligne. Sans paiement, l'établissement passe progressivement en lecture seule : aucune donnée n'est jamais supprimée, et tout est rétabli dès le paiement confirmé." },
  { q: "Comment payer ?", a: "Par mobile money (dont MTN, Moov et Celtiis Cash au Bénin) ou carte, via notre prestataire de paiement sécurisé. Chaque paiement donne lieu à une facture PDF." },
  { q: "Puis-je changer de formule ou annuler ?", a: "Oui, depuis « Mon abonnement ». En cas d'annulation, l'accès reste complet jusqu'à la fin de la période déjà payée." },
  { q: "Mes données sont-elles séparées des autres établissements ?", a: "Oui : chaque établissement est isolé au niveau de la base de données. Les finances de votre établissement (scolarité, reçus) sont distinctes de votre abonnement NeoScool." },
];
}
