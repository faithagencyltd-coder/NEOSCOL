import type { MetadataRoute } from "next";

import { publicBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/** Robots : seules les pages publiques sont indexables ; les espaces connectés et les API ne le sont pas. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await publicBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: ["/", "/decouvrir", "/opportunites"], disallow: ["/api/", "/plateforme", "/espace", "/acces/", "/connexion", "/opportunites/publier", "/decouvrir/media/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
