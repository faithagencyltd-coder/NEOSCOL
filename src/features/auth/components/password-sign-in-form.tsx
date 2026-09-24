"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { signInWithPassword } from "@/features/auth/actions";
import { AuthInput, AuthSubmit } from "@/features/auth/components/auth-input";

/** Personnel et enseignants : e-mail ou matricule + mot de passe. */
export function PasswordSignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <ActionForm dispatch={action} pending={pending} className="stagger grid gap-4" noValidate>
      {state && !state.ok && !errors ? (
        <div className="anim-shake">
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}
      <input type="hidden" name="suite" value={next ?? ""} />
      <AuthInput
        id="email"
        name="email"
        icon={Mail}
        label="Adresse e-mail ou matricule"
        placeholder="E-mail ou matricule (EMP-…)"
        autoComplete="username"
        autoCapitalize="none"
        required
        error={errors?.email?.[0]}
      />
      <AuthInput id="password" name="password" type="password" icon={Lock} label="Mot de passe" autoComplete="current-password" required error={errors?.password?.[0]} />
      <AuthSubmit pending={pending} pendingLabel="Connexion en cours…">
        Se connecter
      </AuthSubmit>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/mot-de-passe-oublie" className="group inline-flex items-center gap-1.5 font-medium text-primary">
          <Lock className="size-4 transition-transform group-hover:-rotate-12" aria-hidden />
          <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover:bg-[length:100%_1px]">
            Mot de passe oublié ?
          </span>
        </Link>
      </div>
    </ActionForm>
  );
}
