import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Rôles de l'équipe de la plateforme (Super Admin › Équipe). */
export type PlatformRole = "owner" | "admin" | "viewer";

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  viewer: "Lecture seule",
};

export const PLATFORM_ROLE_HINTS: Record<PlatformRole, string> = {
  owner: "Tout, y compris la gestion de l'équipe.",
  admin: "Tout, sauf la gestion de l'équipe.",
  viewer: "Consulte toute la console, ne modifie rien.",
};

/** Rôle du compte connecté dans l'équipe de la plateforme (null : hors équipe). */
export async function getPlatformRole(): Promise<PlatformRole | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_platform_role");
  return data === "owner" || data === "admin" || data === "viewer" ? data : null;
}

export const canWritePlatform = (role: PlatformRole | null): boolean => role === "owner" || role === "admin";

/** Message de refus d'une modification (la base refuse de toute façon). */
export function platformDeniedMessage(role: PlatformRole | null): string {
  return role === "viewer"
    ? "Votre rôle « Lecture seule » permet de consulter la console, pas de la modifier."
    : "Réservé à l'administration de la plateforme NeoScool.";
}
