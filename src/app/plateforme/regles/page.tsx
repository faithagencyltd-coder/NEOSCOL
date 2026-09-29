import type { Metadata } from "next";
import Link from "next/link";

import { RuleVersions } from "@/features/academic-rules/components/rule-versions";
import { RulesEditor } from "@/features/academic-rules/components/rules-editor";
import { DEFAULT_RULES, type RuleSetRow } from "@/features/academic-rules/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Modèles académiques — Plateforme" };

/**
 * Modèles académiques par pays (Super Admin) : appliqués par défaut aux
 * établissements du pays qui n'ont pas publié leurs propres règles, et
 * copiables par eux. Versions, publication et retour arrière audités.
 */
export default async function PlatformRulesPage({ searchParams }: PageProps<"/plateforme/regles">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: countries } = await supabase.from("countries").select("code, name").eq("is_active", true).order("sort_order");
  const country = typeof params.pays === "string" && /^[A-Z]{2}$/.test(params.pays) ? params.pays : (countries?.[0]?.code ?? "BJ");
  const { data: rows } = await supabase
    .from("academic_rule_sets")
    .select("*")
    .is("organization_id", null)
    .eq("country_code", country)
    .eq("education_type", "school")
    .order("version", { ascending: false });
  const versions = (rows ?? []) as unknown as RuleSetRow[];
  const latest = versions[0];
  const name = countries?.find((c) => c.code === country)?.name ?? country;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid gap-1">
        <h2 className="text-2xl font-bold">Modèles académiques par pays</h2>
        <p className="text-sm text-muted-foreground">
          Moyenne annuelle, décisions et mentions par défaut pour les établissements scolaires de chaque pays. Un établissement peut publier ses propres règles.
        </p>
      </div>
      <nav aria-label="Pays" className="flex flex-wrap gap-2">
        {(countries ?? []).map((c) => (
          <Link
            key={c.code}
            href={`/plateforme/regles?pays=${c.code}`}
            aria-current={c.code === country ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", c.code === country ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40")}
          >
            {c.name}
          </Link>
        ))}
      </nav>
      <RuleVersions rows={versions} canManage />
      <RulesEditor key={`${country}-${latest?.id ?? "new"}`} initial={latest?.rules ?? DEFAULT_RULES} initialName={latest?.name ?? `Modèle national — ${name}`} scope="country" country={country} />
    </div>
  );
}
