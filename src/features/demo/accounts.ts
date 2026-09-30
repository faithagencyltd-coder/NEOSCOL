/**
 * Comptes de l'établissement de DÉMONSTRATION (supabase/seed.sql). Ils ne
 * servent qu'en mode démonstration (NEOSCOL_DEMO_MODE=1) pour changer de rôle
 * en un clic ; chaque compte n'a que les droits de son rôle réel.
 */
export type DemoAccountKey =
  | "admin"
  | "direction"
  | "secretariat"
  | "comptable"
  | "enseignant"
  | "parent"
  | "eleve"
  | "pointage"
  | "universite"
  | "formation"
  | "formateur"
  | "parent-formation"
  | "pointage-formation"
  | "etudiant"
  | "professeur"
  | "scolarite"
  | "parent-universite"
  | "pointage-universite";

export type DemoAccount = {
  key: DemoAccountKey;
  email: string;
  name: string;
  role: string;
  description: string;
  sees: string[];
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "admin",
    email: "admin@demo.neoscol.app",
    name: "Awa KONÉ",
    role: "Administrateur",
    description: "Pilote tout l'établissement.",
    sees: ["Tous les modules", "Paramètres, rôles, audit", "Documents officiels et dossiers PDF"],
  },
  {
    key: "direction",
    email: "direction@demo.neoscol.app",
    name: "Jean-Marc KOUASSI",
    role: "Direction",
    description: "Suivi pédagogique et validation.",
    sees: ["Scolarité et pédagogie", "Bulletins et documents", "Pointage du personnel"],
  },
  {
    key: "secretariat",
    email: "secretariat@demo.neoscol.app",
    name: "Mariam TRAORÉ",
    role: "Secrétariat",
    description: "Inscriptions, dossiers, comptes portail.",
    sees: ["Élèves, parents, inscriptions", "Justificatifs d'absence", "Badges du personnel"],
  },
  {
    key: "comptable",
    email: "comptable@demo.neoscol.app",
    name: "Serge YAO",
    role: "Comptabilité",
    description: "Factures, paiements, dépenses.",
    sees: ["Finances complètes", "Reçus PDF", "Aucun accès aux notes"],
  },
  {
    key: "enseignant",
    email: "enseignant@demo.neoscol.app",
    name: "Ibrahim OUATTARA",
    role: "Professeur",
    description: "Mathématiques en 6e A et 6e B.",
    sees: ["Mes cours (appel après scan du badge)", "Saisie des notes", "Aperçu des bulletins, sans PDF"],
  },
  {
    key: "parent",
    email: "parent@demo.neoscol.app",
    name: "Adjoua BAMBA",
    role: "Parent",
    description: "Mère de Kofi (6e A, en impayé) et d'Aya (5e A).",
    sees: ["Portail mobile", "Présences toujours visibles", "Restrictions levées dès le paiement"],
  },
  {
    key: "eleve",
    email: "eleve@demo.neoscol.app",
    name: "Kofi BAMBA",
    role: "Élève",
    description: "Élève de 6e A.",
    sees: ["Emploi du temps, présences", "Notes et bulletins publiés", "Documents autorisés"],
  },
  {
    key: "pointage",
    email: "pointage@demo.neoscol.app",
    name: "Tablette d'accueil",
    role: "Tablette de pointage",
    description: "Borne « Scannez votre badge ».",
    sees: ["Uniquement l'écran de scan"],
  },
  {
    key: "universite",
    email: "universite@demo.neoscol.app",
    name: "Clarisse ADOU",
    role: "Université",
    description: "Administratrice de l'Université Démo : structure, UE, résultats, jury, diplômes.",
    sees: ["Facultés, départements, filières, parcours", "UE, crédits, rattrapage, délibérations", "Mémoires, soutenances, diplômes"],
  },
  {
    key: "formation",
    email: "formation@demo.neoscol.app",
    name: "Moussa DIALLO",
    role: "Centre de formation",
    description: "Administrateur de l'Institut de formation professionnelle.",
    sees: ["Formations, sessions, classes facultatives", "Inscription avec échéancier et reçu", "Badges QR, présences du jour, statistiques"],
  },
  {
    key: "formateur",
    email: "formateur@demo.neoscol.app",
    name: "Koffi AKA",
    role: "Formateur",
    description: "Formateur en informatique (session Bureautique) de l'Institut de formation.",
    sees: ["Ses cours et l'emploi du temps", "Évaluation des compétences de ses apprenants", "Assiduité de ses apprenants"],
  },
  {
    key: "parent-formation",
    email: "parent.formation@demo.neoscol.app",
    name: "Mariam COULIBALY",
    role: "Parent (formation)",
    description: "Mère d'Aminata, apprenante de l'Institut de formation.",
    sees: ["Portail parent mobile", "Présences, évaluations, parcours de formation", "Échéancier et paiements"],
  },
  {
    key: "pointage-formation",
    email: "pointage.formation@demo.neoscol.app",
    name: "Tablette des ateliers",
    role: "Tablette « Scanner votre badge »",
    description: "Borne du centre de formation : formateurs et apprenants.",
    sees: ["Détection automatique formateur / apprenant", "Entrée, sortie, retard"],
  },
  {
    key: "scolarite",
    email: "scolarite@demo.neoscol.app",
    name: "Service de la scolarité",
    role: "Scolarité (université)",
    description: "Inscriptions administratives et pédagogiques, résultats, relevés, diplômes.",
    sees: ["Inscription avec frais et UE du semestre", "Relevés de notes et attestations", "Délivrance des diplômes"],
  },
  {
    key: "professeur",
    email: "professeur@demo.neoscol.app",
    name: "Clément KOUAKOU",
    role: "Enseignant (université)",
    description: "Maître de conférences, responsable de la Licence Informatique.",
    sees: ["Mes enseignements et mon emploi du temps", "Saisie des notes de ses matières", "Appel après scan de son badge"],
  },
  {
    key: "etudiant",
    email: "etudiant@demo.neoscol.app",
    name: "Kouamé KONAN",
    role: "Étudiant",
    description: "Étudiant en Licence 1 Informatique.",
    sees: ["Résultats et crédits publiés", "Parcours universitaire", "Emploi du temps, présences, paiements"],
  },
  {
    key: "parent-universite",
    email: "parent.universite@demo.neoscol.app",
    name: "Brigitte KONAN",
    role: "Parent (université)",
    description: "Mère de Kouamé, étudiant en Licence 1 (portail parent activé par l'université).",
    sees: ["Résultats publiés et crédits", "Présences, paiements, documents", "Seulement ce que l'université a choisi de montrer"],
  },
  {
    key: "pointage-universite",
    email: "pointage.universite@demo.neoscol.app",
    name: "Tablette de l'université",
    role: "Tablette « Scanner votre badge »",
    description: "Borne de l'université : enseignants et étudiants.",
    sees: ["Détection automatique enseignant / étudiant", "Entrée, sortie, retard, sortie anticipée"],
  },
];

export function demoAccount(key: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.key === key);
}

/** Module de chaque compte de démonstration (séparation des modules dans un établissement ouvert). */
export function demoAccountFamily(key: DemoAccountKey): "school" | "training" | "higher" {
  if (key === "formation" || key === "formateur" || key === "parent-formation" || key === "pointage-formation") return "training";
  if (key === "universite" || key === "etudiant" || key === "professeur" || key === "scolarite" || key === "parent-universite" || key === "pointage-universite") return "higher";
  return "school";
}
