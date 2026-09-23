/** Libellés français et tonalités des valeurs métier (statuts, relations…). */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const ENROLLMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  pending: { label: "En attente", tone: "warning" },
  validated: { label: "Validée", tone: "success" },
  rejected: { label: "Rejetée", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const ENROLLMENT_TYPE: Record<string, string> = {
  new: "Nouvelle inscription",
  reenrollment: "Réinscription",
  transfer: "Transfert",
};

export const STUDENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  prospect: { label: "Candidat", tone: "warning" },
  active: { label: "Actif", tone: "success" },
  inactive: { label: "Inactif", tone: "neutral" },
  graduated: { label: "Diplômé", tone: "info" },
  transferred: { label: "Transféré", tone: "neutral" },
  withdrawn: { label: "Retiré", tone: "danger" },
};

export const RELATIONSHIP: Record<string, string> = {
  father: "Père",
  mother: "Mère",
  tutor: "Tuteur / tutrice",
  grandparent: "Grand-parent",
  sibling: "Frère / sœur",
  other: "Autre",
};

export const SEX: Record<string, string> = { M: "Masculin", F: "Féminin" };

export const PROGRAM_KIND: Record<string, string> = { track: "Filière", training: "Formation", degree: "Diplôme" };

export const PERIOD_TYPE: Record<string, string> = {
  trimester: "Trimestre",
  semester: "Semestre",
  session: "Session",
  custom: "Période personnalisée",
};

export const CLASS_KIND: Record<string, string> = { class: "Classe", training_session: "Session de formation" };

export const ASSESSMENT_KINDS = {
  test: "Devoir surveillé",
  homework: "Devoir / interrogation",
  exam: "Examen / composition",
  oral: "Oral",
  practical: "Travaux pratiques",
  project: "Projet",
  other: "Autre",
} as const;

export function options(record: Record<string, string>) {
  return Object.entries(record).map(([value, label]) => ({ value, label }));
}

export const PAYMENT_METHOD: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  bank_transfer: "Virement bancaire",
  card: "Carte bancaire",
  cheque: "Chèque",
  other: "Autre",
};

export const INVOICE_PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "Soldée", tone: "success" },
  partial: { label: "Partielle", tone: "warning" },
  unpaid: { label: "Impayée", tone: "danger" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  present: { label: "Présent", tone: "success" },
  late: { label: "Retard", tone: "warning" },
  absent: { label: "Absent", tone: "danger" },
  excused: { label: "Absence justifiée", tone: "info" },
};

export const JUSTIFICATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "À examiner", tone: "warning" },
  accepted: { label: "Acceptée", tone: "success" },
  rejected: { label: "Refusée", tone: "danger" },
  correction_requested: { label: "Correction demandée", tone: "info" },
};
