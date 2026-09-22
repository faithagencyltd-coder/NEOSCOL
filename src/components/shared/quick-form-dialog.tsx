"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

export type QuickField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: string;
};

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Formulaire de création / modification en boîte de dialogue, décrit par une liste de champs. */
export function QuickFormDialog({
  title,
  description,
  triggerLabel,
  trigger,
  submitLabel = "Enregistrer",
  action,
  fields,
  hidden = {},
}: {
  title: string;
  description?: string;
  triggerLabel?: string;
  trigger?: ReactNode;
  submitLabel?: string;
  action: Action;
  fields: QuickField[];
  hidden?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus aria-hidden /> {triggerLabel ?? "Ajouter"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={title} description={description} className="max-w-xl">
        <ActionForm dispatch={formAction} pending={pending} className="grid gap-4" noValidate>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `qf-${field.name}`;
              const err = errors[field.name];
              const label = field.required ? `${field.label} *` : field.label;
              if (field.type === "checkbox") {
                return (
                  <label key={field.name} className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      name={field.name}
                      defaultChecked={field.defaultValue === "true"}
                      className="size-4.5 accent-[var(--primary)]"
                    />
                    {field.label}
                  </label>
                );
              }
              return (
                <div key={field.name} className={cn((field.wide || field.type === "textarea") && "sm:col-span-2")}>
                  <FormField id={id} label={label} hint={field.hint} errors={err}>
                    {field.type === "select" ? (
                      <Select id={id} name={field.name} defaultValue={field.defaultValue ?? ""} aria-invalid={Boolean(err)}>
                        {!field.required ? <option value="">—</option> : null}
                        {(field.options ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    ) : field.type === "textarea" ? (
                      <Textarea id={id} name={field.name} defaultValue={field.defaultValue} maxLength={1000} />
                    ) : (
                      <Input
                        id={id}
                        name={field.name}
                        type={field.type ?? "text"}
                        defaultValue={field.defaultValue}
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        aria-invalid={Boolean(err)}
                      />
                    )}
                  </FormField>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
