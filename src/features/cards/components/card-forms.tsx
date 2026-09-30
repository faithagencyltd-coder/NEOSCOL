"use client";

import { IdCard } from "lucide-react";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";

import { issueCard, setCardValidity } from "../actions";

/** Génération de la carte (aucune carte active). */
export function IssueCardButton({ studentId, label = "Générer la carte" }: { studentId: string; label?: string }) {
  const [, formAction, pending] = useFeedbackAction(issueCard);
  return (
    <ActionForm dispatch={formAction} pending={pending}>
      <input type="hidden" name="student_id" value={studentId} />
      <SubmitButton pendingLabel="Génération…">
        <IdCard aria-hidden /> {label}
      </SubmitButton>
    </ActionForm>
  );
}

/** Date de validité (vide = fin de l'année en cours). */
export function ValidityForm({ studentId, value, yearLabel, disabled }: { studentId: string; value: string | null; yearLabel: string; disabled?: boolean }) {
  const [state, formAction, pending] = useFeedbackAction(setCardValidity);
  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <label htmlFor="card-valid-until" className="text-sm font-medium">
        Valide jusqu&apos;au
      </label>
      <div className="flex gap-2">
        <input
          id="card-valid-until"
          name="valid_until"
          type="date"
          defaultValue={value ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(state && !state.ok)}
          className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
        />
        <SubmitButton variant="secondary" disabled={disabled} pendingLabel="…">
          OK
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">Vide = « {yearLabel} » sur la carte.</p>
    </ActionForm>
  );
}
