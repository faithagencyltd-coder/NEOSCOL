"use client";

import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/features/auth/actions";

export function ResetPasswordForm({ redirectTo = "/tableau-de-bord" }: { redirectTo?: string }) {
  const [state, action] = useActionState(updatePassword, null);
  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href={redirectTo} className="text-center text-sm font-medium text-primary hover:underline">
          Continuer
        </Link>
      </div>
    );
  }
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <FormField id="password" label="Nouveau mot de passe" hint="10 caractères minimum, avec lettres et chiffres." errors={errors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors?.password)} />
      </FormField>
      <FormField id="confirmation" label="Confirmation" errors={errors?.confirmation}>
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors?.confirmation)} />
      </FormField>
      <SubmitButton className="w-full" size="lg" pendingLabel="Enregistrement…">
        Enregistrer le mot de passe
      </SubmitButton>
    </form>
  );
}
