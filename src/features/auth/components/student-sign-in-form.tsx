"use client";

import { CalendarDays, IdCard, Lock } from "lucide-react";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { signInStudent } from "@/features/auth/actions";
import { PortalFields } from "@/features/auth/components/portal-fields";
import type { PortalTarget } from "@/features/auth/portals";
import { AuthInput, AuthSubmit } from "@/features/auth/components/auth-input";
import { TurnstileWidget, type CaptchaConfig } from "@/features/auth/components/turnstile-widget";

/** Connexion élève / étudiant / apprenant : matricule + date de naissance + mot de passe. */
export function StudentSignInForm({ next, portal, captcha }: { next?: string; portal?: PortalTarget; captcha?: CaptchaConfig }) {
  const [state, action, pending] = useActionState(signInStudent, null);
  const captchaNeeded = Boolean(state && !state.ok && state.fieldErrors?.captcha);
  const errors = state && !state.ok && !captchaNeeded ? state.fieldErrors : undefined;
  const showCaptcha = Boolean(captcha && (captcha.mode === "always" || captchaNeeded));
  return (
    <ActionForm dispatch={action} pending={pending} className="stagger grid gap-4" noValidate>
      {state && !state.ok && !errors ? (
        <div className="anim-shake">
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}
      <input type="hidden" name="suite" value={next ?? ""} />
      <PortalFields portal={portal} />
      <AuthInput
        id="matricule"
        name="matricule"
        icon={IdCard}
        label="Matricule"
        placeholder="Matricule (sur la carte scolaire)"
        autoComplete="username"
        autoCapitalize="characters"
        className="uppercase placeholder:normal-case"
        required
        error={errors?.matricule?.[0]}
      />
      <AuthInput id="birth_date" name="birth_date" type="date" icon={CalendarDays} label="Date de naissance" required error={errors?.birth_date?.[0]} hint="Date de naissance" />
      <AuthInput id="student_password" name="password" type="password" icon={Lock} label="Mot de passe" autoComplete="current-password" required error={errors?.password?.[0]} />
      {showCaptcha && captcha ? <TurnstileWidget key={state ? JSON.stringify(state) : "init"} siteKey={captcha.siteKey} /> : null}
      <AuthSubmit pending={pending} pendingLabel="Connexion en cours…">
        Accéder à mon espace
      </AuthSubmit>
    </ActionForm>
  );
}
