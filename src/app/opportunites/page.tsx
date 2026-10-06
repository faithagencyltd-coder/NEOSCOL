import { BadgeCheck, Briefcase, MapPin, Plus, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SiteShell } from "@/features/marketing/components/site-shell";
import { OPPORTUNITY_KINDS } from "@/features/ecosystem/constants";
import type { OpportunityCard } from "@/features/ecosystem/discover";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "NeoScool Opportunities — emplois, stages, répétiteurs et services éducatifs",
  description: "Offres d'emploi des établissements, stages, cours à domicile, répétiteurs et services liés à l'éducation. Annonces modérées par NeoScool.",
  alternates: { canonical: "/opportunites" },
};

const PAGE = 20;

/** NeoScool Opportunities : annonces publiques (établissements et particuliers), modérées. */
export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunites">) {
  const sp = await searchParams;
  const f = { q: param(sp, "q") ?? "", categorie: param(sp, "categorie") ?? "", type: param(sp, "type") ?? "", pays: param(sp, "pays") ?? "", ville: param(sp, "ville") ?? "" };
  const page = Math.max(1, Number(param(sp, "page") ?? 1) || 1);
  const supabase = await createClient();
  const [{ data: rows }, { data: categories }, { data: countries }] = await Promise.all([
    supabase.rpc("opportunities_search", { p_query: f.q, p_category: f.categorie, p_kind: f.type, p_country: f.pays, p_city: f.ville, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.from("opportunity_categories").select("key, label, kind").eq("active", true).order("sort_order"),
    supabase.from("countries").select("code, name").order("name"),
  ]);
  const list = (rows ?? []) as unknown as OpportunityCard[];
  const total = Number(list[0]?.total ?? 0);
  const countryName = new Map((countries ?? []).map((c) => [c.code, c.name]));
  const query = (extra: Record<string, string>) => `/opportunites?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), ...extra })}`;

  return (
    <SiteShell locale="fr" alternate="/opportunites">
      <section className="bg-gradient-to-br from-[#0b2559] via-[#0e3a82] to-[#0e4a9a] px-4 py-12 text-white sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">NeoScool Opportunities</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Emplois, stages, répétiteurs et services éducatifs</h1>
          <p className="max-w-2xl text-white/80">Annonces des établissements et des particuliers, modérées par NeoScool. Ne versez jamais d&apos;argent pour obtenir un emploi.</p>
          <form method="get" role="search" className="grid gap-2 rounded-2xl bg-white p-3 text-foreground shadow-lg sm:grid-cols-[2fr_1fr_1fr_1fr_auto]" data-testid="opportunities-search">
            <input name="q" defaultValue={f.q} placeholder="Poste, matière, mot-clé…" className="h-11 rounded-xl border border-border px-3 text-sm" aria-label="Rechercher" />
            <select name="categorie" defaultValue={f.categorie} className="h-11 rounded-xl border border-border px-2 text-sm" aria-label="Catégorie">
              <option value="">Toutes les catégories</option>
              {(categories ?? []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select name="pays" defaultValue={f.pays} className="h-11 rounded-xl border border-border px-2 text-sm" aria-label="Pays">
              <option value="">Tous les pays</option>
              {(countries ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="ville" defaultValue={f.ville} placeholder="Ville" className="h-11 rounded-xl border border-border px-3 text-sm" aria-label="Ville" />
            <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0e4a9a] px-4 text-sm font-semibold text-white">
              <Search className="size-4" aria-hidden /> Rechercher
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Types d'annonces">
            <Link href={query({ type: "" })} className={!f.type ? "rounded-full bg-primary px-3 py-1 text-white" : "rounded-full border border-border px-3 py-1"}>
              Tout
            </Link>
            {Object.entries(OPPORTUNITY_KINDS).map(([k, label]) => (
              <Link key={k} href={query({ type: k })} className={f.type === k ? "rounded-full bg-primary px-3 py-1 text-white" : "rounded-full border border-border px-3 py-1"}>
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/opportunites/publier" className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white" data-testid="publish-link">
            <Plus className="size-4" aria-hidden /> Publier une annonce
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center" data-testid="opportunities-empty">
            <p className="text-lg font-semibold">Aucune annonce pour le moment.</p>
            <p className="text-muted-foreground">NeoScool Opportunities ouvre progressivement, pays par pays.</p>
          </div>
        ) : (
          <ul className="grid gap-3" data-testid="opportunities-results">
            {list.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunites/${o.id}`} className="grid gap-2 rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{o.category_label}</span>
                    {o.featured ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 font-semibold text-amber-950">
                        <Sparkles className="size-3" aria-hidden /> À la une
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">Publiée le {new Date(o.published_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <p className="text-lg font-semibold">{o.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{o.excerpt}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Briefcase className="size-3.5" aria-hidden /> {o.author.name} {o.author.verified ? <BadgeCheck className="size-3.5 text-primary" aria-label="Établissement vérifié" /> : null}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden /> {[o.city, countryName.get(o.country) ?? o.country].filter(Boolean).join(", ")}
                    </span>
                    {o.compensation ? <span>{o.compensation}</span> : null}
                    {o.contract ? <span>{o.contract}</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > PAGE ? (
          <nav className="flex justify-center gap-3 text-sm" aria-label="Pages">
            {page > 1 ? <Link href={query({ page: String(page - 1) })}>← Précédent</Link> : null}
            <span>
              Page {page} / {Math.ceil(total / PAGE)}
            </span>
            {page * PAGE < total ? <Link href={query({ page: String(page + 1) })}>Suivant →</Link> : null}
          </nav>
        ) : null}
        <p className="text-xs text-muted-foreground">Les annonces sont publiées par leurs auteurs. Signalez toute annonce suspecte : l&apos;équipe NeoScool la vérifie.</p>
      </section>
    </SiteShell>
  );
}
