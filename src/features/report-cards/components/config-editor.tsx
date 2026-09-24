"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveReportConfig } from "@/features/report-cards/actions";
import { BOOLEAN_OPTIONS, type ReportConfig } from "@/features/report-cards/config";
import { ASSESSMENT_KINDS } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

type Rule = { min: number; label: string };

function slug(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "colonne";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Éditeur du bulletin : colonnes, pondérations, calcul, mentions, décisions, signatures, identité visuelle. */
export function ReportConfigEditor({ initial }: { initial: ReportConfig }) {
  const [config, setConfig] = useState<ReportConfig>(initial);
  const [state, formAction, pending] = useFeedbackAction(saveReportConfig);
  const set = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));

  const rulesEditor = (key: "mentions" | "decisions", title: string, description: string) => {
    const rules = config[key] as Rule[];
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">≥</span>
              <Input
                type="number"
                min={0}
                max={20}
                step="0.25"
                value={rule.min}
                onChange={(e) => set(key, rules.map((r, j) => (j === i ? { ...r, min: Number(e.target.value) } : r)))}
                className="h-10 w-24"
                aria-label={`${title} : seuil ${i + 1}`}
              />
              <Input
                value={rule.label}
                maxLength={80}
                onChange={(e) => set(key, rules.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                className="h-10 flex-1"
                aria-label={`${title} : libellé ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon" aria-label="Supprimer" onClick={() => set(key, rules.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => set(key, [...rules, { min: 0, label: "" }])} disabled={rules.length >= 10}>
            <Plus aria-hidden /> Ajouter
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-5">
      <input type="hidden" name="config" value={JSON.stringify(config)} />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Général</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="rc-title">Titre du document</Label>
                <Input id="rc-title" value={config.title} maxLength={80} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="rc-calc">Règle de calcul de la moyenne par matière</Label>
                <Select id="rc-calc" value={config.calculation} onChange={(e) => set("calculation", e.target.value as ReportConfig["calculation"])}>
                  <option value="assessments">Moyenne pondérée des évaluations (coefficient de chaque évaluation)</option>
                  <option value="columns">Moyenne pondérée des colonnes (pondération de chaque colonne)</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moyenne générale = Σ (moyenne de la matière × coefficient de la matière) ÷ Σ coefficients. Recalcul automatique à chaque note ou coefficient modifié.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colonnes d&apos;évaluation</CardTitle>
              <CardDescription>
                Chaque évaluation est rangée dans la colonne choisie à sa création, sinon automatiquement selon son type (1re interrogation → 1re colonne
                acceptant ce type…).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {config.columns.map((column, i) => (
                <div key={column.key} className="grid gap-3 rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="grid flex-1 gap-1">
                      <Label htmlFor={`col-label-${i}`} className="text-xs">
                        Libellé
                      </Label>
                      <Input
                        id={`col-label-${i}`}
                        value={column.label}
                        maxLength={20}
                        onChange={(e) => set("columns", config.columns.map((c, j) => (j === i ? { ...c, label: e.target.value.toUpperCase() } : c)))}
                        className="h-10"
                      />
                    </div>
                    <div className="grid w-28 gap-1">
                      <Label htmlFor={`col-weight-${i}`} className="text-xs">
                        Pondération
                      </Label>
                      <Input
                        id={`col-weight-${i}`}
                        type="number"
                        min={0.25}
                        step="0.25"
                        value={column.weight}
                        onChange={(e) => set("columns", config.columns.map((c, j) => (j === i ? { ...c, weight: Number(e.target.value) } : c)))}
                        className="h-10"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Monter ${column.label}`} disabled={i === 0} onClick={() => set("columns", move(config.columns, i, -1))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Descendre ${column.label}`}
                      disabled={i === config.columns.length - 1}
                      onClick={() => set("columns", move(config.columns, i, 1))}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-danger" aria-label={`Supprimer ${column.label}`} onClick={() => set("columns", config.columns.filter((_, j) => j !== i))}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(ASSESSMENT_KINDS).map(([kind, label]) => (
                      <label key={kind} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--primary)]"
                          checked={column.kinds.includes(kind as never)}
                          onChange={(e) =>
                            set(
                              "columns",
                              config.columns.map((c, j) =>
                                j === i ? { ...c, kinds: e.target.checked ? [...c.kinds, kind as never] : c.kinds.filter((k) => k !== kind) } : c,
                              ),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="justify-self-start"
                disabled={config.columns.length >= 12}
                onClick={() => {
                  const label = `COLONNE ${config.columns.length + 1}`;
                  set("columns", [...config.columns, { key: slug(label, config.columns.map((c) => c.key)), label, kinds: [], weight: 1 }]);
                }}
              >
                <Plus aria-hidden /> Ajouter une colonne
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {rulesEditor("mentions", "Mentions", "Appréciation automatique selon la moyenne.")}
            {rulesEditor("decisions", "Décisions proposées", "Proposition du conseil selon la moyenne générale.")}
          </div>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Aperçu de la mise en page</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="overflow-hidden rounded-lg border border-border bg-white text-[11px] text-[#0f1b3d]">
                <div className="border-b-2 px-3 py-2 font-semibold" style={{ borderColor: config.primary_color }}>
                  <span style={{ color: config.accent_color }}>{config.show_logo ? "◆ " : ""}</span>
                  {config.title || "BULLETIN DE NOTES"}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: config.primary_color }} className="text-white">
                        <th className="px-2 py-1 text-left">Matière</th>
                        {config.columns.map((c) => (
                          <th key={c.key} className="px-2 py-1">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-2 py-1">MOY.</th>
                        <th className="px-2 py-1">COEF.</th>
                        {config.show_class_stats ? <th className="px-2 py-1">Moy. cl.</th> : null}
                        {config.show_appreciation ? <th className="px-2 py-1">Appr.</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1">Mathématiques</td>
                        {config.columns.map((c, i) => (
                          <td key={c.key} className="px-2 py-1 text-center">
                            {(12 + i).toFixed(2).replace(".", ",")}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center font-semibold">13,50</td>
                        <td className="px-2 py-1 text-center">4</td>
                        {config.show_class_stats ? <td className="px-2 py-1 text-center">11,80</td> : null}
                        {config.show_appreciation ? <td className="px-2 py-1">{config.mentions.find((m) => 13.5 >= m.min)?.label ?? ""}</td> : null}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between gap-2 px-3 py-2">
                  {config.signatures.map((s, i) => (
                    <span key={i} className="font-semibold">
                      {s.label}
                    </span>
                  ))}
                  {config.show_qr ? <span className="rounded border border-dashed px-1">QR</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Affichage</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1">
              {BOOLEAN_OPTIONS.map((option) => (
                <label key={option.key} className="flex min-h-10 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="size-4.5 accent-[var(--primary)]"
                    checked={Boolean(config[option.key])}
                    onChange={(e) => set(option.key, e.target.checked as never)}
                  />
                  {option.label}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signatures et couleurs</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {config.signatures.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={s.label}
                    maxLength={60}
                    onChange={(e) => set("signatures", config.signatures.map((x, j) => (j === i ? { label: e.target.value } : x)))}
                    aria-label={`Signature ${i + 1}`}
                    className="h-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer la signature"
                    disabled={config.signatures.length <= 1}
                    onClick={() => set("signatures", config.signatures.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="justify-self-start"
                disabled={config.signatures.length >= 4}
                onClick={() => set("signatures", [...config.signatures, { label: "Signature" }])}
              >
                <Plus aria-hidden /> Ajouter une signature
              </Button>
              <div className="grid grid-cols-2 gap-3">
                {(["primary_color", "accent_color"] as const).map((key) => (
                  <label key={key} className="grid gap-1.5 text-sm font-medium">
                    {key === "primary_color" ? "Couleur principale" : "Couleur d'accent"}
                    <span className="flex items-center gap-2">
                      <input type="color" value={config[key]} onChange={(e) => set(key, e.target.value.toUpperCase())} className="h-10 w-14 rounded-lg border border-border" />
                      <span className={cn("font-mono text-xs text-muted-foreground")}>{config[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rc-footer">Note de bas de bulletin</Label>
                <Input id="rc-footer" value={config.footer_note} maxLength={300} onChange={(e) => set("footer_note", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-3 flex justify-end">
        <SubmitButton size="lg" className="shadow-lg" pendingLabel="Enregistrement…">
          Enregistrer la configuration
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
