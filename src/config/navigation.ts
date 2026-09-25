import type { SchoolConfig, SchoolLevel } from "@/features/academic/school";
import type { Permission } from "@/config/permissions";
import { vocabularyFor, type Vocabulary } from "@/lib/vocabulary";

export type NavIcon =
  | "dashboard"
  | "account"
  | "students"
  | "history"
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
  | "stats";

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
      { href: "/formation/inscription", label: "Inscrire un apprenant", icon: "enrollLearner", anyOf: ["enrollments.manage"], family: "training", keywords: "inscription apprenant tarif échéancier paiement" },
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
      { href: "/inscriptions", label: "Inscriptions", icon: "enrollments", anyOf: ["enrollments.read"], keywords: "réinscription validation" },
      { href: "/parents", label: "Parents et tuteurs", icon: "guardians", anyOf: ["guardians.read"], keywords: "famille tuteur" },
      { href: "/personnel", label: "Personnel", icon: "staff", anyOf: ["staff.read"], keywords: "enseignants formateurs administratif badges comptes matricule" },
      { href: "/classes", label: "Classes", icon: "classes", anyOf: ["academic.read"], keywords: "effectif session filière" },
      { href: "/structure?onglet=filieres", label: "Séries et filières", icon: "structure", anyOf: ["academic.manage"], keywords: "lycée général technique séries filières F1 F2 F3 F4 G1 G2 G3 génie civil électrotechnique", schoolLevel: "lycee" },
      { href: "/structure?onglet=matieres", label: "Matières", icon: "subjects", anyOf: ["academic.manage"], keywords: "matières modules coefficients" },
      { href: "/emploi-du-temps", label: "Emploi du temps", icon: "timetable", anyOf: ["timetable.read", "timetable.manage"], keywords: "cours horaires salles" },
    ],
  },
  {
    label: "Pédagogie",
    items: [
      { href: "/mes-cours", label: "Mes cours", icon: "lessons", anyOf: ["attendance.take"], keywords: "appel cours emploi du temps badge" },
      { href: "/presences", label: "Présences", icon: "attendance", anyOf: ["attendance.read", "attendance.manage", "attendance.justify"], keywords: "appel absences retards justificatifs" },
      { href: "/notes", label: "Notes et évaluations", icon: "grades", anyOf: ["grades.read", "grades.enter", "grades.manage"], keywords: "évaluations devoirs saisie interrogations examens" },
      { href: "/bulletins", label: "Bulletins", icon: "reportCards", anyOf: ["report_cards.manage", "grades.read"], keywords: "moyennes rangs appréciations" },
      { href: "/bulletins/apercu", label: "Aperçu des bulletins", icon: "reportCards", anyOf: ["grades.enter"], keywords: "aperçu moyennes classe" },
      { href: "/documents", label: "Documents", icon: "documents", anyOf: ["documents.read", "documents.generate", "documents.dossier"], keywords: "certificats attestations reçus cartes dossier complet PDF" },
      { href: "/documents/modeles", label: "Document Studio", icon: "templates", anyOf: ["documents.templates.manage"], keywords: "modèles certificats convocation contrat personnalisation" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/communication", label: "Annonces", icon: "communication", anyOf: [], keywords: "annonces information publication familles" },
      { href: "/messages", label: "Messagerie", icon: "communication", anyOf: [], keywords: "messages conversation parents enseignants" },
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
      { href: "/abonnement", label: "Mon abonnement", icon: "subscription", anyOf: ["billing.read"], keywords: "abonnement NéoScol formule facture paiement essai renouveler tarif" },
      { href: "/parametres", label: "Configuration", icon: "settings", anyOf: ["settings.manage"], keywords: "impayés restrictions rappels pointage notes verrouillage" },
      { href: "/bulletins/configuration", label: "Modèle de bulletin", icon: "templates", anyOf: ["report_cards.manage"], keywords: "bulletin colonnes coefficients modèle" },
      { href: "/formulaires", label: "Formulaires", icon: "forms", anyOf: ["forms.manage"], keywords: "champs personnalisés pièces" },
    ],
  },
  {
    label: "Compte",
    items: [{ href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" }],
  },
];

/** Entrée « Mode démonstration », ajoutée uniquement lorsque NEOSCOL_DEMO_MODE est actif. */
export const DEMO_NAV_ITEM: NavItem = { href: "/demo", label: "Mode démonstration", icon: "demo", anyOf: [], keywords: "démo rôles scénarios" };

/** Libellés dépendant du type d'établissement (élèves / étudiants / apprenants…). */
function localizedLabel(item: NavItem, v: Vocabulary): string {
  if (item.href === "/eleves") return v.students;
  if (item.href === "/classes") return v.classes;
  return item.label;
}

export function visibleNavigation(
  permissions: ReadonlySet<Permission>,
  options: { demo?: boolean; organizationType?: string | null; school?: SchoolConfig | null } = {},
): NavSection[] {
  const v = vocabularyFor(options.organizationType);
  const sections = options.demo
    ? NAVIGATION.map((section) => (section.label === "Portails" ? { ...section, items: [...section.items, DEMO_NAV_ITEM] } : section))
    : NAVIGATION;
  return sections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.has(p)))
      // Entrées propres à un niveau : uniquement si l'établissement l'a activé.
      .filter((item) => !item.schoolLevel || Boolean(options.school?.levels.includes(item.schoolLevel)))
      .filter((item) => !item.family || item.family === v.family)
      .map((item) => ({ ...item, label: localizedLabel(item, v) })),
  })).filter((section) => section.items.length > 0);
}
