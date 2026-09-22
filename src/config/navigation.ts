import type { Permission } from "@/config/permissions";

export type NavIcon = "dashboard" | "account";

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
