"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveFeeRate } from "@/features/finance/actions";
import { cn } from "@/lib/utils/cn";

type Option = { id: string; name: string };
type Step = { key: number; label: string; due_on: string; percent: string };

export type FeeRateValue = {
  id: string;
  fee_type_id: string;
  level_id: string | null;
  program_id: string | null;
  class_id: string | null;
  amount: number;
  is_mandatory: boolean;
  notes: string | null;
  installment_plan: unknown;
};

function initialPlan(rate?: FeeRateValue): Step[] {
  const raw = Array.isArray(rate?.installment_plan) ? (rate.installment_plan as { label?: string; due_on?: string; percent?: number }[]) : [];
  return raw.map((s, i) => ({ key: i, label: s.label ?? "", due_on: s.due_on ?? "", percent: String(s.percent ?? "") }));
}

/** Tarif d'un type de frais pour une cible, avec éditeur d'échéancier (total 100 %, montants calculés en direct). */
export function FeeRateDialog({
  feeTypes,
  levels,
  programs,
  classes,
  currency,
  rate,
  trigger,
}: {
  feeTypes: Option[];
  levels: Option[];
  programs: Option[];
  classes: Option[];
  currency: string;
  rate?: FeeRateValue;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(rate ? String(rate.amount) : "");
  const [plan, setPlan] = useState<Step[]>(() => initialPlan(rate));
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveFeeRate>> | null, formData: FormData) => {
    const result = await saveFeeRate(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const total = plan.reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const target = rate?.class_id ? `class:${rate.class_id}` : rate?.level_id ? `level:${rate.level_id}` : rate?.program_id ? `program:${rate.program_id}` : "all";
  const update = (key: number, patch: Partial<Step>) => setPlan((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden /> Nouveau tarif
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={rate ? "Modifier le tarif" : "Nouveau tarif"} description="Appliqué automatiquement à la validation des inscriptions de l'année en cours." className="max-w-2xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4">
          {rate ? <input type="hidden" name="fee_rate_id" value={rate.id} /> : null}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="r-type" label="Type de frais *">
              <Select id="r-type" name="fee_type_id" required defaultValue={rate?.fee_type_id ?? feeTypes[0]?.id}>
                {feeTypes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="r-target" label="S'applique à *" hint="Le tarif le plus précis l'emporte : classe, puis niveau, puis filière, puis établissement.">
              <Select id="r-target" name="target" defaultValue={target}>
                <option value="all">Tout l&apos;établissement</option>
                {levels.length ? (
                  <optgroup label="Niveaux">
                    {levels.map((l) => (
                      <option key={l.id} value={`level:${l.id}`}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {programs.length ? (
                  <optgroup label="Filières / formations">
                    {programs.map((p) => (
                      <option key={p.id} value={`program:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {classes.length ? (
                  <optgroup label="Classes">
                    {classes.map((c) => (
                      <option key={c.id} value={`class:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </FormField>
            <FormField id="r-amount" label={`Montant (${currency}) *`}>
              <Input id="r-amount" name="amount" type="number" min={0} step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField id="r-notes" label="Remarque">
              <Input id="r-notes" name="notes" maxLength={500} defaultValue={rate?.notes ?? ""} />
            </FormField>
          </div>
          <Checkbox name="is_mandatory" label="Obligatoire (facturé automatiquement à la validation de l'inscription)" defaultChecked={rate?.is_mandatory ?? true} />

          <fieldset className="grid gap-2 rounded-2xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">Échéancier {plan.length ? `(${plan.length} tranche${plan.length > 1 ? "s" : ""})` : "— paiement en une fois"}</legend>
            {plan.map((s, i) => (
              <div key={s.key} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.3fr_1fr_5.5rem_7rem_auto] sm:items-end">
                <FormField id={`p-l-${s.key}`} label={`Tranche ${i + 1}`} className="col-span-2 sm:col-span-1">
                  <Input id={`p-l-${s.key}`} name="plan_label" required maxLength={60} value={s.label} onChange={(e) => update(s.key, { label: e.target.value })} />
                </FormField>
                <FormField id={`p-d-${s.key}`} label="Échéance">
                  <Input id={`p-d-${s.key}`} name="plan_due_on" type="date" required value={s.due_on} onChange={(e) => update(s.key, { due_on: e.target.value })} />
                </FormField>
                <FormField id={`p-p-${s.key}`} label="%">
                  <Input id={`p-p-${s.key}`} name="plan_percent" type="number" min={1} max={100} step="0.01" required value={s.percent} onChange={(e) => update(s.key, { percent: e.target.value })} />
                </FormField>
                <p className="hidden pb-2.5 text-right text-sm tabular-nums text-muted-foreground sm:block">{money(((Number(amount) || 0) * (Number(s.percent) || 0)) / 100)}</p>
                <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => setPlan((cur) => cur.filter((x) => x.key !== s.key))} aria-label={`Retirer la tranche ${i + 1}`}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={plan.length >= 12}
                onClick={() =>
                  setPlan((cur) => [...cur, { key: (cur.at(-1)?.key ?? 0) + 1, label: `${cur.length + 1}${cur.length ? "e" : "re"} tranche`, due_on: "", percent: cur.length ? "" : "100" }])
                }
              >
                <Plus aria-hidden /> Ajouter une tranche
              </Button>
              {plan.length ? (
                <span className={cn("text-sm font-medium tabular-nums", Math.abs(total - 100) < 0.001 ? "text-success" : "text-danger")} aria-live="polite">
                  Total : {total} % {Math.abs(total - 100) < 0.001 ? "✓" : "(doit faire 100 %)"}
                </span>
              ) : null}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton disabled={plan.length > 0 && Math.abs(total - 100) > 0.001} pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
