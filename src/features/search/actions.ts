"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { vocabularyFor, type Vocabulary } from "@/lib/vocabulary";

export type SearchResult = { type: string; label: string; id: string; title: string; subtitle: string; href: string };

type Route = { label: (v: Vocabulary) => string; href: (id: string, title: string) => string };

/** Types d'entités qui disposent d'une page (ou d'un document) de destination. */
const ROUTES: Record<string, Route> = {
  student: { label: (v) => v.student, href: (id) => `/eleves/${id}` },
  guardian: { label: () => "Parent", href: (id) => `/parents/${id}` },
  staff: { label: () => "Personnel", href: (id) => `/personnel/${id}` },
  class: { label: (v) => v.klass, href: (id) => `/classes/${id}` },
  program: { label: () => "Formation", href: () => "/structure?onglet=filieres" },
  enrollment: { label: () => "Inscription", href: (id) => `/inscriptions/${id}` },
  invoice: { label: () => "Facture", href: (id) => `/finances/factures/${id}` },
  payment: { label: () => "Paiement", href: (_, title) => `/finances?onglet=paiements&q=${encodeURIComponent(title)}` },
  document: { label: () => "Document", href: (id) => `/api/documents/emis/${id}` },
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
  const v = vocabularyFor(context.organization.type);
  return (data ?? []).flatMap((row) => {
    const route = ROUTES[row.entity_type];
    return route
      ? [{ type: row.entity_type, label: route.label(v), id: row.entity_id, title: row.title, subtitle: row.subtitle, href: route.href(row.entity_id, row.title) }]
      : [];
  });
}
