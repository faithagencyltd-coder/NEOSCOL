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
  | "kiosk";

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
      { href: "/presences", label: "Présences", icon: "attendance", anyOf: ["attendance.take", "attendance.read", "attendance.manage"], keywords: "appel absences retards" },
      { href: "/notes", label: "Notes", icon: "grades", anyOf: ["grades.read", "grades.enter", "grades.manage"], keywords: "évaluations devoirs saisie" },
      { href: "/bulletins", label: "Bulletins", icon: "reportCards", anyOf: ["report_cards.manage", "grades.read"], keywords: "moyennes rangs appréciations" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/personnel", label: "Personnel", icon: "staff", anyOf: ["staff.read"], keywords: "enseignants badges comptes matricule" },
      { href: "/personnel/pointage", label: "Pointage du personnel", icon: "staffAttendance", anyOf: ["staff_attendance.read"], keywords: "arrivées retards badges scans" },
      { href: "/pointage", label: "Tablette de pointage", icon: "kiosk", anyOf: ["staff_attendance.scan"], keywords: "scanner badge QR" },
    ],
  },
  {
    label: "Compte",
    items: [{ href: "/mon-compte", label: "Mon compte", icon: "account", anyOf: [], keywords: "profil mot de passe" }],
  },
];

export function visibleNavigation(permissions: ReadonlySet<Permission>): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.has(p))),
  })).filter((section) => section.items.length > 0);
}
