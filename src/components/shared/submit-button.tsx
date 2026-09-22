"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { useFormPending } from "@/components/shared/action-form";
import { Button } from "@/components/ui/button";

/** Bouton de soumission avec état de chargement (ActionForm ou formulaire d'action natif). */
export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending: nativePending } = useFormStatus();
  const contextPending = useFormPending();
  const pending = nativePending || contextPending;
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? "Veuillez patienter…") : children}
    </Button>
  );
}
