"use client";

import { MessageSquareText, PencilLine, RotateCw, Smartphone, UserRound } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { AnimatedOTP } from "@/components/motion/animated-otp";
import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { requestParentOtp, verifyPhoneOtp } from "@/features/auth/actions";
import { PortalFields } from "@/features/auth/components/portal-fields";
import type { PortalTarget } from "@/features/auth/portals";
import { AuthInput, AuthSubmit } from "@/features/auth/components/auth-input";
import { cn } from "@/lib/utils/cn";

const RESEND_SECONDS = 30;

/**
 * Connexion parents : téléphone + nom + prénom, puis code à usage unique (SMS).
 * Étape 2 : saisie case par case, validation automatique au 6e chiffre,
 * compte à rebours avant renvoi, secousse en cas de code erroné.
 */
export function PhoneSignInForm({ next, portal }: { next?: string; portal?: PortalTarget }) {
  const [requestState, requestAction, requestPending] = useActionState(requestParentOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyPhoneOtp, null);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [lastRequest, setLastRequest] = useState<FormData | null>(null);
  const verifyForm = useRef<HTMLFormElement>(null);

  const phone = requestState?.ok && !editing ? requestState.data?.phone : undefined;
  const remaining = Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    if (!phone) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phone]);

  const sendCode = (formData: FormData) => {
    setLastRequest(formData);
    setEditing(false);
    setCode("");
    const t = Date.now();
    setSentAt(t);
    setNow(t);
    requestAction(formData);
  };

  if (!phone) {
    const errors = requestState && !requestState.ok ? requestState.fieldErrors : undefined;
    return (
      <ActionForm dispatch={sendCode} pending={requestPending} className="stagger grid gap-4" noValidate>
        <PortalFields portal={portal} />
        {requestState && !requestState.ok && !errors ? (
          <div className="anim-shake">
            <Alert tone="danger">{requestState.message}</Alert>
          </div>
        ) : null}
        <AuthInput
          id="phone"
          name="phone"
          type="tel"
          icon={Smartphone}
          label="Numéro de téléphone"
          placeholder="Téléphone (+225 07 00 00 00 01)"
          autoComplete="tel"
          inputMode="tel"
          required
          error={errors?.phone?.[0]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthInput id="last_name" name="last_name" icon={UserRound} label="Nom" autoComplete="family-name" required error={errors?.last_name?.[0]} />
          <AuthInput id="first_name" name="first_name" icon={UserRound} label="Prénom" autoComplete="given-name" required error={errors?.first_name?.[0]} />
        </div>
        <AuthSubmit pending={requestPending} pendingLabel="Envoi du code…">
          Recevoir un code par SMS
        </AuthSubmit>
      </ActionForm>
    );
  }

  const failed = verifyState && !verifyState.ok;
  const status = verifyPending ? "verifying" : failed && code.length === 6 ? "error" : "idle";
  return (
    <ActionForm ref={verifyForm} dispatch={verifyAction} pending={verifyPending} className="anim-fade-up grid gap-5" noValidate>
      <div className="flex items-start gap-3 rounded-2xl bg-primary-soft/70 p-3.5 text-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MessageSquareText className="anim-pop size-5" aria-hidden />
        </span>
        <p className="grid gap-0.5">
          <span className="font-semibold">Code envoyé</span>
          <span className="text-muted-foreground">
            {requestState?.message} ({phone})
          </span>
        </p>
      </div>
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="suite" value={next ?? ""} />
      <PortalFields portal={portal} />
      <AnimatedOTP
        name="token"
        value={code}
        status={status}
        autoFocus
        onChange={(value) => {
          setCode(value);
          // Validation automatique dès le 6e chiffre.
          if (value.length === 6 && !verifyPending) window.setTimeout(() => verifyForm.current?.requestSubmit(), 120);
        }}
      />
      {failed ? (
        <p role="alert" className="anim-fade-up -mt-2 text-center text-sm font-medium text-danger">
          {verifyState.message}
        </p>
      ) : null}
      <AuthSubmit pending={verifyPending} pendingLabel="Vérification du code…">
        Valider le code
      </AuthSubmit>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
          <PencilLine className="size-4" aria-hidden /> Modifier le numéro
        </button>
        <button
          type="button"
          disabled={remaining > 0 || requestPending || !lastRequest}
          onClick={() => lastRequest && sendCode(lastRequest)}
          className={cn("inline-flex items-center gap-1.5 font-medium", remaining > 0 ? "text-muted-foreground" : "text-primary hover:underline")}
          aria-live="polite"
        >
          <RotateCw className={cn("size-4", requestPending && "[animation:spin-slow_0.8s_linear_infinite]")} aria-hidden />
          {remaining > 0 ? (
            <span>
              Renvoyer dans <span className="tabular-nums">0:{String(remaining).padStart(2, "0")}</span>
            </span>
          ) : (
            "Renvoyer le code"
          )}
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(remaining / RESEND_SECONDS) * 100}%` }} />
      </div>
    </ActionForm>
  );
}
