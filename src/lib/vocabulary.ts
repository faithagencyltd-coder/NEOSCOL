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

const WORDS: Record<Vocabulary["family"], { student: [string, string]; klass: [string, string]; teacher: [string, string] }> = {
  school: { student: ["élève", "élèves"], klass: ["classe", "classes"], teacher: ["enseignant", "enseignants"] },
  training: { student: ["apprenant", "apprenants"], klass: ["session", "sessions"], teacher: ["formateur", "formateurs"] },
  higher: { student: ["étudiant", "étudiants"], klass: ["promotion", "promotions"], teacher: ["enseignant", "enseignants"] },
};

/** Reprend la casse du mot d'origine (« Élève » → « Apprenant », « ÉLÈVES » → « APPRENANTS »). */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original !== original.toLowerCase() && original.length > 1) return replacement.toUpperCase();
  const first = original.charAt(0);
  return first !== first.toLowerCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

const word = (stem: string) => new RegExp(`(?<![\\p{L}])(${stem})(s?)(?![\\p{L}])`, "giu");

/**
 * Adapte un texte au module de l'établissement : un centre de formation ne lit
 * jamais « élève » ni « classe », une université jamais « élève » ni « apprenant »,
 * une école jamais « apprenant » ni « étudiant ». Les énumérations mixtes
 * (« Élèves, étudiants, apprenants », « Enseignant / Formateur ») sont réduites
 * au seul terme du module.
 */
export function adaptWording(text: string, v: Vocabulary): string {
  const w = WORDS[v.family];
  let out = text.replace(/(?<![\p{L}])professeurs? principa(l|ux)(?![\p{L}])/giu, (m) => matchCase(m, v.headTeacher.toLowerCase()));
  const swap = (stem: string, [one, many]: [string, string]) => {
    out = out.replace(word(stem), (m, base: string, plural: string) => matchCase(base, plural ? many : one) + "");
  };
  for (const stem of ["élève", "apprenant", "étudiant"]) swap(stem, w.student);
  if (v.family !== "school") swap("classe", w.klass);
  for (const stem of ["enseignant", "formateur"]) swap(stem, w.teacher);
  // « Apprenants, apprenants et apprenants » → « Apprenants » ; « Formateur / Formateur » → « Formateur ».
  return out.replace(/(?<![\p{L}])([\p{L}']+)((?:\s*(?:\/|,|et|ou)\s*)\1(?![\p{L}]))+/giu, "$1");
}
