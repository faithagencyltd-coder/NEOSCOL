"use client";

import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { requestPhoneOtp, verifyPhoneOtp } from "@/features/auth/actions";

/** Connexion parents / élèves : téléphone puis code à usage unique (SMS). */
export function PhoneSignInForm({ next }: { next?: string }) {
  const [requestState, requestAction, requestPending] = useActionState(requestPhoneOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyPhoneOtp, null);
  const [editing, setEditing] = useState(false);

  const phone = requestState?.ok && !editing ? requestState.data?.phone : undefined;

  if (!phone) {
    const errors = requestState && !requestState.ok ? requestState.fieldErrors : undefined;
    return (
      <ActionForm
        dispatch={(formData) => {
          setEditing(false);
          requestAction(formData);
        }}
        pending={requestPending}
        className="grid gap-4"
        noValidate
      >
        {requestState && !requestState.ok ? <Alert tone="danger">{requestState.message}</Alert> : null}
        <FormField id="phone" label="Numéro de téléphone" hint="Format international, ex. +225 07 00 00 00 01" errors={errors?.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+225 07 00 00 00 01"
            required
            aria-invalid={Boolean(errors?.phone)}
            aria-describedby={errors?.phone ? "phone-error" : "phone-hint"}
          />
        </FormField>
        <SubmitButton className="w-full" size="lg" pendingLabel="Envoi du code…">
          Recevoir un code par SMS
        </SubmitButton>
      </ActionForm>
    );
  }

  const errors = verifyState && !verifyState.ok ? verifyState.fieldErrors : undefined;
  return (
    <ActionForm dispatch={verifyAction} pending={verifyPending} className="grid gap-4" noValidate>
      <Alert tone="info">{requestState?.message}</Alert>
      {verifyState && !verifyState.ok ? <Alert tone="danger">{verifyState.message}</Alert> : null}
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="suite" value={next ?? ""} />
      <FormField id="token" label="Code reçu par SMS" errors={errors?.token}>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="••••••"
          className="text-center text-lg tracking-[0.5em]"
          required
          aria-invalid={Boolean(errors?.token)}
          aria-describedby={errors?.token ? "token-error" : undefined}
        />
      </FormField>
      <SubmitButton className="w-full" size="lg" pendingLabel="Vérification…">
        Valider le code
      </SubmitButton>
      <Button type="button" variant="link" onClick={() => setEditing(true)}>
        Modifier le numéro
      </Button>
    </ActionForm>
  );
}
