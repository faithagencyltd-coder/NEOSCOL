import { isUuid } from "@/lib/utils/search-params";

import type { ListFilters, Sex } from "./data";

/** Paramètres d'export lus dans l'adresse (identifiants vérifiés ; la RLS fait le reste). */
export function uuidParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && isUuid(value) ? value : null;
}

export function uuidList(params: URLSearchParams, key: string): string[] {
  return Array.from(new Set(params.getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(isUuid))).slice(0, 300);
}

export function listFilters(params: URLSearchParams, yearId: string | null): ListFilters {
  const sex = params.get("sexe");
  return {
    yearId,
    classIds: uuidList(params, "classes"),
    levelId: uuidParam(params, "niveau"),
    programId: uuidParam(params, "filiere"),
    trackId: uuidParam(params, "parcours"),
    groupId: uuidParam(params, "groupe"),
    sex: (sex === "M" || sex === "F" ? sex : "all") as Sex,
  };
}
