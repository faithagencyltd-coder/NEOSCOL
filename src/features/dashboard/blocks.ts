/** Blocs du tableau de bord que chaque utilisateur peut masquer ou afficher. */
export const DASHBOARD_BLOCKS = [
  { key: "stats", label: "Chiffres clés" },
  { key: "finance", label: "Encaissements récents et situation des factures" },
  { key: "activity", label: "Activité récente" },
  { key: "alerts", label: "Alertes importantes" },
  { key: "lessons", label: "Mes cours aujourd'hui" },
  { key: "teaching", label: "Mes enseignements" },
  { key: "by_class", label: "Effectifs par classe" },
  { key: "averages", label: "Moyennes par classe" },
  { key: "announcements", label: "Annonces" },
] as const;

export type DashboardBlock = (typeof DASHBOARD_BLOCKS)[number]["key"];
