"use client";

import { ArrowLeft, Lock, MessageSquareText, Smartphone } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { signInGuardian } from "@/features/auth/actions";
import { AuthInput, AuthSubmit } from "@/features/auth/components/auth-input";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";
import { PortalFields } from "@/features/auth/components/portal-fields";
import { TurnstileWidget, type CaptchaConfig } from "@/features/auth/components/turnstile-widget";
import type { PortalTarget } from "@/features/auth/portals";

/**
 * Connexion parents : téléphone + mot de passe remis par l'établissement
 * (par défaut, gratuit). Le code SMS (payant, si configuré) reste proposé.
 */
export function ParentSignInForm({ next, portal, captcha }: { next?: string; portal?: PortalTarget; captcha?: CaptchaConfig }) {
  const [sms, setSms] = useState(false);
  const [state, action, pending] = useActionState(signInGuardian, null);
  const captchaNeeded = Boolean(state && !state.ok && state.fieldErrors?.captcha);
  const errors = state && !state.ok && !captchaNeeded ? state.fieldErrors : undefined;
  const showCaptcha = Boolean(captcha && (captcha.mode === "always" || captchaNeeded));

  if (sms) {
    return (
      <div className="grid gap-4">
        <PhoneSignInForm next={next} portal={portal} />
        <button type="button" onClick={() => setSms(false)} className="inline-flex items-center gap-1.5 justify-self-center text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Se connecter avec mon mot de passe
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ActionForm dispatch={action} pending={pending} className="stagger grid gap-4" noValidate>
        {state && !state.ok && !errors ? (
          <div className="anim-shake">
            <Alert tone="danger">{state.message}</Alert>
          </div>
        ) : null}
        <input type="hidden" name="suite" value={next ?? ""} />
        <PortalFields portal={portal} />
        <AuthInput
          id="parent_phone"
          name="phone"
          type="tel"
          icon={Smartphone}
          label="Numéro de téléphone"
          placeholder="Téléphone (+225 07 00 00 00 01)"
          autoComplete="username"
          inputMode="tel"
          required
          error={errors?.phone?.[0]}
        />
        <AuthInput id="parent_password" name="password" type="password" icon={Lock} label="Mot de passe" autoComplete="current-password" required error={errors?.password?.[0]} />
        {showCaptcha && captcha ? <TurnstileWidget key={state ? JSON.stringify(state) : "init"} siteKey={captcha.siteKey} /> : null}
        <AuthSubmit pending={pending} pendingLabel="Connexion en cours…">
          Accéder à mon espace
        </AuthSubmit>
      </ActionForm>
      <p className="text-center text-xs text-muted-foreground">Mot de passe oublié ? L&apos;établissement vous en remet un nouveau.</p>
      <button type="button" onClick={() => setSms(true)} className="inline-flex items-center gap-1.5 justify-self-center text-sm font-medium text-primary hover:underline">
        <MessageSquareText className="size-4" aria-hidden /> Recevoir plutôt un code par SMS
      </button>
    </div>
  );
}
