"use client";

import { CalendarDays, IdCard, Lock } from "lucide-react";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { Alert } from "@/components/ui/alert";
import { signInStudent } from "@/features/auth/actions";
import { AuthInput, AuthSubmit } from "@/features/auth/components/auth-input";

/** Connexion élève / étudiant / apprenant : matricule + date de naissance + mot de passe. */
export function StudentSignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInStudent, null);
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
      <AuthSubmit pending={pending} pendingLabel="Connexion en cours…">
        Accéder à mon espace
      </AuthSubmit>
    </ActionForm>
  );
}
