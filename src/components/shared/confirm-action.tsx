"use client";

import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/utils/action-result";
import { notifyResult } from "@/components/motion/animated-toast";

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Bouton + boîte de confirmation pour une action sensible (archiver, rejeter…).
 * `fields` : champs cachés transmis à l'action ; `reason` : motif obligatoire.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  fields,
  reason,
  tone = "primary",
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  action: Action;
  fields: Record<string, string>;
  reason?: { label: string; required?: boolean };
  tone?: "primary" | "danger";
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          {reason ? (
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-reason">{reason.label}</Label>
              <Textarea id="confirm-reason" name="reason" required={reason.required} maxLength={500} />
            </div>
          ) : null}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"}>{confirmLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
