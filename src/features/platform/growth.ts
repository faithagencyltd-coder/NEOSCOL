/** Croissance de la plateforme (Super Admin › Analyses) : types et libellés partagés page / export. */
export type GrowthMonth = {
  month: string;
  new_organizations: number;
  total_organizations: number;
  new_users: number;
  active_users: number;
  trials: number;
  activations: number;
  renewals: number;
  cancellations: number;
  revenue: Record<string, number>;
};
export type Growth = {
  months: GrowthMonth[];
  activity: { active_organizations_30d: number; organizations: number; inactive: { id: string; name: string; last_login: string | null }[] };
};

export const GROWTH_COLUMNS: { key: Exclude<keyof GrowthMonth, "month" | "revenue">; label: string }[] = [
  { key: "new_organizations", label: "Nouveaux établissements" },
  { key: "total_organizations", label: "Établissements (total)" },
  { key: "new_users", label: "Nouveaux utilisateurs" },
  { key: "active_users", label: "Utilisateurs actifs" },
  { key: "trials", label: "Essais démarrés" },
  { key: "activations", label: "Activations" },
  { key: "renewals", label: "Renouvellements" },
  { key: "cancellations", label: "Résiliations" },
];

export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
