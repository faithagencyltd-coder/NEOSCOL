"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type SearchResult = { type: string; label: string; id: string; title: string; subtitle: string; href: string };

/** Types d'entités qui disposent d'une page de détail. */
const ROUTES: Record<string, { label: string; href: (id: string) => string }> = {
  student: { label: "Élève", href: (id) => `/eleves/${id}` },
  guardian: { label: "Parent", href: (id) => `/parents/${id}` },
  class: { label: "Classe", href: (id) => `/classes/${id}` },
  enrollment: { label: "Inscription", href: (id) => `/inscriptions/${id}` },
};

/** Recherche globale : la RPC est en SECURITY INVOKER, chacun ne trouve que ce qu'il peut voir. */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const context = await getSessionContext();
  const term = query.trim().slice(0, 80);
  if (!context?.organization || term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("global_search", {
    p_organization_id: context.organization.id,
    p_query: term,
    p_limit: 20,
  });
  return (data ?? []).flatMap((row) => {
    const route = ROUTES[row.entity_type];
    return route
      ? [{ type: row.entity_type, label: route.label, id: row.entity_id, title: row.title, subtitle: row.subtitle, href: route.href(row.entity_id) }]
      : [];
  });
}
