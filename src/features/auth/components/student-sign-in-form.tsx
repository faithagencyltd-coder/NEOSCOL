"use client";

import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signInStudent } from "@/features/auth/actions";

/** Connexion élève / apprenant : matricule + date de naissance + mot de passe. */
export function StudentSignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInStudent, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="suite" value={next ?? ""} />
      <FormField id="matricule" label="Matricule" hint="Indiqué sur votre carte scolaire, ex. DEMO-26-00001" errors={errors?.matricule}>
        <Input id="matricule" name="matricule" autoComplete="username" autoCapitalize="characters" className="uppercase" required aria-invalid={Boolean(errors?.matricule)} />
      </FormField>
      <FormField id="birth_date" label="Date de naissance" errors={errors?.birth_date}>
        <Input id="birth_date" name="birth_date" type="date" required aria-invalid={Boolean(errors?.birth_date)} />
      </FormField>
      <FormField id="student_password" label="Mot de passe" errors={errors?.password}>
        <Input id="student_password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(errors?.password)} />
      </FormField>
      <SubmitButton className="w-full" size="lg" pendingLabel="Connexion…">
        Accéder à mon espace
      </SubmitButton>
    </ActionForm>
  );
}
