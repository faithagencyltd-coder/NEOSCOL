import type { MetadataRoute } from "next";

import { ROUTES } from "@/features/marketing/content";
import { publicBaseUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Plan du site : pages publiques, fiches Discover publiées et annonces Opportunities publiques (rien d'autre). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await publicBaseUrl();
  const supabase = await createClient();
  const pages: MetadataRoute.Sitemap = [
    ...Object.values(ROUTES).flatMap((r) => [r.fr, r.en]),
    "/decouvrir",
    "/opportunites",
  ].map((path) => ({ url: `${base}${path === "/" ? "" : path}`, changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));

  for (let offset = 0; offset < 5000; offset += 60) {
    const { data } = await supabase.rpc("discover_search", { p_query: "", p_country: "", p_city: "", p_type: "", p_program: "", p_sort: "recent", p_limit: 60, p_offset: offset });
    const rows = (data ?? []) as { slug: string }[];
    pages.push(...rows.flatMap((r) => [{ url: `${base}/decouvrir/${r.slug}`, changeFrequency: "weekly" as const, priority: 0.6 }]));
    if (rows.length < 60) break;
  }
  for (let offset = 0; offset < 5000; offset += 60) {
    const { data } = await supabase.rpc("opportunities_search", { p_query: "", p_category: "", p_kind: "", p_country: "", p_city: "", p_limit: 60, p_offset: offset });
    const rows = (data ?? []) as { id: string; published_at: string }[];
    pages.push(...rows.map((r) => ({ url: `${base}/opportunites/${r.id}`, lastModified: r.published_at, changeFrequency: "daily" as const, priority: 0.5 })));
    if (rows.length < 60) break;
  }
  return pages;
}
