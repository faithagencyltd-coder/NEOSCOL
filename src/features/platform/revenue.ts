/** Période du tableau de bord des revenus (dates AAAA-MM-JJ, bornes incluses). */
export type RevenuePeriod = { from: string; to: string; preset: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const iso = (d: Date) => d.toISOString().slice(0, 10);

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && iso(new Date(`${value}T00:00:00Z`)) === value;
}

/** Raccourcis proposés, calculés à partir de la date du jour (UTC). */
export function revenuePresets(today: Date): { key: string; label: string; from: string; to: string }[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return [
    { key: "mois", label: "Ce mois", from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) },
    { key: "mois-dernier", label: "Mois dernier", from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    { key: "trimestre", label: "Ce trimestre", from: iso(new Date(Date.UTC(y, m - (m % 3), 1))), to: iso(new Date(Date.UTC(y, m - (m % 3) + 3, 0))) },
    { key: "annee", label: "Cette année", from: `${y}-01-01`, to: `${y}-12-31` },
    { key: "12-mois", label: "12 derniers mois", from: iso(new Date(Date.UTC(y, m - 11, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) },
  ];
}

/** Lit la période depuis l'adresse (?periode=… ou ?du=…&au=…) ; par défaut, le mois en cours. */
export function parseRevenuePeriod(params: Record<string, string | string[] | undefined>, today: Date): RevenuePeriod {
  const presets = revenuePresets(today);
  const du = params.du;
  const au = params.au;
  if (isValidDate(du) && isValidDate(au) && du <= au) return { from: du, to: au, preset: null };
  const preset = presets.find((p) => p.key === params.periode) ?? presets[0]!;
  return { from: preset.from, to: preset.to, preset: preset.key };
}

/** Évolution en % par rapport à la période précédente (null si aucune base). */
export function evolution(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

type Amount = { currency: string; amount: number; count: number };
type SubscriptionLine = {
  organization_name: string;
  organization_code: string;
  plan_name: string;
  status: string;
  status_changed_at: string;
};

/** Réponse de platform_revenue_summary. */
export type RevenueSummary = {
  from: string;
  to: string;
  totals: Amount[];
  previous_totals: Amount[];
  discounts: Amount[];
  test_excluded: { count: number; amount: number };
  monthly: (Amount & { month: string })[];
  by_label: (Amount & { label: string })[];
  by_method: (Amount & { method: string })[];
  top_organizations: (Amount & { name: string; code: string })[];
  new_organizations: number;
  new_paying: number;
  trials_ended: number;
  trials_converted: number;
  trialing_now: number;
  active_now: number;
  recurring: Amount[];
  unpaid_count: number;
  unpaid_totals: { currency: string; amount: number }[];
  unpaid: (SubscriptionLine & { amount: number; currency: string })[];
  churn_count: number;
  churn: (SubscriptionLine & { cancellation_reason: string | null })[];
};
