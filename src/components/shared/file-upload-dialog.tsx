"use client";

import { Upload } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/utils/action-result";

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Envoi d'un fichier (photo, justificatif) : contrôle du type et de la taille côté serveur. */
export function FileUploadDialog({
  title,
  description,
  trigger,
  action,
  fields,
  accept = "image/png,image/jpeg",
  children,
}: {
  title: string;
  description?: string;
  trigger?: ReactNode;
  action: Action;
  fields: Record<string, string>;
  accept?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      setOpen(false);
      setPreview(null);
    }
    return result;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm">
            <Upload aria-hidden /> Envoyer un fichier
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <ActionForm dispatch={formAction} pending={pending} className="grid gap-4" encType="multipart/form-data">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          <div className="grid gap-1.5">
            <Label htmlFor="upload-file">Fichier (5 Mo maximum)</Label>
            <input
              id="upload-file"
              name="file"
              type="file"
              required
              accept={accept}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setPreview(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
              }}
            />
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local (URL blob)
            <img src={preview} alt="Aperçu du fichier sélectionné" className="max-h-48 justify-self-center rounded-lg object-contain" />
          ) : null}
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Envoyer</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
