import {
  Activity,
  ArrowLeftRight,
  BadgePercent,
  Bot,
  ChartColumn,
  ChartPie,
  CreditCard,
  Eye,
  FileLock2,
  Gem,
  Globe2,
  GraduationCap,
  HandCoins,
  Headset,
  History,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  Megaphone,
  MessageSquareText,
  MonitorSmartphone,
  Palette,
  PlugZap,
  ShieldCheck,
  Sigma,
  Store,
  Target,
  ToggleRight,
  TrendingUp,
  UserSearch,
  Users,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation de la console Super Admin, regroupée par domaine.
 * Mêmes rubriques qu'auparavant (aucune ajoutée ni retirée) ; libellés inchangés.
 */
export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};
export type PlatformNavGroup = { label: string; items: PlatformNavItem[] };

export const PLATFORM_NAV: PlatformNavGroup[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/plateforme", label: "Établissements", icon: LayoutDashboard },
      { href: "/plateforme/analytics", label: "Analytics", icon: ChartPie },
      { href: "/plateforme/analyses", label: "Analyses", icon: ChartColumn },
      { href: "/plateforme/revenus", label: "Revenus", icon: TrendingUp },
      { href: "/plateforme/visiteurs", label: "Visiteurs", icon: Eye },
    ],
  },
  {
    label: "Comptes et équipe",
    items: [
      { href: "/plateforme/comptes", label: "Comptes", icon: UserSearch },
      {
        href: "/plateforme/enseignants",
        label: "Enseignants multi-établissements",
        icon: Users,
      },
      { href: "/plateforme/equipe", label: "Équipe", icon: UsersRound },
    ],
  },
  {
    label: "Abonnements et paiements",
    items: [
      { href: "/plateforme/abonnements", label: "Abonnements", icon: Gem },
      { href: "/plateforme/formules", label: "Formules", icon: Layers },
      { href: "/plateforme/offres", label: "Offres", icon: BadgePercent },
      { href: "/plateforme/paiements", label: "Paiements", icon: CreditCard },
      {
        href: "/plateforme/paiements-en-ligne",
        label: "Paiements en ligne",
        icon: Wallet,
      },
      { href: "/plateforme/sms", label: "SMS", icon: MessageSquareText },
    ],
  },
  {
    label: "Modules et fonctionnalités",
    items: [
      {
        href: "/plateforme/modules",
        label: "Contrôle des modules",
        icon: ToggleRight,
      },
      {
        href: "/plateforme/affiliation",
        label: "Affiliation",
        icon: HandCoins,
        badge: "Nouveau",
      },
      {
        href: "/plateforme/tutorat",
        label: "Tutor Match",
        icon: GraduationCap,
        badge: "Nouveau",
      },
      {
        href: "/plateforme/ecosysteme",
        label: "Écosystème public",
        icon: Store,
      },
      { href: "/plateforme/assistant", label: "Assistant IA", icon: Bot },
    ],
  },
  {
    label: "Contenu et communication",
    items: [
      { href: "/plateforme/site", label: "Site et marque", icon: Palette },
      {
        href: "/plateforme/site-web",
        label: "Site web",
        icon: MonitorSmartphone,
      },
      {
        href: "/plateforme/communication",
        label: "Communication",
        icon: Megaphone,
      },
      { href: "/plateforme/commercial", label: "Commercial", icon: Target },
    ],
  },
  {
    label: "Pays et règles",
    items: [
      { href: "/plateforme/pays", label: "Pays", icon: Globe2 },
      { href: "/plateforme/regles", label: "Règles académiques", icon: Sigma },
      {
        href: "/plateforme/country-connect",
        label: "Country Connect",
        icon: ArrowLeftRight,
      },
    ],
  },
  {
    label: "Sécurité et audit",
    items: [
      { href: "/plateforme/securite", label: "Sécurité", icon: ShieldCheck },
      { href: "/plateforme/supervision", label: "Supervision", icon: Activity },
      { href: "/plateforme/journal", label: "Journal", icon: History },
      {
        href: "/plateforme/confidentialite",
        label: "Confidentialité",
        icon: FileLock2,
      },
      { href: "/plateforme/maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
  {
    label: "Support et intégrations",
    items: [
      { href: "/plateforme/incidents", label: "Assistance", icon: LifeBuoy },
      { href: "/plateforme/support", label: "Support Center", icon: Headset },
      {
        href: "/plateforme/integrations",
        label: "Intégrations",
        icon: PlugZap,
      },
    ],
  },
];

export const isNavActive = (href: string, pathname: string) =>
  href === "/plateforme"
    ? pathname === href || pathname.startsWith("/plateforme/etablissements")
    : pathname === href || pathname.startsWith(`${href}/`);

/** Rubrique affichée dans la barre du haut (fil d'Ariane). */
export function currentNav(
  pathname: string,
): { group: string; item: PlatformNavItem } | null {
  for (const group of PLATFORM_NAV) {
    const item = group.items.find((i) => isNavActive(i.href, pathname));
    if (item) return { group: group.label, item };
  }
  return null;
}
