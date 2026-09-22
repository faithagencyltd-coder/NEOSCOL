"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/features/auth/actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  if (state?.ok) {
    return <Alert tone="success" title="Demande envoyée">{state.message}</Alert>;
  }
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <FormField id="email" label="Adresse e-mail" errors={errors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(errors?.email)} />
      </FormField>
      <SubmitButton className="w-full" size="lg" pendingLabel="Envoi…">
        Envoyer le lien
      </SubmitButton>
    </form>
  );
}
