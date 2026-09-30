"use client";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { PERIOD_OPTIONS } from "@/features/teacher-access/constants";
import { saveTeacherAccessSettings } from "@/features/teacher-access/platform-actions";

type Rule = { enabled: boolean; price: number; currency: string; period_months: number; grace_days: number };

/** Règle Super Admin : activation, prix, devise, périodicité, délai de grâce. */
export function TeacherAccessSettingsForm({ rule }: { rule: Rule }) {
  const [state, formAction, pending] = useFeedbackAction(saveTeacherAccessSettings);
  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
      <label className="flex items-start gap-3 rounded-2xl border border-border p-4">
        <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="mt-1 size-4 accent-[var(--primary)]" />
        <span className="grid gap-0.5">
          <span className="font-semibold">Exiger un abonnement pour chaque établissement supplémentaire</span>
          <span className="text-sm text-muted-foreground">
            Le premier établissement d&apos;un enseignant reste inclus. Sans abonnement valide, seul l&apos;accès supplémentaire est suspendu — le compte n&apos;est
            jamais supprimé.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ta-price">Prix</Label>
          <Input id="ta-price" name="price" type="number" min={0} step={1} defaultValue={rule.price} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ta-currency">Devise</Label>
          <Input id="ta-currency" name="currency" defaultValue={rule.currency} maxLength={3} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ta-period">Durée / périodicité</Label>
          <Select id="ta-period" name="period_months" defaultValue={String(rule.period_months)}>
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ta-grace">Délai de grâce (jours)</Label>
          <Input id="ta-grace" name="grace_days" type="number" min={0} max={60} defaultValue={rule.grace_days} required />
        </div>
      </div>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <p className="text-xs text-muted-foreground">
        Un changement de prix s&apos;applique aux prochains paiements ; les périodes déjà payées sont conservées. Chaque modification est historisée et auditée.
      </p>
      <div className="flex justify-end">
        <SubmitButton>Enregistrer la règle</SubmitButton>
      </div>
    </ActionForm>
  );
}
