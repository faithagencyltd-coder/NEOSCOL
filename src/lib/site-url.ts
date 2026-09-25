import "server-only";

import { headers } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Adresse publique de l'application pour les liens partagés : NEXT_PUBLIC_SITE_URL
 * s'il désigne un vrai domaine, sinon l'adresse réseau local du poste (NEOSCOL_LAN_URL),
 * sinon l'hôte de la requête (Codespaces, réseau local).
 */
export async function publicBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && !/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured)) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  // Poste local (paquet portable) consulté en « localhost » : l'adresse Wi-Fi du poste,
  // seule joignable par les autres appareils du même réseau.
  const lan = process.env.NEOSCOL_LAN_URL;
  if (lan && (!host || /^(localhost|127\.0\.0\.1)(:|$)/.test(host))) return lan.replace(/\/+$/, "");
  if (!host) return publicEnv.siteUrl.replace(/\/+$/, "");
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Lien des portails d'un établissement (/acces/CODE). */
export async function portalLinkUrl(code: string): Promise<string> {
  return `${await publicBaseUrl()}/acces/${encodeURIComponent(code)}`;
}
