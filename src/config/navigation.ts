import type { SchoolConfig, SchoolLevel } from "@/features/academic/school";
import type { UniversityConfig, UniversityFeature } from "@/features/university/config";
import type { Permission } from "@/config/permissions";
import { adaptWording, vocabularyFor, type Vocabulary } from "@/lib/vocabulary";

export type NavIcon =
  | "dashboard"
  | "account"
  | "students"
  | "history"
  | "countryConnect"
  | "portalLink"
  | "subscription"
  | "enrollments"
  | "guardians"
  | "classes"
  | "structure"
  | "forms"
  | "timetable"
  | "attendance"
  | "grades"
  | "reportCards"
  | "staff"
  | "staffAttendance"
  | "kiosk"
  | "lessons"
  | "finance"
  | "portal"
  | "audit"
  | "settings"
  | "notifications"
  | "subjects"
  | "documents"
  | "badges"
  | "payments"
  | "invoices"
  | "expenses"
  | "revenue"
  | "overdue"
  | "users"
  | "roles"
  | "demo"
  | "school"
  | "year"
  | "templates"
  | "reports"
  | "assistant"
  | "communication"
  | "training"
  | "trainingSessions"
  | "enrollLearner"
  | "learnerAttendance"
  | "stats"
  | "university"
  | "faculty"
  | "department"
  | "program"
  | "track"
  | "cycle"
  | "teachingUnit"
  | "room"
  | "results"
  | "retake"
  | "jury"
  | "internship"
  | "thesis"
  | "defense"
  | "diploma"
  | "teacherPortal";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Au moins une de ces permissions est requise (vide = tout utilisateur connecté). */
  anyOf: readonly Permission[];
  keywords?: string;
  /** Module Scolaire : entrée affichée seulement si ce niveau est activé pour l'établissement. */
  schoolLevel?: SchoolLevel;
  /** Module Formation professionnelle : entrée réservée aux centres de formation. */
  family?: Vocabulary["family"];
  /** Module Université : entrée affichée seulement si la fonctionnalité est activée. */
  feature?: UniversityFeature;
};

export type NavSection = { label: string; items: NavItem[] };

/**
 * Navigation principale. Seuls les modules LIVRÉS y figurent : chaque phase
 * ajoute ses entrées (élèves, inscriptions, finances…) lorsqu'elles fonctionnent.
 */
export const NAVIGATION: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/tableau-de-bord", label: "Tableau de bord", icon: "dashboard", anyOf: [], keywords: "accueil statistiques" },
      { href: "/notifications", label: "Notifications", icon: "notifications", anyOf: [], keywords: "alertes messages" },
      { href: "/assistant", label: "Assistant", icon: "assistant", anyOf: ["assistant.use"], keywords: "intelligence artificielle questions anomalies" },
      { href: "/rapports", label: "Rapports", icon: "reports", anyOf: ["reports.read"], keywords: "statistiques exports effectifs résultats finances absences" },
    ],
  },
  {
    label: "Formation professionnelle",
    items: [
      { href: "/formation", label: "Aujourd'hui", icon: "learnerAttendance", anyOf: ["attendance.read", "reports.read", "staff_attendance.read"], family: "training", keywords: "présents absents retards sorties formateurs apprenants tableau du jour" },
      { href: "/formation/formations", label: "Formations", icon: "training", anyOf: ["academic.read"], family: "training", keywords: "formations métiers coût durée programme certificat conditions d'admission" },
      { href: "/formation/sessions", label: "Sessions et groupes", icon: "trainingSessions", anyOf: ["academic.read"], family: "training", keywords: "sessions dates capacité groupes classes formateurs" },
      { href: "/formation/presences", label: "Entrées et sorties", icon: "attendance", anyOf: ["attendance.read"], family: "training", keywords: "pointage apprenants entrées sorties retards présence" },
      { href: "/formation/badges", label: "Badges apprenants", icon: "badges", anyOf: ["students.badges.manage", "students.read"], family: "training", keywords: "badges QR apprenants imprimer remplacer perdu" },
      { href: "/formation/statistiques", label: "Statistiques", icon: "stats", anyOf: ["reports.read", "attendance.read"], family: "training", keywords: "statistiques taux assiduité paiements reliquats certificats" },
      { href: "/formation/parametres", label: "Paramètres de formation", icon: "settings", anyOf: ["settings.manage"], family: "training", keywords: "classes groupes facultatifs retard tolérance scan" },
    ],
  },
  {
    label: "Établissement",
    items: [
      { href: "/eleves", label: "Élèves", icon: "students", anyOf: ["students.read"], keywords: "dossier matricule étudiants apprenants" },
      { href: "/donnees-historiques", label: "Données historiques", icon: "history", anyOf: ["students.import"], keywords: "migration import anciens élèves diplômés transférés excel csv archives années" },
      { href: "/parametres/country-connect", label: "Country Connect", icon: "countryConnect", anyOf: ["students.import", "settings.manage"], keywords: "identifiant national ine educmaster ministère export import fichier officiel pays" },
      { href: "/inscriptions", label: "Inscriptions", icon: "enrollments", anyOf: ["enrollments.read"], keywords: "réinscription validation inscrire un apprenant nouvelle inscription" },
      { href: "/eleves/cartes", label: "Cartes scolaires", icon: "badges", anyOf: ["students.badges.manage"], family: "school", keywords: "carte scolaire badge QR élèves imprimer 3D remplacer perdue" },
      { href: "/parents", label: "Parents et tuteurs", icon: "guardians", anyOf: ["guardians.read"], keywords: "famille tuteur" },
      { href: "/personnel", label: "Personnel", icon: "staff", anyOf: ["staff.read"], keywords: "enseignants formateurs administratif badges comptes matricule" },
      { href: "/classes", label: "Classes", icon: "classes", anyOf: ["academic.read"], keywords: "effectif session filière" , family: "school" },
      { href: "/structure?onglet=filieres", label: "Séries et filières", icon: "structure", anyOf: ["academic.manage"], keywords: "lycée général technique séries filières F1 F2 F3 F4 G1 G2 G3 génie civil électrotechnique", schoolLevel: "lycee" , family: "school" },
      { href: "/structure?onglet=matieres", label: "Matières", icon: "subjects", anyOf: ["academic.manage"], keywords: "matières modules coefficients" },
      { href: "/emploi-du-temps", label: "Emploi du temps", icon: "timetable", anyOf: ["timetable.read", "timetable.manage"], keywords: "cours horaires salles" },
    ],
  },
  {
    label: "Pédagogie",
    items: [
      { href: "/mes-cours", label: "Mes cours", icon: "lessons", anyOf: ["attendance.take"], keywords: "appel cours emploi du temps badge" },
      { href: "/presences", label: "Présences", icon: "attendance", anyOf: ["attendance.read", "attendance.manage", "attendance.justify"], keywords: "appel absences retards justificatifs" , family: "school" },
      { href: "/notes", label: "Notes et évaluations", icon: "grades", anyOf: ["grades.read", "grades.enter", "grades.manage"], keywords: "évaluations devoirs saisie interrogations examens" },
      { href: "/bulletins", label: "Bulletins", icon: "reportCards", anyOf: ["report_cards.manage", "grades.read"], keywords: "moyennes rangs appréciations" , family: "school" },
      { href: "/bulletins/apercu", label: "Aperçu des bulletins", icon: "reportCards", anyOf: ["grades.enter"], keywords: "aperçu moyennes classe" , family: "school" },
      { href: "/resultats-annuels", label: "Résultats annuels", icon: "reportCards", anyOf: ["report_cards.manage"], keywords: "moyenne annuelle décision passage redoublement conseil de classe" , family: "school" },
      { href: "/passage-annee", label: "Passage d'année", icon: "history", anyOf: ["academic.manage"], keywords: "réinscription groupée année suivante clôture archive passage redoublement fin d'année" , family: "school" },
      { href: "/documents", label: "Documents", icon: "documents", anyOf: ["documents.read", "documents.generate", "documents.dossier"], keywords: "certificats attestations reçus cartes dossier complet PDF" },
      { href: "/documents/modeles", label: "Document Studio", icon: "templates", anyOf: ["documents.templates.manage"], keywords: "modèles certificats convocation contrat personnalisation" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/communication", label: "Annonces", icon: "communication", anyOf: [], keywords: "annonces information publication familles" },
      { href: "/messages", label: "Messagerie", icon: "communication", anyOf: [], keywords: "messages conversation parents enseignants" },
      { href: "/communication/envois", label: "Centre d'envois", icon: "communication", anyOf: ["communication.send"], keywords: "sms e-mail email whatsapp envoi groupé relance impayés modèles parents personnel" },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/finances", label: "Synthèse financière", icon: "finance", anyOf: ["finance.read"], keywords: "revenus solde" },
      { href: "/finances?onglet=paiements", label: "Paiements", icon: "payments", anyOf: ["finance.read"], keywords: "encaissements reçus" },
      { href: "/finances?onglet=factures", label: "Factures", icon: "invoices", anyOf: ["finance.read"], keywords: "factures échéances" },
      { href: "/finances?onglet=impayes", label: "Impayés et reliquats", icon: "overdue", anyOf: ["finance.read"], keywords: "impayés retard reliquats reste dû" },
      { href: "/finances?onglet=rappels", label: "Rappels d'impayés", icon: "notifications", anyOf: ["finance.read"], keywords: "rappels relances notifications familles" },
      { href: "/finances?onglet=depenses", label: "Dépenses", icon: "expenses", anyOf: ["finance.expenses.read", "finance.expenses.manage"], keywords: "dépenses fournisseurs justificatifs" },
      { href: "/finances?onglet=tarifs", label: "Frais et tarifs", icon: "templates", anyOf: ["finance.read"], keywords: "tarifs frais scolarité échéancier tranches" },
    ],
  },
  {
    label: "Pointage",
    items: [
      { href: "/personnel/pointage", label: "Pointage du personnel", icon: "staffAttendance", anyOf: ["staff_attendance.read"], keywords: "arrivées retards badges scans" },
      { href: "/personnel/badges", label: "Badges du personnel", icon: "badges", anyOf: ["staff.read"], keywords: "badges QR impression" },
      { href: "/pointage", label: "Tablette de pointage", icon: "kiosk", anyOf: ["staff_attendance.scan"], keywords: "scanner badge QR kiosque" },
    ],
  },
  {
    label: "Portails",
    items: [
      { href: "/portail", label: "Espace famille", icon: "portal", anyOf: ["portal.parent", "portal.student"], keywords: "portail parent élève enfants" },
      { href: "/parametres/portails", label: "Lien des portails", icon: "portalLink", anyOf: ["settings.manage"], keywords: "lien partager connexion parent enseignant formateur élève étudiant QR code WhatsApp" },
    ],
  },
  {
    label: "Sécurité",
    items: [
      { href: "/utilisateurs", label: "Utilisateurs", icon: "users", anyOf: ["users.read"], keywords: "comptes accès suspension" },
      { href: "/roles", label: "Rôles et permissions", icon: "roles", anyOf: ["users.read", "roles.manage"], keywords: "droits matrice RBAC" },
      { href: "/audit", label: "Journal d'audit", icon: "audit", anyOf: ["audit.read"], keywords: "historique traçabilité actions connexions refus" },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/structure", label: "Année scolaire", icon: "year", anyOf: ["academic.manage"], keywords: "années périodes niveaux filières salles" },
      { href: "/parametres/etablissement", label: "Établissement", icon: "school", anyOf: ["settings.manage"], keywords: "identité logo couleurs cachet signature coordonnées en-tête" },
      { href: "/abonnement", label: "Mon abonnement", icon: "subscription", anyOf: ["billing.read"], keywords: "abonnement NeoScool formule facture paiement essai renouveler tarif" },
      { href: "/parametres", label: "Configuration", icon: "settings", anyOf: ["settings.manage"], keywords: "impayés restrictions rappels pointage notes verrouillage" },
      { href: "/bulletins/configuration", label: "Modèle de bulletin", icon: "templates", anyOf: ["report_cards.manage"], keywords: "bulletin colonnes coefficients modèle" , family: "school" },
      { href: "/parametres/cartes", label: "Cartes et badges", icon: "badges", anyOf: ["settings.manage"], keywords: "carte scolaire carte apprenant carte étudiant badge design modèle couleurs verso 3D" },
      { href: "/parametres/messages-vocaux", label: "Messages vocaux", icon: "settings", anyOf: ["voice_checkin.manage"], keywords: "voice check-in voix annonce arrivée pointage tablette synthèse vocale" },
      { href: "/parametres/regles-academiques", label: "Règles de calcul", icon: "settings", anyOf: ["academic.manage"], keywords: "formule moyenne annuelle pondération trimestre décisions simulateur versions" , family: "school" },
      { href: "/formulaires", label: "Formulaires", icon: "forms", anyOf: ["forms.manage"], keywords: "champs personnalisés pièces" },
    ],
  },
  {
    label: "Compte",
    items: [
      { href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" },
      { href: "/mon-badge", label: "Mon badge", icon: "badges", anyOf: [], keywords: "badge QR pointage carte plein écran" },
    ],
  },
];

/**
 * Navigation du Module 3 — Université / Enseignement supérieur : uniquement des
 * menus universitaires (aucune entrée scolaire ni formation professionnelle),
 * adaptés aux fonctionnalités activées par l'établissement.
 */
export const UNIVERSITY_NAVIGATION: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/universite", label: "Tableau de bord universitaire", icon: "university", anyOf: [], keywords: "accueil université statistiques du jour" },
      { href: "/notifications", label: "Notifications", icon: "notifications", anyOf: [], keywords: "alertes messages" },
      { href: "/universite/statistiques", label: "Statistiques", icon: "stats", anyOf: ["reports.read", "deliberations.read", "academic.manage"], keywords: "taux réussite crédits paiements reliquats présences" },
      { href: "/rapports", label: "Rapports", icon: "reports", anyOf: ["reports.read"], keywords: "exports effectifs résultats finances" },
      { href: "/assistant", label: "Assistant", icon: "assistant", anyOf: ["assistant.use"], keywords: "intelligence artificielle questions" },
    ],
  },
  {
    label: "Structure universitaire",
    items: [
      { href: "/universite/structure", label: "Structure universitaire", icon: "structure", anyOf: ["academic.read"], keywords: "organigramme établissement facultés départements filières" },
      { href: "/universite/structure?onglet=facultes", label: "Facultés / Écoles", icon: "faculty", anyOf: ["academic.read"], feature: "faculties", keywords: "faculté école institut doyen" },
      { href: "/universite/structure?onglet=departements", label: "Départements", icon: "department", anyOf: ["academic.read"], feature: "departments", keywords: "département chef" },
      { href: "/universite/structure?onglet=filieres", label: "Filières", icon: "program", anyOf: ["academic.read"], keywords: "filière licence master diplôme préparé responsable" },
      { href: "/universite/structure?onglet=parcours", label: "Parcours et spécialités", icon: "track", anyOf: ["academic.read"], keywords: "parcours spécialité option" },
      { href: "/universite/structure?onglet=cycles", label: "Cycles et niveaux", icon: "cycle", anyOf: ["academic.read"], keywords: "licence master doctorat L1 L2 L3 M1 M2 crédits requis" },
      { href: "/universite/annees", label: "Années académiques", icon: "year", anyOf: ["academic.read"], keywords: "année semestre sessions examens inscriptions rattrapage" },
      { href: "/universite/ue", label: "UE / Matières", icon: "teachingUnit", anyOf: ["academic.read"], keywords: "unité d'enseignement UE matière crédits coefficient volume horaire CM TD TP" },
      { href: "/universite/salles", label: "Salles", icon: "room", anyOf: ["academic.read"], keywords: "amphithéâtre laboratoire salle informatique capacité équipements" },
    ],
  },
  {
    label: "Scolarité",
    items: [
      { href: "/eleves", label: "Étudiants", icon: "students", anyOf: ["students.read"], keywords: "étudiant matricule dossier académique" },
      { href: "/universite/inscription", label: "Inscription administrative", icon: "enrollLearner", anyOf: ["enrollments.manage"], keywords: "inscription réinscription frais filière parcours niveau" },
      { href: "/inscriptions", label: "Inscriptions", icon: "enrollments", anyOf: ["enrollments.read"], keywords: "dossiers inscription validation" },
      { href: "/classes", label: "Promotions", icon: "classes", anyOf: ["academic.read"], keywords: "promotion groupe effectif" },
      { href: "/universite/enseignants", label: "Enseignants", icon: "staff", anyOf: ["staff.read"], keywords: "professeur maître de conférences chargé de cours vacataire grade" },
      { href: "/emploi-du-temps", label: "Emploi du temps", icon: "timetable", anyOf: ["timetable.read", "timetable.manage"], keywords: "cours CM TD TP salles horaires" },
    ],
  },
  {
    label: "Présences",
    items: [
      { href: "/universite/presences", label: "Présences / Scan", icon: "learnerAttendance", anyOf: ["attendance.read"], keywords: "entrées sorties retards absences scan" },
      { href: "/pointage", label: "Tablette de scan", icon: "kiosk", anyOf: ["staff_attendance.scan"], feature: "scan", keywords: "scanner badge QR borne" },
      { href: "/universite/badges", label: "Badges étudiants", icon: "badges", anyOf: ["students.badges.manage"], feature: "badges", keywords: "badge carte QR remplacer perdu" },
      { href: "/personnel/badges", label: "Badges enseignants", icon: "badges", anyOf: ["staff.read"], feature: "badges", keywords: "badge enseignant QR" },
      { href: "/personnel/pointage", label: "Présence des enseignants", icon: "staffAttendance", anyOf: ["staff_attendance.read"], keywords: "arrivées enseignants retards" },
    ],
  },
  {
    label: "Évaluations et résultats",
    items: [
      { href: "/notes", label: "Évaluations et notes", icon: "grades", anyOf: ["grades.read", "grades.enter", "grades.manage"], keywords: "contrôle continu examen TP projet oral saisie des notes" },
      { href: "/universite/resultats", label: "Résultats et crédits", icon: "results", anyOf: ["deliberations.read", "grades.manage"], keywords: "moyennes UE semestre crédits compensation classement" },
      { href: "/universite/resultats?onglet=rattrapage", label: "Rattrapages", icon: "retake", anyOf: ["deliberations.read", "grades.manage"], keywords: "session de rattrapage note initiale" },
      { href: "/universite/deliberations", label: "Délibérations", icon: "jury", anyOf: ["deliberations.read"], keywords: "jury décision procès-verbal PV" },
    ],
  },
  {
    label: "Stages, mémoires, diplômes",
    items: [
      { href: "/universite/stages", label: "Stages", icon: "internship", anyOf: ["students.read", "theses.manage"], feature: "internships", keywords: "entreprise convention tuteur encadreur rapport" },
      { href: "/universite/memoires", label: "Mémoires / thèses", icon: "thesis", anyOf: ["students.read", "theses.manage"], feature: "theses", keywords: "sujet directeur mémoire thèse" },
      { href: "/universite/soutenances", label: "Soutenances", icon: "defense", anyOf: ["students.read", "theses.manage"], feature: "defenses", keywords: "soutenance jury date salle note" },
      { href: "/universite/diplomes", label: "Diplômes", icon: "diploma", anyOf: ["diplomas.manage"], keywords: "diplôme numéro délivrance" },
    ],
  },
  {
    label: "Enseignant",
    items: [
      { href: "/universite/mes-enseignements", label: "Mes enseignements", icon: "teacherPortal", anyOf: ["attendance.take", "grades.enter"], feature: "teacher_portal", keywords: "mes cours étudiants groupes présences notes" },
      { href: "/mes-cours", label: "Mes cours du jour", icon: "lessons", anyOf: ["attendance.take"], keywords: "appel cours" },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/finances", label: "Paiements universitaires", icon: "finance", anyOf: ["finance.read"], feature: "payments", keywords: "frais inscription scolarité examen soutenance diplôme" },
      { href: "/finances?onglet=impayes", label: "Reliquats", icon: "overdue", anyOf: ["finance.read"], feature: "payments", keywords: "reste à payer tranches échéances" },
      { href: "/finances?onglet=tarifs", label: "Frais universitaires", icon: "templates", anyOf: ["finance.read"], feature: "payments", keywords: "tarifs tranches échéancier" },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/documents", label: "Documents universitaires", icon: "documents", anyOf: ["documents.read", "documents.generate"], feature: "documents", keywords: "certificat de scolarité attestation relevé de notes carte étudiant" },
      { href: "/documents/modeles", label: "Modèles de documents", icon: "templates", anyOf: ["documents.templates.manage"], feature: "documents", keywords: "Document Studio modèles" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/communication", label: "Annonces", icon: "communication", anyOf: [], keywords: "annonces" },
      { href: "/messages", label: "Messagerie", icon: "communication", anyOf: [], keywords: "messages" },
      { href: "/communication/envois", label: "Centre d'envois", icon: "communication", anyOf: ["communication.send"], keywords: "sms e-mail whatsapp envoi groupé relance" },
    ],
  },
  {
    label: "Portails",
    items: [
      { href: "/portail", label: "Espace étudiant", icon: "portal", anyOf: ["portal.student"], feature: "student_portal", keywords: "portail étudiant" },
      { href: "/parametres/portails", label: "Lien des portails", icon: "portalLink", anyOf: ["settings.manage"], keywords: "lien connexion étudiants enseignants" },
    ],
  },
  {
    label: "Sécurité",
    items: [
      { href: "/utilisateurs", label: "Utilisateurs", icon: "users", anyOf: ["users.read"], keywords: "comptes" },
      { href: "/roles", label: "Rôles et permissions", icon: "roles", anyOf: ["users.read", "roles.manage"], keywords: "scolarité comptabilité jury responsable de filière" },
      { href: "/audit", label: "Journal d'audit", icon: "audit", anyOf: ["audit.read"], keywords: "historique" },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/universite/parametres", label: "Paramètres universitaires", icon: "settings", anyOf: ["settings.manage"], keywords: "fonctionnalités règles calcul compensation rattrapage crédits classement" },
      { href: "/parametres/cartes", label: "Cartes et badges", icon: "badges", anyOf: ["settings.manage"], keywords: "carte étudiant badge design modèle couleurs verso 3D" },
      { href: "/parametres/etablissement", label: "Établissement", icon: "school", anyOf: ["settings.manage"], keywords: "logo cachet signature coordonnées site web" },
      { href: "/abonnement", label: "Mon abonnement", icon: "subscription", anyOf: ["billing.read"], keywords: "abonnement" },
      { href: "/formulaires", label: "Formulaires", icon: "forms", anyOf: ["forms.manage"], keywords: "champs personnalisés pièces" },
    ],
  },
  {
    label: "Compte",
    items: [
      { href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" },
      { href: "/mon-badge", label: "Mon badge", icon: "badges", anyOf: [], keywords: "badge QR pointage carte plein écran" },
    ],
  },
];

/**
 * Module 4 — établissement principal (plusieurs activités) : pilotage des espaces
 * (École, Formation professionnelle, Université), abonnement unique, sécurité.
 * Chaque espace garde ensuite le menu de son propre module.
 */
export const GROUP_NAVIGATION: NavSection[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/espaces", label: "Mes espaces", icon: "structure", anyOf: [], keywords: "école formation université basculer espace module 4" },
      { href: "/notifications", label: "Notifications", icon: "notifications", anyOf: [], keywords: "alertes messages" },
    ],
  },
  {
    label: "Abonnement",
    items: [{ href: "/abonnement", label: "Mon abonnement", icon: "subscription", anyOf: ["billing.read"], keywords: "module 4 multi-modules domaines facture paiement" }],
  },
  {
    label: "Sécurité",
    items: [
      { href: "/utilisateurs", label: "Utilisateurs", icon: "users", anyOf: ["users.read"], keywords: "comptes" },
      { href: "/roles", label: "Rôles et permissions", icon: "roles", anyOf: ["users.read", "roles.manage"], keywords: "rôles" },
      { href: "/audit", label: "Journal d'audit", icon: "audit", anyOf: ["audit.read"], keywords: "historique" },
    ],
  },
  {
    label: "Paramètres",
    items: [{ href: "/parametres/etablissement", label: "Établissement", icon: "school", anyOf: ["settings.manage"], keywords: "logo cachet signature coordonnées" }],
  },
  {
    label: "Compte",
    items: [
      { href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" },
    ],
  },
];

/** Entrée « Mode démonstration », ajoutée uniquement lorsque NEOSCOL_DEMO_MODE est actif. */
export const DEMO_NAV_ITEM: NavItem = { href: "/demo", label: "Mode démonstration", icon: "demo", anyOf: [], keywords: "démo rôles scénarios" };

/** Libellés dépendant du type d'établissement (élèves / étudiants / apprenants…). */
function localizedLabel(item: NavItem, v: Vocabulary): string {
  if (item.href === "/eleves") return v.students;
  if (item.href === "/classes") return v.classes;
  if (item.href === "/structure") return v.year;
  return adaptWording(item.label, v);
}

export function visibleNavigation(
  permissions: ReadonlySet<Permission>,
  options: { demo?: boolean; organizationType?: string | null; school?: SchoolConfig | null; university?: UniversityConfig | null; hidden?: readonly string[] } = {},
): NavSection[] {
  const v = vocabularyFor(options.organizationType);
  const base = options.organizationType === "school_group" ? GROUP_NAVIGATION : v.family === "higher" ? UNIVERSITY_NAVIGATION : NAVIGATION;
  const sections = options.demo
    ? base.map((section) => (section.label === "Portails" ? { ...section, items: [...section.items, DEMO_NAV_ITEM] } : section))
    : base;
  return sections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.has(p)))
      // Entrées propres à un niveau : uniquement si l'établissement l'a activé.
      .filter((item) => !item.schoolLevel || Boolean(options.school?.levels.includes(item.schoolLevel)))
      .filter((item) => !item.family || item.family === v.family)
      .filter((item) => !item.feature || Boolean(options.university?.features[item.feature]))
      // Fonctionnalités arrêtées (établissement ou Super Admin).
      .filter((item) => !options.hidden?.includes(item.href))
      .map((item) => ({ ...item, label: localizedLabel(item, v) })),
  })).filter((section) => section.items.length > 0);
}
