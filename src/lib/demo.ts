import "server-only";

/**
 * Mode démonstration : changement de rôle en un clic entre les comptes de
 * démonstration. Désactivé par défaut ; ne jamais l'activer en production.
 */
export function isDemoMode(): boolean {
  return process.env.NEOSCOL_DEMO_MODE === "1" || process.env.NEOSCOL_DEMO_MODE === "true";
}

/** Mot de passe commun des comptes de démonstration (voir supabase/seed.sql). */
export function demoPassword(): string {
  return process.env.NEOSCOL_DEMO_PASSWORD ?? "NeoScol-Demo-2026!";
}
