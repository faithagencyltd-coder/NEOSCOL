"use client";

import { Eye, Pencil } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  exampleVars,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from "@/features/platform/communication";
import { saveMessageTemplate } from "@/features/platform/communication-actions";
import type { ActionResult } from "@/lib/utils/action-result";

export type MessageTemplate = {
  code: string;
  label: string;
  description: string;
  variables: string[];
  default_title: string;
  default_body: string;
  title: string | null;
  body: string | null;
  enabled: boolean;
};

/** Modification d'un message automatique : variables cliquables et aperçu avec un exemple. */
export function MessageTemplateEditor({
  template,
}: {
  template: MessageTemplate;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(template.title ?? template.default_title);
  const [body, setBody] = useState(template.body ?? template.default_body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await saveMessageTemplate(prev, formData);
      notifyResult(result);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );
  const vars = exampleVars(template.variables);

  const insert = (name: string) => {
    const el = bodyRef.current;
    const token = `{${name}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setTitle(template.title ?? template.default_title);
          setBody(template.body ?? template.default_body);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Modifier le message « ${template.label} »`}
        >
          <Pencil aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={template.label}
        description={template.description}
        className="max-w-2xl"
      >
        <ActionForm
          dispatch={formAction}
          pending={pending}
          className="grid gap-4"
        >
          <input type="hidden" name="code" value={template.code} />
          {state && !state.ok ? (
            <Alert tone="danger">{state.message}</Alert>
          ) : null}
          <FormField id={`tpl-title-${template.code}`} label="Titre *">
            <Input
              id={`tpl-title-${template.code}`}
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
            />
          </FormField>
          <FormField id={`tpl-body-${template.code}`} label="Texte *">
            <Textarea
              id={`tpl-body-${template.code}`}
              ref={bodyRef}
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={4}
            />
          </FormField>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">
              Variables (cliquez pour les insérer dans le texte)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insert(v)}
                  className="rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-xs hover:border-primary"
                  title={TEMPLATE_VARIABLES[v]?.label}
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>
          <div
            className="grid gap-1 rounded-xl border border-dashed border-border p-3"
            data-testid="template-preview"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="size-3.5" aria-hidden /> Aperçu avec un exemple
            </span>
            <span className="font-semibold">{renderTemplate(title, vars)}</span>
            <span className="text-sm">{renderTemplate(body, vars)}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={template.enabled}
              className="size-4 accent-[var(--primary)]"
            />
            Message actif (décochez pour ne plus l&apos;envoyer)
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {template.title ? (
              <SubmitButton variant="ghost" name="intent" value="reset">
                Rétablir le texte d&apos;origine
              </SubmitButton>
            ) : (
              <span />
            )}
            <span className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton name="intent" value="save">
                Enregistrer
              </SubmitButton>
            </span>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
