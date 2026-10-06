import { GROUP_NAVIGATION, NAVIGATION, UNIVERSITY_NAVIGATION } from "@/config/navigation";

/** Filtres communs de la rubrique Analytics (adresse de la page) : période, pays, appareil. */
export type AnalyticsFilters = { from: string; to: string; country: string; device: string; preset: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const PRESETS: Record<string, { label: string; days: number }> = {
  "7j": { label: "7 derniers jours", days: 7 },
  "30j": { label: "30 derniers jours", days: 30 },
  "90j": { label: "90 derniers jours", days: 90 },
  "12m": { label: "12 derniers mois", days: 365 },
};

export function parseFilters(params: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const today = new Date();
  let preset = get("periode") || "30j";
  let from = get("du");
  let to = get("au");
  if (valid(from) && valid(to) && from <= to) {
    preset = "perso";
  } else {
    const days = PRESETS[preset]?.days ?? 30;
    if (!PRESETS[preset]) preset = "30j";
    to = iso(today);
    from = iso(new Date(today.getTime() - (days - 1) * 86_400_000));
  }
  // Période plafonnée à 400 jours.
  if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) from = iso(new Date(Date.parse(to) - 400 * 86_400_000));
  const country = /^[A-Z]{2}$/.test(get("pays")) ? get("pays") : "";
  const device = ["mobile", "tablet", "desktop"].includes(get("appareil")) ? get("appareil") : "";
  return { from, to, country, device, preset };
}

export function filterQuery(f: AnalyticsFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.preset === "perso") {
    q.set("du", f.from);
    q.set("au", f.to);
  } else q.set("periode", f.preset);
  if (f.country) q.set("pays", f.country);
  if (f.device) q.set("appareil", f.device);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q.toString();
}

export const rpcArgs = (f: AnalyticsFilters) => ({ p_from: f.from, p_to: f.to, p_country: f.country, p_device: f.device });

export const CONVERSION_LABELS: Record<string, string> = {
  demo_request: "Demandes de démonstration",
  contact_request: "Demandes de contact",
  discover_request: "Demandes d'information (Discover)",
  signup_submitted: "Formulaires d'inscription envoyés",
  public_signup: "Comptes particuliers créés",
};

/** Rubrique du site d'après l'adresse de la page (« modules consultés »). */
export function siteSection(path: string): string {
  if (path === "/" || path === "/en") return "Accueil";
  const rules: [RegExp, string][] = [
    [/^\/(secteurs\/scolaire|en\/sectors\/school)/, "Module scolaire"],
    [/^\/(secteurs\/universite|en\/sectors\/university)/, "Module université"],
    [/^\/(secteurs\/formation|en\/sectors\/training)/, "Module formation professionnelle"],
    [/^\/(tarifs|pricing|en\/pricing)/, "Tarifs"],
    [/^\/inscription/, "Inscription d'un établissement"],
    [/^\/(contact|en\/contact)/, "Contact et démonstration"],
    [/^\/(pays|en\/countries)/, "Pays"],
    [/^\/decouvrir/, "NeoScool Discover"],
    [/^\/opportunites/, "NeoScool Opportunities"],
    [/^\/demo/, "Démonstration en ligne"],
    [/^\/(aide|conditions|confidentialite)/, "Aide et informations légales"],
    [/^\/(connexion|acces)/, "Connexion et portails"],
  ];
  return rules.find(([r]) => r.test(path))?.[1] ?? "Autres pages";
}

/** Module de l'application d'après le premier segment de l'adresse (libellés du menu). */
const APP_MODULES: Record<string, string> = (() => {
  const items = [NAVIGATION, UNIVERSITY_NAVIGATION, GROUP_NAVIGATION].flatMap((nav) => nav.flatMap((section) => section.items));
  const map: Record<string, string> = {};
  // Libellé de l'entrée dont l'adresse est exactement « /segment », sinon de la première entrée du segment.
  for (const item of items) if (/^\/[a-z0-9-]+$/.test(item.href) && !map[item.href.slice(1)]) map[item.href.slice(1)] = item.label;
  for (const item of items) {
    const seg = item.href.split(/[?#]/)[0]!.split("/")[1];
    if (seg && !map[seg]) map[seg] = item.label;
  }
  return { ...map, plateforme: "Console plateforme", portail: "Portail", visibilite: "Visibilité" };
})();
export const appModuleLabel = (seg: string) => APP_MODULES[seg] ?? seg;

export const fmtDuration = (ms: number | null | undefined) => {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
export const pct = (part: number, total: number) => (total > 0 ? Math.round((1000 * part) / total) / 10 : 0);
/** Évolution par rapport à la période précédente (null si pas de base de comparaison). */
export const delta = (cur: number, prev: number) => (prev > 0 ? Math.round((1000 * (cur - prev)) / prev) / 10 : null);
