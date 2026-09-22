const ENTITY_LABELS: Record<string, string> = {
  students: "Élève",
  guardians: "Parent / tuteur",
  enrollments: "Inscription",
  payments: "Paiement",
  invoices: "Facture",
  invoice_lines: "Ligne de facture",
  grades: "Note",
  assessments: "Évaluation",
  attendance_records: "Présence",
  issued_documents: "Document",
  memberships: "Utilisateur",
  membership_roles: "Rôle attribué",
  roles: "Rôle",
  organizations: "Établissement",
  announcements: "Annonce",
  classes: "Classe",
  class_subjects: "Matière de classe",
  academic_years: "Année scolaire",
  academic_periods: "Période",
  staff_members: "Membre du personnel",
  student_guardians: "Lien parent-élève",
  student_medical_records: "Dossier médical",
  conduct_records: "Sanction / récompense",
  form_definitions: "Formulaire",
  report_cards: "Bulletin",
  fee_types: "Type de frais",
  fee_rates: "Tarif",
  installments: "Échéance",
  document_templates: "Modèle de document",
  organization_branding: "Identité visuelle",
  role_permissions: "Permission de rôle",
};

const VERB_LABELS: Record<string, string> = { insert: "créé(e)", update: "modifié(e)", delete: "supprimé(e)" };

const APP_EVENTS: Record<string, string> = {
  "auth.login": "Connexion",
  "auth.logout": "Déconnexion",
  "auth.password_changed": "Mot de passe modifié",
  "auth.switch_organization": "Changement d'établissement",
};

export function activityLabel(action: string, entityType: string | null): string {
  if (APP_EVENTS[action]) return APP_EVENTS[action];
  const verb = action.split(".").pop() ?? "";
  const entity = entityType ? (ENTITY_LABELS[entityType] ?? entityType) : action;
  return `${entity} ${VERB_LABELS[verb] ?? verb}`;
}
