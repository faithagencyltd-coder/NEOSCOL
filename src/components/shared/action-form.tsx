"use client";

import { createContext, startTransition, useContext, type ComponentProps, type FormEvent } from "react";

/** État « en cours » partagé avec les boutons de soumission du formulaire. */
const FormPendingContext = createContext(false);

export function useFormPending(): boolean {
  return useContext(FormPendingContext);
}

/**
 * Formulaire relié à une Server Action (via useActionState) SANS la
 * réinitialisation automatique de React 19 : en cas d'erreur de validation,
 * l'utilisateur conserve sa saisie. Le bouton cliqué (name/value) est transmis.
 */
export function ActionForm({
  dispatch,
  pending,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { dispatch: (formData: FormData) => void; pending: boolean }) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter instanceof HTMLElement ? submitter : undefined);
    startTransition(() => dispatch(formData));
  };
  return (
    <FormPendingContext value={pending}>
      <form {...props} onSubmit={onSubmit} aria-busy={pending}>
        {children}
      </form>
    </FormPendingContext>
  );
}
