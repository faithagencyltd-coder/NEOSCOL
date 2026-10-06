/** Écosystème public : libellés partagés (pages publiques, portail, console). */
type Tone = "neutral" | "info" | "warning" | "success" | "primary" | "danger";

export const LEAD_SOURCES: Record<string, string> = {
  discover: "NeoScool Discover",
  profile: "Page publique",
  campaign: "Campagne NeoScool",
  qr: "QR code",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  link: "Lien externe",
  other: "Autre source",
};

export const LEAD_SUBJECTS: Record<string, string> = {
  information: "Demande d'information",
  enrollment: "Inscription",
  visit: "Visite de l'établissement",
  fees: "Frais de scolarité",
  other: "Autre",
};

export const LEAD_STATUSES: Record<string, { label: string; tone: Tone }> = {
  new: { label: "Nouveau", tone: "info" },
  in_progress: { label: "En cours de traitement", tone: "warning" },
  contacted: { label: "Contacté", tone: "primary" },
  interested: { label: "Intéressé", tone: "primary" },
  enrolling: { label: "Inscription en cours", tone: "warning" },
  converted: { label: "Converti", tone: "success" },
  dropped: { label: "Sans suite", tone: "neutral" },
};

export const CAMPAIGN_OBJECTIVES: Record<string, string> = {
  information: "Obtenir des demandes d'information",
  candidates: "Attirer des candidats",
  program: "Promouvoir une formation",
  enrollments: "Augmenter les inscriptions",
  awareness: "Faire connaître l'établissement",
  event: "Promouvoir un événement (portes ouvertes, concours…)",
};

export const CAMPAIGN_STATUSES: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  pending_review: { label: "En attente de validation", tone: "warning" },
  published: { label: "Publiée", tone: "success" },
  suspended: { label: "Suspendue", tone: "danger" },
  ended: { label: "Terminée", tone: "neutral" },
  rejected: { label: "Refusée", tone: "danger" },
};

export const VERIFICATION_STATUSES: Record<string, { label: string; tone: Tone }> = {
  unverified: { label: "Profil non vérifié", tone: "neutral" },
  pending: { label: "Vérification en attente", tone: "warning" },
  verified: { label: "Profil vérifié", tone: "success" },
  suspended: { label: "Profil suspendu", tone: "danger" },
  rejected: { label: "Vérification refusée", tone: "danger" },
};

export const OPPORTUNITY_KINDS: Record<string, string> = {
  job: "Recrutement",
  tutoring_request: "Recherche de répétiteur / cours",
  service: "Services proposés",
  other: "Autre",
};

export const OPPORTUNITY_STATUSES: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  pending: { label: "En attente de validation", tone: "warning" },
  published: { label: "Publié", tone: "success" },
  suspended: { label: "Suspendu", tone: "danger" },
  archived: { label: "Archivé", tone: "neutral" },
  rejected: { label: "Refusé", tone: "danger" },
};

export const APPLICATION_STATUSES: Record<string, { label: string; tone: Tone }> = {
  received: { label: "Reçue", tone: "info" },
  reviewing: { label: "En cours d'étude", tone: "warning" },
  shortlisted: { label: "Présélectionnée", tone: "primary" },
  interview: { label: "Entretien", tone: "primary" },
  accepted: { label: "Acceptée", tone: "success" },
  rejected: { label: "Refusée", tone: "danger" },
  withdrawn: { label: "Retirée", tone: "neutral" },
};

export const REPORT_REASONS: Record<string, string> = {
  fraud: "Arnaque ou fraude",
  inappropriate: "Contenu inapproprié",
  misleading: "Informations trompeuses",
  personal_data: "Données personnelles exposées",
  discrimination: "Discrimination",
  other: "Autre",
};

export const OFFER_KINDS: Record<string, string> = {
  featured_profile: "Mise en avant de la fiche",
  featured_campaign: "Mise en avant d'une campagne",
  featured_opportunity: "Mise en avant d'une annonce",
  publication: "Frais de publication d'une annonce",
  ad_assistance: "Accompagnement publicitaire NeoScool",
};

export const ORDER_STATUSES: Record<string, { label: string; tone: Tone }> = {
  awaiting_payment: { label: "En attente de paiement", tone: "warning" },
  paid: { label: "Payée", tone: "success" },
  cancelled: { label: "Annulée", tone: "neutral" },
  refused: { label: "Refusée", tone: "danger" },
};

export const AD_STATUSES: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  submitted: { label: "Envoyée à NeoScool", tone: "info" },
  preparing: { label: "En préparation", tone: "warning" },
  awaiting_school: { label: "Plan à valider par l'établissement", tone: "warning" },
  validated: { label: "Validée par l'établissement", tone: "primary" },
  running: { label: "En diffusion", tone: "success" },
  completed: { label: "Terminée", tone: "neutral" },
  cancelled: { label: "Annulée", tone: "neutral" },
  refused: { label: "Refusée", tone: "danger" },
};

export const AD_MODES: Record<string, string> = {
  self: "L'établissement gère sa publicité",
  assisted: "NeoScool accompagne l'établissement",
};

export const PUBLIC_ACCOUNT_TYPES: Record<string, string> = {
  candidate: "Candidat(e) à un emploi",
  parent: "Parent",
  teacher: "Enseignant(e)",
  trainer: "Formateur / formatrice",
  other: "Autre",
};

export const toOptions = (map: Record<string, string | { label: string }>) =>
  Object.entries(map).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));
