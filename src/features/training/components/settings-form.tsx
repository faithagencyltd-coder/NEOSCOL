"use client";

import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { FormSection } from "@/components/shared/form-section";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { saveTrainingConfig } from "@/features/training/actions";
import type { TrainingConfig } from "@/features/training/config";
import type { ActionResult } from "@/lib/utils/action-result";

function Toggle({ name, label, hint, checked, onChange }: { name: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4 transition-colors hover:border-primary/40 sm:col-span-2">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary)]" />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function TrainingSettingsForm({ config }: { config: TrainingConfig }) {
  const [groups, setGroups] = useState(config.groupsEnabled);
  const [free, setFree] = useState(config.entryWithoutCourse);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveTrainingConfig(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5">
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <FormSection title="Organisation des sessions" description="Le logiciel fonctionne avec ou sans classes.">
        <Toggle
          name="groups_enabled"
          label="Utiliser des classes / groupes dans les sessions"
          hint="Désactivé : les apprenants suivent la session entière. Activé : une session peut être divisée en groupes (emploi du temps et scan par groupe). Désactiver ne supprime rien."
          checked={groups}
          onChange={setGroups}
        />
      </FormSection>
      <FormSection title="Scan des badges apprenants" description="Règles appliquées par la tablette « SCANNER VOTRE BADGE ».">
        <FormField id="late_tolerance_minutes" label="Tolérance de retard (minutes)" hint="Au-delà : « EN RETARD — X MINUTES »." errors={errors.late_tolerance_minutes}>
          <Input id="late_tolerance_minutes" name="late_tolerance_minutes" type="number" min={0} max={120} defaultValue={config.lateToleranceMinutes} />
        </FormField>
        <FormField id="open_before_minutes" label="Entrée acceptée avant le cours (minutes)" errors={errors.open_before_minutes}>
          <Input id="open_before_minutes" name="open_before_minutes" type="number" min={0} max={240} defaultValue={config.openBeforeMinutes} />
        </FormField>
        <Toggle
          name="entry_without_course"
          label="Accepter l'entrée même sans cours prévu"
          hint="Désactivé (recommandé) : l'entrée est refusée si aucun cours de l'apprenant n'est prévu à ce moment."
          checked={free}
          onChange={setFree}
        />
      </FormSection>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les paramètres</SubmitButton>
      </div>
    </ActionForm>
  );
}
