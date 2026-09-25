import "server-only";

import { headers } from "next/headers";

/**
 * Cookies « Secure » uniquement quand la page est servie en HTTPS : en réseau
 * local (http://192.168.x.x:3000 depuis un téléphone sur le même Wi-Fi), un
 * cookie Secure serait refusé par le navigateur et la session perdue.
 */
export async function secureCookiesForRequest(): Promise<boolean> {
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
}
