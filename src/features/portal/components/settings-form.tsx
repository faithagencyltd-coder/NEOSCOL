"use client";


import { ActionForm } from "@/components/shared/action-form";
import { FormSection } from "@/components/shared/form-section";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { saveOrganizationSettings } from "@/features/portal/actions";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

export type SettingsValues = {
  restrictions_enabled: boolean;
  grace_days: number;
  min_overdue_amount: number;
  restrict_grades: boolean;
  restrict_report_cards: boolean;
  restrict_documents: boolean;
  restrict_timetable: boolean;
  days_before_due: number;
  overdue_interval_days: number;
  open_before_minutes: number;
  late_tolerance_minutes: number;
  duplicate_window_seconds: number;
  track_departure: boolean;
  lock_after_validation: boolean;
  credit_threshold: number;
};

function NumberField({ name, label, hint, value, min = 0, max }: { name: string; label: string; hint?: string; value: number; min?: number; max: number }) {
  return (
    <FormField id={name} label={label} hint={hint}>
      <Input id={name} name={name} type="number" inputMode="numeric" min={min} max={max} defaultValue={value} required />
    </FormField>
  );
}

/** Paramètres de l'établissement (settings.manage) : impayés, rappels, pointage, notes. */
export function SettingsForm({ values, currency }: { values: SettingsValues; currency: string }) {
  const [state, action, pending] = useFeedbackAction(saveOrganizationSettings);
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5">
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <FormSection
        title="Restrictions en cas d'impayé"
        description="Appliquées au portail parent et élève. Les présences, absences et retards restent TOUJOURS visibles ; aucune donnée n'est supprimée. Un paiement enregistré lève la restriction immédiatement."
      >
        <Checkbox name="restrictions_enabled" label="Activer les restrictions automatiques" defaultChecked={values.restrictions_enabled} className="sm:col-span-2" />
        <NumberField name="grace_days" label="Délai de grâce (jours)" hint="Après la date d'échéance." value={values.grace_days} max={120} />
        <NumberField name="min_overdue_amount" label={`Montant minimum échu (${currency})`} hint="En dessous, aucune restriction." value={values.min_overdue_amount} max={100_000_000} />
        <fieldset className="grid gap-1 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Fonctionnalités suspendues</legend>
          <Checkbox name="restrict_grades" label="Notes" defaultChecked={values.restrict_grades} />
          <Checkbox name="restrict_report_cards" label="Bulletins" defaultChecked={values.restrict_report_cards} />
          <Checkbox name="restrict_documents" label="Documents officiels" defaultChecked={values.restrict_documents} />
          <Checkbox name="restrict_timetable" label="Emploi du temps" defaultChecked={values.restrict_timetable} />
          <p className="text-xs text-muted-foreground">Les présences et la situation financière ne sont jamais suspendues.</p>
        </fieldset>
      </FormSection>
      <FormSection title="Rappels de paiement" description="Notifications envoyées aux parents sur leur portail avant et après chaque échéance (envoi quotidien automatique ou manuel depuis Finances).">
        <NumberField name="days_before_due" label="Rappel avant l'échéance (jours)" value={values.days_before_due} max={60} />
        <NumberField name="overdue_interval_days" label="Relance d'impayé tous les (jours)" value={values.overdue_interval_days} min={1} max={90} />
      </FormSection>
      <FormSection title="Pointage du personnel" description="Fenêtre de scan du badge avant un cours et tolérance de retard.">
        <NumberField name="open_before_minutes" label="Ouverture avant le cours (min)" value={values.open_before_minutes} max={120} />
        <NumberField name="late_tolerance_minutes" label="Tolérance de retard (min)" value={values.late_tolerance_minutes} max={120} />
        <NumberField name="duplicate_window_seconds" label="Anti double-scan (secondes)" value={values.duplicate_window_seconds} max={3600} />
        <Checkbox name="track_departure" label="Enregistrer aussi les départs" defaultChecked={values.track_departure} className="self-end" />
      </FormSection>
      <FormSection title="Notes et crédits" description="Après validation par l'enseignant, les notes ne sont plus modifiables sans réouverture par l'administration. Crédits (ECTS) : une matière est acquise si sa moyenne atteint le seuil.">
        <Checkbox name="lock_after_validation" label="Verrouiller les notes validées" defaultChecked={values.lock_after_validation} className="sm:col-span-2" />
        <NumberField name="credit_threshold" label="Seuil d'acquisition des crédits (sur 20)" value={values.credit_threshold} min={1} max={20} />
      </FormSection>
      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Enregistrement…">
          Enregistrer les paramètres
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
