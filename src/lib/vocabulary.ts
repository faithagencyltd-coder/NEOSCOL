/**
 * Vocabulaire adapté au type d'établissement : un lycée parle d'élèves et de
 * classes, une université d'étudiants et de promotions, un centre de formation
 * d'apprenants et de sessions. Les données restent identiques ; seuls les
 * libellés affichés (écrans, menus, documents) changent.
 */
export type Vocabulary = {
  family: "school" | "higher" | "training";
  student: string;
  students: string;
  /** « l'élève », « l'étudiant(e) », « l'apprenant(e) » */
  theStudent: string;
  klass: string;
  classes: string;
  teacher: string;
  teachers: string;
  year: string;
  studentSpace: string;
  /** « Professeur principal », « Responsable de la promotion », « Formateur référent » */
  headTeacher: string;
};

const SCHOOL: Vocabulary = {
  family: "school",
  student: "Élève",
  students: "Élèves",
  theStudent: "l'élève",
  klass: "Classe",
  classes: "Classes",
  teacher: "Enseignant",
  teachers: "Enseignants",
  year: "Année scolaire",
  studentSpace: "Espace élève",
  headTeacher: "Professeur principal",
};

const HIGHER: Vocabulary = {
  family: "higher",
  student: "Étudiant",
  students: "Étudiants",
  theStudent: "l'étudiant(e)",
  klass: "Promotion",
  classes: "Promotions",
  teacher: "Enseignant",
  teachers: "Enseignants",
  year: "Année universitaire",
  studentSpace: "Espace étudiant",
  headTeacher: "Responsable de la promotion",
};

const TRAINING: Vocabulary = {
  family: "training",
  student: "Apprenant",
  students: "Apprenants",
  theStudent: "l'apprenant(e)",
  klass: "Session",
  classes: "Sessions",
  teacher: "Formateur",
  teachers: "Formateurs",
  year: "Année de formation",
  studentSpace: "Espace apprenant",
  headTeacher: "Formateur référent",
};

export const ORGANIZATION_TYPE_LABELS: Record<string, string> = {
  primary_school: "École primaire",
  middle_school: "Collège",
  high_school: "Lycée",
  school_complex: "Groupe scolaire",
  university: "Université",
  institute: "Institut / école supérieure",
  vocational_center: "Centre de formation professionnelle",
  technical_center: "Centre de formation technique",
  private_school: "École privée",
  school_group: "Réseau d'établissements",
};

export function vocabularyFor(type: string | null | undefined): Vocabulary {
  switch (type) {
    case "university":
    case "institute":
      return HIGHER;
    case "vocational_center":
    case "technical_center":
      return TRAINING;
    default:
      return SCHOOL;
  }
}
