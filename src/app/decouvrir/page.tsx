import { BadgeCheck, MapPin, Search, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SiteShell } from "@/features/marketing/components/site-shell";
import { logoUrl, mediaUrl, type DiscoverCard } from "@/features/ecosystem/discover";
import { ORG_TYPE_LABELS } from "@/features/platform/org-types";
import { createClient } from "@/lib/supabase/server";
import { param } from "@/lib/utils/search-params";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "NeoScool Discover — trouver une école, un centre de formation, une université",
  description: "Annuaire des établissements utilisant NeoScool : écoles, collèges, lycées, centres de formation et universités. Informations publiées par les établissements eux-mêmes.",
  alternates: { canonical: "/decouvrir" },
};

const PAGE = 24;

/** NeoScool Discover : recherche publique des établissements (informations fournies par eux-mêmes). */
export default async function DiscoverPage({ searchParams }: PageProps<"/decouvrir">) {
  const params = await searchParams;
  const f = { q: param(params, "q") ?? "", pays: param(params, "pays") ?? "", ville: param(params, "ville") ?? "", type: param(params, "type") ?? "", formation: param(params, "formation") ?? "", tri: param(params, "tri") ?? "" };
  const page = Math.max(1, Number(param(params, "page") ?? 1) || 1);
  const supabase = await createClient();
  const [{ data: rows }, { data: filters }, { data: countries }] = await Promise.all([
    supabase.rpc("discover_search", { p_query: f.q, p_country: f.pays, p_city: f.ville, p_type: f.type, p_program: f.formation, p_sort: f.tri, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.rpc("discover_filters"),
    supabase.from("countries").select("code, name"),
  ]);
  const list = (rows ?? []) as unknown as DiscoverCard[];
  const total = Number(list[0]?.total ?? 0);
  const fl = (filters ?? { countries: [], cities: [], types: [] }) as { countries: string[]; cities: string[]; types: string[] };
  const countryName = new Map((countries ?? []).map((c) => [c.code, c.name]));
  const nothingYet = total === 0 && !f.q && !f.pays && !f.ville && !f.type && !f.formation;
  const pageLink = (p: number) => `/decouvrir?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p) })}`;

  return (
    <SiteShell locale="fr" alternate="/decouvrir">
      <section className="bg-gradient-to-br from-[#0b2559] via-[#0e3a82] to-[#0e4a9a] px-4 py-12 text-white sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">NeoScool Discover</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Trouvez l&apos;établissement qui vous correspond</h1>
          <p className="max-w-2xl text-white/80">Écoles, collèges, lycées, centres de formation et universités. Les informations sont publiées et tenues à jour par les établissements eux-mêmes.</p>
          <form method="get" className="grid gap-2 rounded-2xl bg-white p-3 text-foreground shadow-lg sm:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search" data-testid="discover-search">
            <input name="q" defaultValue={f.q} placeholder="Nom, formation, filière…" className="h-11 rounded-xl border border-border px-3 text-sm" aria-label="Rechercher" />
            <select name="pays" defaultValue={f.pays} className="h-11 rounded-xl border border-border px-2 text-sm" aria-label="Pays">
              <option value="">Tous les pays</option>
              {fl.countries.map((c) => (
                <option key={c} value={c}>
                  {countryName.get(c) ?? c}
                </option>
              ))}
            </select>
            <select name="ville" defaultValue={f.ville} className="h-11 rounded-xl border border-border px-2 text-sm" aria-label="Ville">
              <option value="">Toutes les villes</option>
              {fl.cities.sort().map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select name="type" defaultValue={f.type} className="h-11 rounded-xl border border-border px-2 text-sm" aria-label="Type d'établissement">
              <option value="">Tous les types</option>
              {fl.types.map((t) => (
                <option key={t} value={t}>
                  {ORG_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
            <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0e4a9a] px-4 text-sm font-semibold text-white">
              <Search className="size-4" aria-hidden /> Rechercher
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-8">
        {nothingYet ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center" data-testid="discover-empty">
            <p className="text-lg font-semibold">NeoScool Discover ouvre progressivement.</p>
            <p className="text-muted-foreground">Les premiers établissements publient leur fiche. Revenez bientôt.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{total} établissement(s)</p>
              <div className="flex gap-2 text-sm">
                <Link href={`/decouvrir?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== "tri")) })}`} className={f.tri ? "text-muted-foreground" : "font-semibold"}>
                  Ordre alphabétique
                </Link>
                <span aria-hidden>·</span>
                <Link href={`/decouvrir?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), tri: "recent" })}`} className={f.tri === "recent" ? "font-semibold" : "text-muted-foreground"}>
                  Plus récents
                </Link>
              </div>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="discover-results">
              {list.map((o) => (
                <li key={o.slug}>
                  <Link href={`/decouvrir/${o.slug}?source=discover`} className="group grid h-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-transform hover:-translate-y-0.5">
                    <div className="relative h-32 bg-gradient-to-br from-[#e8f0fb] to-[#cfe0f7]">
                      {o.cover_file_id ? (
                        // eslint-disable-next-line @next/next/no-img-element -- image servie par la fiche publique
                        <img src={mediaUrl(o.cover_file_id)} alt="" className="size-full object-cover" />
                      ) : null}
                      {o.featured ? (
                        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950">
                          <Sparkles className="size-3" aria-hidden /> À la une
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 p-4">
                      <div className="flex items-center gap-3">
                        {o.has_logo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- logo de l'établissement
                          <img src={logoUrl(o.code)} alt="" className="size-10 rounded-lg border border-border bg-white object-contain" />
                        ) : null}
                        <div className="grid">
                          <span className="flex items-center gap-1 font-semibold group-hover:text-primary">
                            {o.name} {o.verified ? <BadgeCheck className="size-4 text-primary" aria-label="Profil vérifié" /> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[o.type] ?? o.type}</span>
                        </div>
                      </div>
                      {o.tagline ? <p className="line-clamp-2 text-sm text-muted-foreground">{o.tagline}</p> : null}
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" aria-hidden /> {[o.city, countryName.get(o.country) ?? o.country].filter(Boolean).join(", ")}
                      </p>
                      {o.programs.length ? <p className="line-clamp-1 text-xs">{o.programs.slice(0, 4).map((p) => p.name).join(" · ")}</p> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {total > PAGE ? (
              <nav className="flex justify-center gap-3 text-sm" aria-label="Pages">
                {page > 1 ? <Link href={pageLink(page - 1)}>← Précédent</Link> : null}
                <span>
                  Page {page} / {Math.ceil(total / PAGE)}
                </span>
                {page * PAGE < total ? <Link href={pageLink(page + 1)}>Suivant →</Link> : null}
              </nav>
            ) : null}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          « Profil vérifié » : documents contrôlés par NeoScool. Une mise « À la une » est une option payante et ne donne jamais le statut vérifié.
        </p>
      </section>
    </SiteShell>
  );
}
