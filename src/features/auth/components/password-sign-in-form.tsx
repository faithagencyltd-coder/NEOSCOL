"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { signInWithPassword } from "@/features/auth/actions";

export function PasswordSignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="suite" value={next ?? ""} />
      <FormField id="email" label="Adresse e-mail" errors={errors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={Boolean(errors?.email)}
          aria-describedby={errors?.email ? "email-error" : undefined}
        />
      </FormField>
      <FormField id="password" label="Mot de passe" errors={errors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(errors?.password)}
          aria-describedby={errors?.password ? "password-error" : undefined}
        />
      </FormField>
      <div className="flex justify-end">
        <Link href="/mot-de-passe-oublie" className="text-sm font-medium text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </ActionForm>
  );
}
