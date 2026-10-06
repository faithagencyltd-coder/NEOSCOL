"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { notifyResult } from "@/components/motion/animated-toast";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/utils/action-result";

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Formulaire en ligne relié à une Server Action : champs cachés, champs libres (children),
 * un ou plusieurs boutons (`submit` : libellé du bouton par défaut, ou boutons fournis dans children).
 */
export function InlineForm({
  action,
  hidden = {},
  children,
  submit,
  variant = "primary",
  size = "sm",
  className = "grid gap-3",
  reset = false,
  redirectTo,
  testId,
}: {
  action: Action;
  hidden?: Record<string, string>;
  children?: ReactNode;
  submit?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  reset?: boolean;
  redirectTo?: string;
  testId?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    if (result.ok) {
      if (reset) form.current?.reset();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
    return result;
  }, null);
  return (
    <ActionForm ref={form} dispatch={dispatch} pending={pending} className={className} data-testid={testId}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      {submit ? (
        <SubmitButton variant={variant} size={size} className="w-fit">
          {submit}
        </SubmitButton>
      ) : null}
    </ActionForm>
  );
}
