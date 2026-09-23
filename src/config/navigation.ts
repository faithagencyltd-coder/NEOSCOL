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
  | "settings";

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
    items: [{ href: "/tableau-de-bord", label: "Tableau de bord", icon: "dashboard", anyOf: [], keywords: "accueil statistiques" }],
  },
  {
    label: "Scolarité",
    items: [
      { href: "/eleves", label: "Élèves", icon: "students", anyOf: ["students.read"], keywords: "dossier matricule" },
      { href: "/inscriptions", label: "Inscriptions", icon: "enrollments", anyOf: ["enrollments.read"], keywords: "réinscription validation" },
      { href: "/parents", label: "Parents et tuteurs", icon: "guardians", anyOf: ["guardians.read"], keywords: "famille tuteur" },
      { href: "/classes", label: "Classes", icon: "classes", anyOf: ["academic.read"], keywords: "effectif session" },
      { href: "/structure", label: "Structure académique", icon: "structure", anyOf: ["academic.manage"], keywords: "années périodes niveaux filières matières salles" },
      { href: "/formulaires", label: "Formulaires", icon: "forms", anyOf: ["forms.manage"], keywords: "champs personnalisés pièces" },
    ],
  },
  {
    label: "Pédagogie",
    items: [
      { href: "/emploi-du-temps", label: "Emploi du temps", icon: "timetable", anyOf: ["timetable.read", "timetable.manage"], keywords: "cours horaires salles" },
      { href: "/mes-cours", label: "Mes cours", icon: "lessons", anyOf: ["attendance.take"], keywords: "appel cours emploi du temps badge" },
      { href: "/presences", label: "Présences", icon: "attendance", anyOf: ["attendance.read", "attendance.manage", "attendance.justify"], keywords: "appel absences retards justificatifs" },
      { href: "/notes", label: "Notes", icon: "grades", anyOf: ["grades.read", "grades.enter", "grades.manage"], keywords: "évaluations devoirs saisie" },
      { href: "/bulletins", label: "Bulletins", icon: "reportCards", anyOf: ["report_cards.manage", "grades.read"], keywords: "moyennes rangs appréciations configuration colonnes" },
      { href: "/bulletins/apercu", label: "Aperçu des bulletins", icon: "reportCards", anyOf: ["grades.enter"], keywords: "aperçu moyennes classe" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/finances", label: "Finances", icon: "finance", anyOf: ["finance.read", "finance.expenses.read", "finance.expenses.manage"], keywords: "factures paiements reçus dépenses impayés rappels" },
      { href: "/personnel", label: "Personnel", icon: "staff", anyOf: ["staff.read"], keywords: "enseignants badges comptes matricule" },
      { href: "/personnel/pointage", label: "Pointage du personnel", icon: "staffAttendance", anyOf: ["staff_attendance.read"], keywords: "arrivées retards badges scans" },
      { href: "/pointage", label: "Tablette de pointage", icon: "kiosk", anyOf: ["staff_attendance.scan"], keywords: "scanner badge QR" },
      { href: "/parametres", label: "Paramètres", icon: "settings", anyOf: ["settings.manage"], keywords: "impayés restrictions rappels pointage notes verrouillage" },
    ],
  },
  {
    label: "Compte",
    items: [
      { href: "/portail", label: "Espace famille", icon: "portal", anyOf: ["portal.parent", "portal.student"], keywords: "portail parent élève enfants" },
      { href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" },
    ],
  },
];

export function visibleNavigation(permissions: ReadonlySet<Permission>): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.has(p))),
  })).filter((section) => section.items.length > 0);
}
