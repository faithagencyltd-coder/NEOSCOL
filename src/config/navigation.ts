import type { Permission } from "@/config/permissions";

export type NavIcon =
  | "dashboard"
  | "account"
  | "students"
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
  | "templates";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Au moins une de ces permissions est requise (vide = tout utilisateur connecté). */
  anyOf: readonly Permission[];
  keywords?: string;
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
    ],
  },
  {
    label: "Établissement",
    items: [
      { href: "/eleves", label: "Élèves", icon: "students", anyOf: ["students.read"], keywords: "dossier matricule étudiants apprenants" },
      { href: "/inscriptions", label: "Inscriptions", icon: "enrollments", anyOf: ["enrollments.read"], keywords: "réinscription validation" },
      { href: "/parents", label: "Parents et tuteurs", icon: "guardians", anyOf: ["guardians.read"], keywords: "famille tuteur" },
      { href: "/personnel", label: "Personnel", icon: "staff", anyOf: ["staff.read"], keywords: "enseignants formateurs administratif badges comptes matricule" },
      { href: "/classes", label: "Classes", icon: "classes", anyOf: ["academic.read"], keywords: "effectif session filière" },
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
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/finances", label: "Synthèse financière", icon: "finance", anyOf: ["finance.read"], keywords: "revenus solde" },
      { href: "/finances?onglet=paiements", label: "Paiements", icon: "payments", anyOf: ["finance.read"], keywords: "encaissements reçus" },
      { href: "/finances?onglet=factures", label: "Factures", icon: "invoices", anyOf: ["finance.read"], keywords: "factures échéances" },
      { href: "/finances?onglet=rappels", label: "Impayés et rappels", icon: "overdue", anyOf: ["finance.read"], keywords: "impayés retard rappels relances" },
      { href: "/finances?onglet=depenses", label: "Dépenses", icon: "expenses", anyOf: ["finance.expenses.read", "finance.expenses.manage"], keywords: "dépenses fournisseurs justificatifs" },
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

export function visibleNavigation(permissions: ReadonlySet<Permission>, options: { demo?: boolean } = {}): NavSection[] {
  const sections = options.demo
    ? NAVIGATION.map((section) => (section.label === "Portails" ? { ...section, items: [...section.items, DEMO_NAV_ITEM] } : section))
    : NAVIGATION;
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.has(p))),
  })).filter((section) => section.items.length > 0);
}
