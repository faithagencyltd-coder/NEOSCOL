import { History, RotateCcw, Send, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteRuleDraft, publishRuleSet } from "@/features/academic-rules/actions";
import { RULE_STATUS, type RuleSetRow } from "@/features/academic-rules/types";

function summary(r: RuleSetRow) {
  const a = r.rules.annual;
  const calc = a.mode === "formula" ? `Formule ${a.formula}` : `Pondérations ${a.weights.join(" / ")}`;
  return `${calc} · ${r.rules.decisions.length} décision(s)`;
}

/** Versions des règles : publier un brouillon, revenir à une version archivée, supprimer un brouillon. */
export function RuleVersions({ rows, canManage }: { rows: RuleSetRow[]; canManage: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5 text-primary" aria-hidden /> Versions
        </CardTitle>
        <CardDescription>Chaque publication est tracée. Revenir à une ancienne version la republie ; les résultats déjà validés ne changent jamais.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={History} title="Aucune version" description="Enregistrez un premier brouillon ci-dessous." />
        ) : (
          <ol className="grid gap-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3">
                <span className="grid gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    v{r.version} — {r.name}
                    <Badge tone={RULE_STATUS[r.status]?.tone}>{RULE_STATUS[r.status]?.label}</Badge>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{summary(r)}</span>
                  <span className="text-xs text-muted-foreground">
                    Créée le {new Date(r.created_at).toLocaleString("fr-FR")}
                    {r.published_at ? ` · publiée le ${new Date(r.published_at).toLocaleString("fr-FR")}` : ""}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </span>
                </span>
                {canManage && r.status !== "published" ? (
                  <span className="flex flex-wrap gap-2">
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant={r.status === "draft" ? "primary" : "secondary"}>
                          {r.status === "draft" ? <Send aria-hidden /> : <RotateCcw aria-hidden />} {r.status === "draft" ? "Publier" : "Revenir à cette version"}
                        </Button>
                      }
                      title={r.status === "draft" ? `Publier la version ${r.version} ?` : `Revenir à la version ${r.version} ?`}
                      description="Ces règles s'appliqueront aux prochains calculs. Les résultats déjà validés restent calculés avec leurs règles d'origine."
                      confirmLabel={r.status === "draft" ? "Publier" : "Revenir"}
                      action={publishRuleSet}
                      fields={{ id: r.id }}
                    />
                    {r.status === "draft" ? (
                      <ConfirmAction
                        trigger={
                          <Button size="sm" variant="ghost" className="text-danger" aria-label={`Supprimer le brouillon v${r.version}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title="Supprimer ce brouillon ?"
                        confirmLabel="Supprimer"
                        tone="danger"
                        action={deleteRuleDraft}
                        fields={{ id: r.id }}
                      />
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
