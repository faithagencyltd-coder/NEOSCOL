"use client";

import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { notifyResult } from "@/components/motion/animated-toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPLIED_FEATURES, FEATURE_LABELS, MULTI_MODULES_PLAN, PLAN_ORG_TYPES } from "@/features/billing/constants";
import type { ActionResult } from "@/lib/utils/action-result";

type EditablePlan = {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  audience: string | null;
  highlights: string[];
  highlights_en: string[];
  org_types: string[];
  sort_order: number;
  is_active: boolean;
  currency: string;
  features: { feature_code: string; enabled: boolean }[];
};

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Création ou modification complète d'une formule : identité, textes FR / EN,
 * avantages affichés, types d'établissement concernés, options incluses.
 * Le prix d'une formule existante se change avec « Modifier le prix » (historique).
 */
export function PlanEditor({ plan, action, trigger }: { plan?: EditablePlan; action: Action; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const creating = !plan;
  const multi = plan?.code === MULTI_MODULES_PLAN;
  const enabled = new Set(plan ? plan.features.filter((f) => f.enabled).map((f) => f.feature_code) : Object.keys(FEATURE_LABELS));
  const types = new Set(plan?.org_types ?? []);
  const p = (suffix: string) => `plan-${plan?.id ?? "new"}-${suffix}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={creating ? "Nouvelle formule" : `Modifier la formule ${plan.name}`}
        description={creating ? "Nom, prix, essai, établissements concernés et options incluses." : "Tout se modifie ici, sauf le prix (bouton « Modifier le prix », avec historique)."}
        className="max-w-3xl"
      >
        <ActionForm dispatch={formAction} pending={pending} className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1" noValidate>
          {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

          <section className="grid gap-3 sm:grid-cols-2">
            {creating ? (
              <Field id={p("code")} label="Code *" hint="Majuscules et _ , par exemple SCOLAIRE_PREMIUM. Ne change plus ensuite.">
                <Input id={p("code")} name="code" required maxLength={40} placeholder="SCOLAIRE_PREMIUM" />
              </Field>
            ) : null}
            <Field id={p("name")} label="Nom affiché *">
              <Input id={p("name")} name="name" required maxLength={80} defaultValue={plan?.name ?? ""} />
            </Field>
            <Field id={p("name_en")} label="Nom en anglais">
              <Input id={p("name_en")} name="name_en" maxLength={80} defaultValue={plan?.name_en ?? ""} />
            </Field>
            <Field id={p("audience")} label="Pour qui (phrase courte)">
              <Input id={p("audience")} name="audience" maxLength={200} defaultValue={plan?.audience ?? ""} />
            </Field>
            {creating ? (
              <>
                <Field id={p("price")} label="Prix mensuel (F CFA) *">
                  <Input id={p("price")} name="monthly_price" type="number" min={100} required defaultValue="15000" />
                </Field>
                <Field id={p("discount")} label="Remise annuelle (%)">
                  <Input id={p("discount")} name="annual_discount_percent" type="number" min={0} max={60} step="0.5" defaultValue="30" />
                </Field>
                <Field id={p("trial")} label="Essai gratuit (jours)">
                  <Input id={p("trial")} name="trial_days" type="number" min={0} max={90} defaultValue="20" />
                </Field>
              </>
            ) : null}
            <Field id={p("order")} label="Ordre d'affichage" hint="Plus petit = affiché en premier ; la première formule d'un type sert à l'essai gratuit.">
              <Input id={p("order")} name="sort_order" type="number" min={0} max={999} defaultValue={String(plan?.sort_order ?? 10)} />
            </Field>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Field id={p("desc")} label="Description">
              <Textarea id={p("desc")} name="description" rows={3} maxLength={1000} defaultValue={plan?.description ?? ""} />
            </Field>
            <Field id={p("desc_en")} label="Description en anglais">
              <Textarea id={p("desc_en")} name="description_en" rows={3} maxLength={1000} defaultValue={plan?.description_en ?? ""} />
            </Field>
            <Field id={p("hl")} label="Avantages affichés (un par ligne, 8 au plus)">
              <Textarea id={p("hl")} name="highlights" rows={4} defaultValue={(plan?.highlights ?? []).join("\n")} />
            </Field>
            <Field id={p("hl_en")} label="Avantages en anglais">
              <Textarea id={p("hl_en")} name="highlights_en" rows={4} defaultValue={(plan?.highlights_en ?? []).join("\n")} />
            </Field>
          </section>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Établissements concernés</legend>
            {multi ? (
              <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                Établissements principaux qui réunissent plusieurs activités (Module 4). Ce rattachement ne change pas.
                <input type="hidden" name="org_type_school_group" value="on" />
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3" data-testid="plan-org-types">
                {PLAN_ORG_TYPES.map((group) => (
                  <div key={group.module} className="grid content-start gap-1.5 rounded-xl border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.module}</p>
                    {group.types.map((t) => (
                      <label key={t.value} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={`org_type_${t.value}`} defaultChecked={types.has(t.value)} className="size-4 accent-[var(--primary)]" /> {t.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Options incluses</legend>
            <p className="text-xs text-muted-foreground">Les options marquées « appliquée » sont réellement coupées pour les établissements dont la formule ne les inclut pas.</p>
            <div className="grid gap-1.5 sm:grid-cols-2" data-testid="plan-features">
              {Object.entries(FEATURE_LABELS)
                .filter(([code]) => multi || code !== "multi_establishment")
                .map(([code, label]) => (
                  <label key={code} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                    <input type="hidden" name={`present_${code}`} value="1" />
                    <input type="checkbox" name={`feature_${code}`} defaultChecked={enabled.has(code)} className="size-4 accent-[var(--primary)]" />
                    <span>{label}</span>
                    {APPLIED_FEATURES.has(code) ? <span className="rounded-full bg-primary/10 px-2 text-[11px] font-medium text-primary">appliquée</span> : null}
                  </label>
                ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="is_active" defaultChecked={plan ? plan.is_active : true} className="size-4 accent-[var(--primary)]" /> Proposer cette formule (inscription, Mon abonnement, page Tarifs)
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>{creating ? "Créer la formule" : "Enregistrer la formule"}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
