/**
 * Comptes de l'établissement de DÉMONSTRATION (supabase/seed.sql). Ils ne
 * servent qu'en mode démonstration (NEOSCOL_DEMO_MODE=1) pour changer de rôle
 * en un clic ; chaque compte n'a que les droits de son rôle réel.
 */
export type DemoAccountKey = "admin" | "direction" | "secretariat" | "comptable" | "enseignant" | "parent" | "eleve" | "pointage" | "universite" | "formation";

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
    description: "Administratrice de l'Université Démo : étudiants, promotions, semestres.",
    sees: ["Vocabulaire universitaire (étudiants, promotions)", "Unités d'enseignement et crédits ECTS", "Relevés du semestre 1"],
  },
  {
    key: "formation",
    email: "formation@demo.neoscol.app",
    name: "Moussa DIALLO",
    role: "Centre de formation",
    description: "Administrateur de l'Institut de formation professionnelle.",
    sees: ["Vocabulaire formation (apprenants, sessions, formateurs)", "Formations en heures", "Certificat de formation"],
  },
];

export function demoAccount(key: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.key === key);
}
