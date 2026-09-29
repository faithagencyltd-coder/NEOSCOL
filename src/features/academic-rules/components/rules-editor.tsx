"use client";

import { FlaskConical, Plus, Sigma, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { saveRuleDraft, simulateRules, tryRules, type SimulationRow } from "@/features/academic-rules/actions";
import type { AcademicRules, RuleResult } from "@/features/academic-rules/types";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

/**
 * Éditeur de règles de calcul : pondération des périodes OU formule sûre
 * (T1…T8, + - * / ( ), min, max, round, abs), seuils de décision, mentions,
 * essai en direct et simulation sur une classe réelle. Tout est vérifié en base.
 */
export function RulesEditor({
  initial,
  initialName,
  scope,
  country,
  classes = [],
}: {
  initial: AcademicRules;
  initialName: string;
  scope: "organization" | "country";
  country?: string;
  classes?: { id: string; name: string }[];
}) {
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<AcademicRules>(initial);
  const periods = rules.annual.mode === "weights" ? rules.annual.weights.length : 3;
  const [values, setValues] = useState<(number | null)[]>([12, 14, 15]);
  const [trial, setTrial] = useState<RuleResult | null>(null);
  const [simClass, setSimClass] = useState(classes[0]?.id ?? "");
  const [sim, setSim] = useState<SimulationRow[] | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [simulating, startSim] = useTransition();
  const [state, action, pending] = useActionState(async (prev: ActionResult<{ id: string }> | null, formData: FormData) => {
    const result = await saveRuleDraft(prev, formData);
    notifyResult(result);
    return result;
  }, null);

  const serialized = useMemo(() => JSON.stringify(rules), [rules]);
  const trialValues = useMemo(() => {
    const n = rules.annual.mode === "weights" ? rules.annual.weights.length : Math.max(values.length, 1);
    return Array.from({ length: n }, (_, i) => values[i] ?? null);
  }, [rules.annual, values]);

  // Essai en direct (calcul en base, légèrement différé).
  useEffect(() => {
    const id = window.setTimeout(() => {
      void tryRules(rules, trialValues).then(setTrial);
    }, 350);
    return () => window.clearTimeout(id);
  }, [serialized, trialValues, rules]);

  const setMode = (mode: "weights" | "formula") =>
    setRules((r) => ({
      ...r,
      annual: mode === "weights" ? { mode, weights: Array.from({ length: periods }, () => 1) } : { mode, formula: "(T1 + T2 + T3) / 3" },
    }));
  const setPeriods = (n: number) => {
    setRules((r) => (r.annual.mode === "weights" ? { ...r, annual: { mode: "weights", weights: Array.from({ length: n }, (_, i) => r.annual.mode === "weights" ? (r.annual.weights[i] ?? 1) : 1) } } : r));
    setValues((v) => Array.from({ length: n }, (_, i) => v[i] ?? null));
  };
  const setDecision = (i: number, patch: Partial<AcademicRules["decisions"][number]>) =>
    setRules((r) => ({ ...r, decisions: r.decisions.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const setMention = (i: number, patch: Partial<NonNullable<AcademicRules["mentions"]>[number]>) =>
    setRules((r) => ({ ...r, mentions: (r.mentions ?? []).map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  const summary = useMemo(() => {
    if (!sim) return null;
    const count = (key: "current_result" | "simulated_result") =>
      sim.reduce<Record<string, number>>((acc, row) => {
        const label = row[key].decision_label ?? "Incomplet";
        acc[label] = (acc[label] ?? 0) + 1;
        return acc;
      }, {});
    return { current: count("current_result"), simulated: count("simulated_result"), changed: sim.filter((r) => r.current_result.decision_code !== r.simulated_result.decision_code).length };
  }, [sim]);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sigma className="size-5 text-primary" aria-hidden /> Calcul de la moyenne annuelle
          </CardTitle>
          <CardDescription>Pondération des périodes (trimestres, semestres) ou formule personnalisée. T1, T2… sont les moyennes des périodes dans l&apos;ordre de l&apos;année.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rules-name">Nom des règles</Label>
              <Input id="rules-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-mode">Mode de calcul</Label>
              <Select id="rules-mode" value={rules.annual.mode} onChange={(e) => setMode(e.target.value as "weights" | "formula")}>
                <option value="weights">Pondération des périodes</option>
                <option value="formula">Formule personnalisée</option>
              </Select>
            </div>
          </div>

          {rules.annual.mode === "weights" ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="rules-periods">Nombre de périodes</Label>
                <Select id="rules-periods" className="w-24" value={periods} onChange={(e) => setPeriods(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-3">
                {rules.annual.weights.map((w, i) => (
                  <div key={i} className="grid gap-1">
                    <Label htmlFor={`weight-${i}`}>Poids T{i + 1}</Label>
                    <Input
                      id={`weight-${i}`}
                      type="number"
                      min={0}
                      step="0.5"
                      className="w-24"
                      value={w}
                      onChange={(e) =>
                        setRules((r) => (r.annual.mode === "weights" ? { ...r, annual: { mode: "weights", weights: r.annual.weights.map((x, j) => (j === i ? Number(e.target.value) : x)) } } : r))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="rules-formula">Formule</Label>
              <Input
                id="rules-formula"
                className="font-mono"
                value={rules.annual.formula}
                maxLength={300}
                onChange={(e) => setRules((r) => ({ ...r, annual: { mode: "formula", formula: e.target.value } }))}
              />
              <p className="text-xs text-muted-foreground">
                Permis : nombres, T1 à T8, + − × ÷ ( ) et min(…), max(…), round(x, 1), abs(…). Exemple : (T1 + T2 + 2*T3) / 4. Tout autre élément est refusé par le serveur.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rules-missing">Période sans note</Label>
              <Select id="rules-missing" value={rules.missing_period ?? "reweight"} onChange={(e) => setRules((r) => ({ ...r, missing_period: e.target.value as "reweight" | "incomplete" }))}>
                <option value="reweight">Moyenne sur les périodes notées</option>
                <option value="incomplete">Résultat incomplet</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-pass">Moyenne de passage (/{rules.grading_scale ?? 20})</Label>
              <Input id="rules-pass" type="number" min={0} step="0.25" value={rules.pass_mark ?? 10} onChange={(e) => setRules((r) => ({ ...r, pass_mark: Number(e.target.value) }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rules-round">Décimales</Label>
              <Select id="rules-round" value={rules.round ?? 2} onChange={(e) => setRules((r) => ({ ...r, round: Number(e.target.value) }))}>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Décisions de fin d&apos;année</CardTitle>
            <CardDescription>Décision proposée selon la moyenne annuelle ; le conseil peut la modifier avec un motif.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {rules.decisions.map((d, i) => (
              <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[5.5rem_8rem_1fr_auto]">
                <Input aria-label={`Seuil de la décision ${i + 1}`} type="number" min={0} step="0.25" value={d.min} onChange={(e) => setDecision(i, { min: Number(e.target.value) })} />
                <Input aria-label={`Code de la décision ${i + 1}`} className="hidden font-mono text-xs sm:block" value={d.code} onChange={(e) => setDecision(i, { code: e.target.value.toLowerCase().replace(/[^a-z_]/g, "") })} />
                <Input aria-label={`Libellé de la décision ${i + 1}`} value={d.label} onChange={(e) => setDecision(i, { label: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setRules((r) => ({ ...r, decisions: r.decisions.filter((_, j) => j !== i) }))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setRules((r) => ({ ...r, decisions: [...r.decisions, { min: 0, code: `choix_${String.fromCharCode(97 + r.decisions.length)}`, label: "Nouvelle décision" }] }))}>
              <Plus aria-hidden /> Ajouter une décision
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mentions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(rules.mentions ?? []).map((m, i) => (
              <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                <Input aria-label={`Seuil de la mention ${i + 1}`} type="number" min={0} step="0.25" value={m.min} onChange={(e) => setMention(i, { min: Number(e.target.value) })} />
                <Input aria-label={`Mention ${i + 1}`} value={m.label} onChange={(e) => setMention(i, { label: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Retirer" onClick={() => setRules((r) => ({ ...r, mentions: (r.mentions ?? []).filter((_, j) => j !== i) }))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => setRules((r) => ({ ...r, mentions: [...(r.mentions ?? []), { min: 0, label: "Mention" }] }))}>
              <Plus aria-hidden /> Ajouter une mention
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Essai en direct</CardTitle>
          <CardDescription>Saisissez des moyennes de périodes : le serveur applique les règles ci-dessus.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            {trialValues.map((v, i) => (
              <div key={i} className="grid gap-1">
                <Label htmlFor={`trial-${i}`}>T{i + 1}</Label>
                <Input
                  id={`trial-${i}`}
                  type="number"
                  step="0.25"
                  className="w-24"
                  value={v ?? ""}
                  onChange={(e) => setValues(trialValues.map((x, j) => (j === i ? (e.target.value === "" ? null : Number(e.target.value)) : x)))}
                />
              </div>
            ))}
            {rules.annual.mode === "formula" ? (
              <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => setValues([...trialValues, null].slice(0, 8))}>
                <Plus aria-hidden /> Période
              </Button>
            ) : null}
          </div>
          {trial?.error ? (
            <Alert tone="danger">{trial.error}</Alert>
          ) : trial ? (
            <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-2xl font-bold tabular-nums">{fmt(trial.average)}</span>
              {trial.mention ? <Badge tone="primary">{trial.mention}</Badge> : null}
              {trial.decision_label ? <Badge tone={trial.passed ? "success" : "warning"}>{trial.decision_label}</Badge> : <Badge>Incomplet</Badge>}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {classes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" aria-hidden /> Simulateur sur une classe réelle
            </CardTitle>
            <CardDescription>Compare les règles en vigueur et ces règles sur les bulletins déjà calculés. Rien n&apos;est enregistré.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sim-class">Classe</Label>
                <Select id="sim-class" value={simClass} onChange={(e) => setSimClass(e.target.value)}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                disabled={simulating || !simClass}
                onClick={() =>
                  startSim(async () => {
                    const r = await simulateRules(simClass, rules);
                    if (r.ok) {
                      setSim(r.rows);
                      setSimError(null);
                    } else {
                      setSim(null);
                      setSimError(r.message);
                    }
                  })
                }
              >
                <FlaskConical aria-hidden /> {simulating ? "Simulation…" : "Simuler"}
              </Button>
            </div>
            {simError ? <Alert tone="danger">{simError}</Alert> : null}
            {sim && summary ? (
              <>
                <p className="text-sm font-medium" role="status">
                  {summary.changed} décision(s) sur {sim.length} changeraient avec ces règles.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Élève</TH>
                        <TH>Périodes</TH>
                        <TH className="text-right">Actuelle</TH>
                        <TH className="text-right">Simulée</TH>
                        <TH>Décision simulée</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {sim.map((row) => {
                        const changed = row.current_result.decision_code !== row.simulated_result.decision_code;
                        return (
                          <TR key={row.student_id} className={cn(changed && "bg-warning-soft/40")}>
                            <TD className="font-medium">{row.student_name}</TD>
                            <TD className="text-xs text-muted-foreground tabular-nums">{row.inputs.map((p) => `${p.variable} ${fmt(p.average)}`).join(" · ")}</TD>
                            <TD className="text-right tabular-nums">{fmt(row.current_result.average)}</TD>
                            <TD className="text-right font-semibold tabular-nums">{fmt(row.simulated_result.average)}</TD>
                            <TD>
                              <span className="flex flex-wrap items-center gap-1.5">
                                {row.simulated_result.decision_label ?? "Incomplet"}
                                {changed ? <Badge tone="warning">changée</Badge> : null}
                              </span>
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ActionForm dispatch={action} pending={pending} className="flex flex-col items-end gap-2">
        <input type="hidden" name="rules" value={serialized} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="scope" value={scope} />
        {country ? <input type="hidden" name="country" value={country} /> : null}
        {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
        <SubmitButton size="lg" pendingLabel="Enregistrement…">
          Enregistrer comme nouvelle version (brouillon)
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
