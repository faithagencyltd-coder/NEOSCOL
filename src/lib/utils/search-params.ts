/** Lecture sûre des paramètres d'URL des listes (recherche, filtres, pagination). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function param(params: RawSearchParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.trim() !== "" ? single.trim().slice(0, 100) : undefined;
}

export function pageParam(params: RawSearchParams): number {
  const page = Number.parseInt(param(params, "page") ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? Math.min(page, 10000) : 1;
}

export function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

/** Échappe les caractères spéciaux des motifs ILIKE / PostgREST. */
export function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Échappe une valeur pour une comparaison ILIKE exacte (sans jokers). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
