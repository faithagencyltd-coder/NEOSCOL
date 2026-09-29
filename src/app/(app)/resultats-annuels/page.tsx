import { Calculator, CheckCircle2, ClipboardList, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { computeAnnualResults, setAnnualDecision, validateAnnualResults } from "@/features/academic-rules/actions";
import { RULE_SOURCE, type AcademicDecision } from "@/features/academic-rules/types";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Résultats annuels" };

const fmt = (n: number | string | null) => (n === null ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/**
 * Résultats de fin d'année d'une classe : moyenne annuelle selon les règles en
 * vigueur, rang, mention, décision proposée puis décision du conseil (motif si
 * différente), validation qui fige tout avec les règles utilisées.
 */
export default async function AnnualResultsPage({ searchParams }: PageProps<"/resultats-annuels">) {
  const context = await requirePermission("report_cards.manage");
  const orgId = context.organization.id;
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: classes }, { data: effective }] = await Promise.all([
    supabase.from("classes").select("id, name, academic_year:academic_years!inner(is_current)").eq("organization_id", orgId).eq("academic_year.is_current", true).order("name"),
    supabase.rpc("effective_academic_rules", { p_org: orgId }),
  ]);
  const classId = typeof params.classe === "string" && isUuid(params.classe) ? params.classe : (classes?.[0]?.id ?? null);
  const current = classes?.find((c) => c.id === classId);
  const { data: results } = classId
    ? await supabase
        .from("annual_results")
        .select("id, average, rank, mention, proposed_label, proposed_code, decision_code, decision_label, decision_reason, status, rule_version, rules_snapshot, inputs, student:students(first_name, last_name, matricule)")
        .eq("class_id", classId)
    : { data: [] };
  const rows = (results ?? []).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  const eff = effective as { source: string; version: number } | null;
  const validated = rows.length > 0 && rows.every((r) => r.status === "validated");
  const canValidate = can(context, "report_cards.publish");

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <PageHeader
        title="Résultats annuels"
        description="Moyenne annuelle, rang, mention et décision de fin d'année, calculés à partir des bulletins avec les règles de calcul en vigueur."
        actions={
          can(context, "academic.manage") ? (
            <Button asChild variant="secondary">
              <Link href="/parametres/regles-academiques">Règles de calcul</Link>
            </Button>
          ) : null
        }
      />
      <Alert tone="info">
        Règles appliquées aux prochains calculs : {RULE_SOURCE[eff?.source ?? "default"]}
        {eff?.version ? ` (version ${eff.version})` : ""}. Les résultats validés gardent les règles de leur validation.
      </Alert>

      {!classes?.length ? (
        <Card>
          <EmptyState icon={ClipboardList} title="Aucune classe pour l'année en cours" />
        </Card>
      ) : (
        <>
          <nav aria-label="Classes" className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <Link
                key={c.id}
                href={`/resultats-annuels?classe=${c.id}`}
                aria-current={c.id === classId ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  c.id === classId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40",
                )}
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            {!validated ? (
              <ConfirmAction
                trigger={
                  <Button>
                    <Calculator aria-hidden /> Calculer les résultats de {current?.name}
                  </Button>
                }
                title={`Calculer les résultats annuels de ${current?.name} ?`}
                description="À partir des moyennes des bulletins de chaque période. Les décisions déjà saisies par le conseil sont conservées."
                confirmLabel="Calculer"
                action={computeAnnualResults}
                fields={{ class_id: classId ?? "" }}
              />
            ) : null}
            {rows.length > 0 && !validated && canValidate ? (
              <ConfirmAction
                trigger={
                  <Button variant="secondary">
                    <CheckCircle2 aria-hidden /> Valider (figer) les résultats
                  </Button>
                }
                title="Valider définitivement ces résultats ?"
                description="Ils seront figés avec les règles utilisées : aucune modification ultérieure des règles ne les changera."
                confirmLabel="Valider"
                action={validateAnnualResults}
                fields={{ class_id: classId ?? "" }}
              />
            ) : null}
            {validated ? (
              <Badge tone="success">
                <Lock className="size-3.5" aria-hidden /> Résultats validés et figés
              </Badge>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState icon={Calculator} title="Aucun résultat annuel" description="Calculez les bulletins de chaque période, puis les résultats annuels." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <tr>
                      <TH>Rang</TH>
                      <TH>Élève</TH>
                      <TH>Périodes</TH>
                      <TH className="text-right">Moyenne annuelle</TH>
                      <TH>Mention</TH>
                      <TH>Décision</TH>
                      <TH />
                    </tr>
                  </THead>
                  <tbody>
                    {rows.map((r) => {
                      const inputs = (r.inputs ?? []) as { variable: string; average: number | null }[];
                      const decisions = ((r.rules_snapshot as { decisions?: AcademicDecision[] })?.decisions ?? []).map((d) => ({ value: d.code, label: d.label }));
                      return (
                        <TR key={r.id}>
                          <TD className="tabular-nums">{r.rank ?? "—"}</TD>
                          <TD>
                            <span className="grid">
                              <span className="font-medium">
                                {r.student?.last_name} {r.student?.first_name}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">{r.student?.matricule}</span>
                            </span>
                          </TD>
                          <TD className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{inputs.map((p) => `${p.variable} ${fmt(p.average)}`).join(" · ")}</TD>
                          <TD className="text-right font-semibold tabular-nums">{fmt(r.average)}</TD>
                          <TD>{r.mention ?? "—"}</TD>
                          <TD>
                            <span className="grid gap-0.5">
                              <span className="font-medium">{r.decision_label ?? "Incomplet"}</span>
                              {r.decision_reason ? (
                                <span className="text-xs text-muted-foreground">
                                  Conseil (proposé : {r.proposed_label}) — {r.decision_reason}
                                </span>
                              ) : null}
                              <span className="text-[11px] text-muted-foreground">Règles v{r.rule_version}</span>
                            </span>
                          </TD>
                          <TD>
                            {r.status === "draft" && r.average !== null ? (
                              <QuickFormDialog
                                title={`Décision — ${r.student?.last_name} ${r.student?.first_name}`}
                                description={`Décision proposée par les règles : ${r.proposed_label ?? "—"}. Motif obligatoire si la décision du conseil est différente.`}
                                trigger={
                                  <Button size="sm" variant="ghost">
                                    Décision du conseil
                                  </Button>
                                }
                                action={setAnnualDecision}
                                hidden={{ result_id: r.id }}
                                fields={[
                                  { name: "decision", label: "Décision", type: "select", required: true, options: decisions, defaultValue: r.decision_code ?? undefined },
                                  { name: "reason", label: "Motif", type: "textarea", wide: true, defaultValue: r.decision_reason ?? "" },
                                ]}
                              />
                            ) : r.status === "validated" ? (
                              <Badge tone="success">Validé</Badge>
                            ) : null}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
