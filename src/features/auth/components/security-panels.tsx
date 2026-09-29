"use client";

import { KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmTotpEnrollment, disableTotp, signOutOtherDevices, startTotpEnrollment, verifyMfaLogin, type EnrollData } from "@/features/auth/security-actions";
import type { ActionResult } from "@/lib/utils/action-result";

function CodeInput({ id, label = "Code à 6 chiffres" }: { id: string; label?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        placeholder="123456"
        className="text-center font-mono text-2xl tracking-[0.4em]"
      />
    </div>
  );
}

/** Connexion — 2e étape : code de l'application d'authentification. */
export function MfaLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyMfaLogin, null);
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4">
      {state && !state.ok ? (
        <div className="anim-shake">
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}
      <input type="hidden" name="suite" value={next ?? ""} />
      <CodeInput id="mfa-code" />
      <SubmitButton size="lg" pendingLabel="Vérification…">
        <ShieldCheck aria-hidden /> Vérifier
      </SubmitButton>
    </ActionForm>
  );
}

function useNotified(action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>) {
  return useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    return result;
  }, null);
}

/** Activation / désactivation de la double authentification (TOTP). */
export function MfaPanel({ enrolled, required }: { enrolled: boolean; required: boolean }) {
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirmState, confirm, confirming] = useNotified(confirmTotpEnrollment);
  const [disableState, disable, disabling] = useNotified(disableTotp);

  if (enrolled) {
    return (
      <div className="grid gap-4">
        <p className="flex items-center gap-2 font-semibold text-success">
          <ShieldCheck className="size-5" aria-hidden /> Double authentification activée
        </p>
        <p className="text-sm text-muted-foreground">Un code de votre application d&apos;authentification est demandé à chaque connexion. Sans ce code, le compte n&apos;a accès à rien, même avec le mot de passe.</p>
        {required ? (
          <Alert tone="info">Obligatoire pour votre rôle : elle ne peut pas être désactivée.</Alert>
        ) : (
          <ActionForm dispatch={disable} pending={disabling} className="grid gap-3 rounded-2xl border border-dashed border-border p-4">
            <CodeInput id="mfa-disable" label="Code actuel (pour désactiver)" />
            {disableState && !disableState.ok ? <Alert tone="danger">{disableState.message}</Alert> : null}
            <SubmitButton variant="danger" pendingLabel="Désactivation…">
              Désactiver la double authentification
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    );
  }

  if (!enroll) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Protégez votre compte : en plus du mot de passe, un code à 6 chiffres généré par une application (Google Authenticator, Microsoft Authenticator, 2FAS…) sera demandé.
        </p>
        {startError ? <Alert tone="danger">{startError}</Alert> : null}
        <Button
          size="lg"
          disabled={starting}
          onClick={() =>
            startTransition(async () => {
              const result = await startTotpEnrollment();
              if (result.ok && result.data) {
                setEnroll(result.data);
                setStartError(null);
              } else setStartError(result.ok ? "Activation impossible." : result.message);
            })
          }
        >
          <Smartphone aria-hidden /> {starting ? "Préparation…" : "Activer la double authentification"}
        </Button>
      </div>
    );
  }

  return (
    <ActionForm dispatch={confirm} pending={confirming} className="grid gap-4">
      <ol className="grid gap-3 text-sm">
        <li>1. Ouvrez votre application d&apos;authentification et scannez ce QR code.</li>
        <li className="flex justify-center">
          {/* QR code (SVG) fourni par le service d'authentification. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code de configuration de la double authentification" className="size-48 rounded-2xl border border-border bg-white p-2" />
        </li>
        <li className="grid gap-1">
          <span>Impossible de scanner ? Saisissez cette clé :</span>
          <code className="flex items-center gap-2 break-all rounded-xl bg-surface-muted px-3 py-2 font-mono text-xs">
            <KeyRound className="size-3.5 shrink-0" aria-hidden /> {enroll.secret}
          </code>
        </li>
        <li>2. Saisissez le code affiché par l&apos;application.</li>
      </ol>
      <input type="hidden" name="factor_id" value={enroll.factorId} />
      <CodeInput id="mfa-enroll" />
      {confirmState && !confirmState.ok ? <Alert tone="danger">{confirmState.message}</Alert> : null}
      <SubmitButton size="lg" pendingLabel="Vérification…">
        Confirmer et activer
      </SubmitButton>
    </ActionForm>
  );
}

export function SignOutOthersButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          notifyResult(await signOutOtherDevices());
        })
      }
    >
      {pending ? "Déconnexion…" : "Déconnecter tous les autres appareils"}
    </Button>
  );
}
