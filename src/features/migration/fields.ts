/**
 * Catalogue des champs NéoScol pour la migration des données historiques et
 * reconnaissance automatique des colonnes d'un fichier (Excel / CSV).
 * Partagé entre l'interface (assistant) et le serveur (analyse).
 */

export type ImportKind = "students" | "grades" | "payments";

export type ImportField = {
  key: string;
  label: string;
  group: string;
  required?: boolean;
  /** Au moins un champ d'un même groupe « oneOf » est requis. */
  oneOf?: string;
  hint?: string;
  synonyms: string[];
};

export const IMPORT_KINDS: Record<ImportKind, { label: string; description: string }> = {
  students: {
    label: "Anciens élèves et parcours",
    description: "Identité, ancien matricule, années d'entrée et de sortie, classes fréquentées, moyennes, absences, diplômes, statut.",
  },
  grades: {
    label: "Notes historiques",
    description: "Une ligne par note : élève, année scolaire, période, matière, note, barème, coefficient.",
  },
  payments: {
    label: "Paiements historiques",
    description: "Une ligne par paiement : élève, année, libellé, montant, date, mode, référence.",
  },
};

const IDENTITY: ImportField[] = [
  { key: "legacy_matricule", label: "Ancien matricule", group: "Identité", synonyms: ["matricule", "ancien matricule", "mat", "numero eleve", "n eleve", "id eleve", "code eleve", "numero matricule", "identifiant"] },
  { key: "last_name", label: "Nom", group: "Identité", required: true, synonyms: ["nom", "nom de famille", "noms", "last name", "surname", "nom eleve"] },
  { key: "first_name", label: "Prénom(s)", group: "Identité", required: true, synonyms: ["prenom", "prenoms", "first name", "given name", "prenom eleve"] },
  { key: "birth_date", label: "Date de naissance", group: "Identité", hint: "JJ/MM/AAAA, AAAA-MM-JJ ou date Excel", synonyms: ["date de naissance", "ne le", "nee le", "ne e le", "naissance", "date naissance", "birth date", "dob", "date_naiss", "datenaiss"] },
];

const STUDENT_FIELDS: ImportField[] = [
  ...IDENTITY,
  { key: "other_names", label: "Autres noms", group: "Identité", synonyms: ["autres noms", "nom de jeune fille", "alias"] },
  { key: "sex", label: "Sexe", group: "Identité", hint: "M/F, garçon/fille…", synonyms: ["sexe", "genre", "sex", "gender", "g f"] },
  { key: "birth_place", label: "Lieu de naissance", group: "Identité", synonyms: ["lieu de naissance", "lieu naissance", "ne a", "birth place"] },
  { key: "nationality", label: "Nationalité", group: "Identité", synonyms: ["nationalite", "nationality", "pays"] },
  { key: "phone", label: "Téléphone", group: "Contact", synonyms: ["telephone", "tel", "contact", "portable", "mobile", "phone"] },
  { key: "email", label: "E-mail", group: "Contact", synonyms: ["email", "e mail", "mail", "courriel"] },
  { key: "address", label: "Adresse", group: "Contact", synonyms: ["adresse", "domicile", "address", "quartier"] },
  { key: "city", label: "Ville", group: "Contact", synonyms: ["ville", "commune", "city"] },
  { key: "entry_year", label: "Année d'entrée", group: "Scolarité", hint: "2015 ou 2015-2016", synonyms: ["annee d entree", "annee entree", "entree", "date d entree", "annee d admission", "admission", "promotion entree"] },
  { key: "exit_year", label: "Année de sortie", group: "Scolarité", hint: "2020 ou 2019-2020", synonyms: ["annee de sortie", "annee sortie", "sortie", "date de sortie", "fin de scolarite", "depart"] },
  { key: "status", label: "Statut", group: "Scolarité", hint: "ancien, diplômé, transféré, retiré, archivé…", synonyms: ["statut", "situation", "etat", "status"] },
  { key: "status_reason", label: "Motif / observation de sortie", group: "Scolarité", synonyms: ["motif", "motif de sortie", "raison", "observation sortie"] },
  { key: "year_label", label: "Année scolaire (de la ligne)", group: "Parcours", hint: "2017-2018 ; une ligne par année et par élève est acceptée", synonyms: ["annee scolaire", "annee", "session", "annee academique", "school year", "exercice"] },
  { key: "class_name", label: "Classe fréquentée", group: "Parcours", synonyms: ["classe", "classe frequentee", "derniere classe", "promotion", "groupe", "class", "section"] },
  { key: "level_name", label: "Niveau", group: "Parcours", synonyms: ["niveau", "cycle", "level", "grade"] },
  { key: "program_name", label: "Formation / filière", group: "Parcours", synonyms: ["filiere", "formation", "serie", "specialite", "option", "parcours", "programme", "program"] },
  { key: "average", label: "Moyenne annuelle", group: "Parcours", synonyms: ["moyenne", "moyenne annuelle", "moy", "moyenne generale", "mga", "average"] },
  { key: "rank", label: "Rang", group: "Parcours", synonyms: ["rang", "classement", "rank"] },
  { key: "decision", label: "Décision de fin d'année", group: "Parcours", synonyms: ["decision", "decision du conseil", "resultat", "admis redouble", "passage"] },
  { key: "absences", label: "Absences (nombre)", group: "Parcours", synonyms: ["absences", "nombre d absences", "nb absences", "heures d absence", "absence"] },
  { key: "absences_justified", label: "Absences justifiées", group: "Parcours", synonyms: ["absences justifiees", "justifiees"] },
  { key: "diploma_title", label: "Diplôme / certificat obtenu", group: "Diplôme", synonyms: ["diplome", "diplome obtenu", "certificat", "examen", "diploma"] },
  { key: "diploma_year", label: "Année du diplôme", group: "Diplôme", synonyms: ["annee du diplome", "annee diplome", "session examen", "annee obtention"] },
  { key: "diploma_mention", label: "Mention", group: "Diplôme", synonyms: ["mention"] },
  { key: "notes", label: "Observations", group: "Autres", synonyms: ["observations", "observation", "remarques", "commentaire", "notes internes"] },
];

const STUDENT_REF: ImportField = {
  key: "student_ref",
  label: "Matricule (NéoScol ou ancien)",
  group: "Élève",
  oneOf: "student",
  hint: "Sinon : nom + prénom (+ date de naissance)",
  synonyms: ["matricule", "ancien matricule", "numero eleve", "id eleve", "code eleve", "identifiant"],
};

const GRADE_FIELDS: ImportField[] = [
  STUDENT_REF,
  { ...IDENTITY[1]!, group: "Élève", required: false, oneOf: "student" },
  { ...IDENTITY[2]!, group: "Élève", required: false, oneOf: "student" },
  { ...IDENTITY[3]!, group: "Élève" },
  { key: "year_label", label: "Année scolaire", group: "Note", required: true, synonyms: ["annee scolaire", "annee", "session", "annee academique"] },
  { key: "period_label", label: "Période", group: "Note", synonyms: ["periode", "trimestre", "semestre", "sequence", "evaluation"] },
  { key: "subject", label: "Matière", group: "Note", required: true, synonyms: ["matiere", "discipline", "cours", "module", "ue", "subject"] },
  { key: "score", label: "Note", group: "Note", required: true, synonyms: ["note", "moyenne", "score", "resultat"] },
  { key: "max_score", label: "Barème (sur)", group: "Note", hint: "20 par défaut", synonyms: ["bareme", "sur", "note sur", "max"] },
  { key: "coefficient", label: "Coefficient", group: "Note", hint: "1 par défaut", synonyms: ["coefficient", "coef", "credits", "credit"] },
  { key: "appreciation", label: "Appréciation", group: "Note", synonyms: ["appreciation", "observation", "commentaire"] },
];

const PAYMENT_FIELDS: ImportField[] = [
  STUDENT_REF,
  { ...IDENTITY[1]!, group: "Élève", required: false, oneOf: "student" },
  { ...IDENTITY[2]!, group: "Élève", required: false, oneOf: "student" },
  { ...IDENTITY[3]!, group: "Élève" },
  { key: "year_label", label: "Année scolaire", group: "Paiement", synonyms: ["annee scolaire", "annee", "exercice"] },
  { key: "label", label: "Libellé", group: "Paiement", synonyms: ["libelle", "motif", "objet", "designation", "frais"] },
  { key: "amount", label: "Montant", group: "Paiement", required: true, synonyms: ["montant", "somme", "montant paye", "versement", "amount"] },
  { key: "paid_on", label: "Date du paiement", group: "Paiement", synonyms: ["date", "date de paiement", "date paiement", "paye le", "date versement"] },
  { key: "method", label: "Mode de paiement", group: "Paiement", synonyms: ["mode", "mode de paiement", "moyen de paiement", "canal"] },
  { key: "reference", label: "Référence / n° de reçu", group: "Paiement", synonyms: ["reference", "recu", "numero de recu", "n recu", "ref"] },
];

export const IMPORT_FIELDS: Record<ImportKind, ImportField[]> = {
  students: STUDENT_FIELDS,
  grades: GRADE_FIELDS,
  payments: PAYMENT_FIELDS,
};

/** Minuscules, sans accents ni ponctuation : « Né(e) le » → « ne e le ». */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Correspondance automatique : synonyme exact d'abord, puis inclusion ; une colonne ne sert qu'une fois. */
export function suggestMapping(kind: ImportKind, headers: string[]): Record<string, string> {
  const fields = IMPORT_FIELDS[kind];
  const normalized = headers.map((h) => ({ header: h, norm: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const pass of ["exact", "contains"] as const) {
    for (const field of fields) {
      if (mapping[field.key]) continue;
      const candidates = [normalizeHeader(field.label), ...field.synonyms];
      const match = normalized.find(
        ({ header, norm }) =>
          !used.has(header) &&
          norm.length > 0 &&
          candidates.some((c) => (pass === "exact" ? norm === c : c.length >= 4 && (norm.startsWith(c) || norm.includes(` ${c}`) || norm.endsWith(c)))),
      );
      if (match) {
        mapping[field.key] = match.header;
        used.add(match.header);
      }
    }
  }
  return mapping;
}

/** Champs obligatoires manquants dans une correspondance (message lisible) ou null. */
export function missingRequired(kind: ImportKind, mapping: Record<string, string>): string | null {
  const fields = IMPORT_FIELDS[kind];
  const missing = fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (kind !== "students" && !mapping.student_ref && !(mapping.last_name && mapping.first_name)) {
    missing.unshift("Matricule, ou Nom + Prénom");
  }
  return missing.length ? `Associez : ${missing.join(", ")}.` : null;
}

export const ROW_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "primary" }> = {
  pending: { label: "En attente", tone: "neutral" },
  valid: { label: "Valide", tone: "success" },
  warning: { label: "À vérifier", tone: "warning" },
  invalid: { label: "Invalide", tone: "danger" },
  duplicate: { label: "Doublon", tone: "info" },
  imported: { label: "Importée", tone: "success" },
  skipped: { label: "Ignorée", tone: "neutral" },
  rejected: { label: "Rejetée", tone: "danger" },
};

export const BATCH_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "primary" }> = {
  draft: { label: "Fichier chargé", tone: "neutral" },
  analyzed: { label: "Analysé", tone: "info" },
  importing: { label: "En cours", tone: "warning" },
  completed: { label: "Terminé", tone: "success" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

export const RESOLUTIONS = {
  existing: { label: "Utiliser l'élève existant", short: "Existant", description: "Le parcours et les diplômes sont ajoutés au dossier existant." },
  merge: { label: "Fusionner", short: "Fusionner", description: "Complète les informations vides du dossier existant, puis ajoute le parcours." },
  create: { label: "Créer malgré le doublon", short: "Créer", description: "Crée un nouveau dossier (homonyme)." },
  skip: { label: "Ignorer la ligne", short: "Ignorer", description: "Rien n'est importé pour cet élève." },
} as const;
export type Resolution = keyof typeof RESOLUTIONS;

export const DIPLOMA_KINDS = { diploma: "Diplôme", certificate: "Certificat", attestation: "Attestation", other: "Autre document" } as const;
