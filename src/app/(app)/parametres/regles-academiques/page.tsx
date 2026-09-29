import { Globe2 } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { adoptTemplate } from "@/features/academic-rules/actions";
import { RuleVersions } from "@/features/academic-rules/components/rule-versions";
import { RulesEditor } from "@/features/academic-rules/components/rules-editor";
import { DEFAULT_RULES, RULE_SOURCE, type AcademicRules, type RuleSetRow } from "@/features/academic-rules/types";
import { requirePermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Règles de calcul" };

/**
 * Règles de calcul de l'établissement : moyenne annuelle, décisions, mentions.
 * Versions (brouillon → publication → retour arrière), essai et simulateur.
 * À défaut de règles propres, celles du pays s'appliquent (modèle du Super Admin).
 */
export default async function AcademicRulesPage() {
  const context = await requirePermission("academic.manage");
  const orgId = context.organization.id;
  const supabase = await createClient();
  const [{ data: rows }, { data: effective }, { data: classes }, { data: org }] = await Promise.all([
    supabase.from("academic_rule_sets").select("*").eq("organization_id", orgId).eq("education_type", "school").order("version", { ascending: false }),
    supabase.rpc("effective_academic_rules", { p_org: orgId }),
    supabase.from("classes").select("id, name, academic_year:academic_years!inner(is_current)").eq("organization_id", orgId).eq("academic_year.is_current", true).order("name"),
    supabase.from("organizations").select("country").eq("id", orgId).single(),
  ]);
  const { data: templates } = await supabase
    .from("academic_rule_sets")
    .select("id, name, version, country_code")
    .is("organization_id", null)
    .eq("status", "published")
    .eq("education_type", "school")
    .or(`country_code.eq.${org?.country ?? "ZZ"},country_code.is.null`);
  const eff = effective as { rules: AcademicRules; source: string; version: number } | null;
  const versions = (rows ?? []) as unknown as RuleSetRow[];
  const latest = versions[0];

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Règles de calcul"
        description="Moyenne annuelle (pondération des périodes ou formule), décisions de fin d'année et mentions. Vérifiées et appliquées par le serveur."
      />
      <Alert tone="info" title={`En vigueur : ${RULE_SOURCE[eff?.source ?? "default"]}${eff?.version ? ` (version ${eff.version})` : ""}`}>
        Les règles publiées s&apos;appliquent aux prochains calculs des résultats annuels. Un résultat validé reste toujours calculé avec les règles de sa validation.
      </Alert>
      {templates?.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <Globe2 className="size-5 text-primary" aria-hidden />
          <span className="text-sm">Modèle{templates.length > 1 ? "s" : ""} disponible{templates.length > 1 ? "s" : ""} :</span>
          {templates.map((t) => (
            <ConfirmAction
              key={t.id}
              trigger={
                <Button size="sm" variant="secondary">
                  Partir de « {t.name} » {t.country_code ? `(${t.country_code})` : "(plateforme)"} v{t.version}
                </Button>
              }
              title="Copier ce modèle en brouillon ?"
              description="Le modèle est copié dans une nouvelle version en brouillon, que vous pourrez adapter avant de la publier."
              confirmLabel="Copier"
              action={adoptTemplate}
              fields={{ template_id: t.id }}
            />
          ))}
        </div>
      ) : null}
      <RuleVersions rows={versions} canManage />
      <RulesEditor
        key={latest?.id ?? "new"}
        initial={latest?.rules ?? eff?.rules ?? DEFAULT_RULES}
        initialName={latest?.name ?? "Règles de l'établissement"}
        scope="organization"
        classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
