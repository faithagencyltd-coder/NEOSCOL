"use client";

import { FilePlus2 } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/utils/action-result";
import { notifyResult } from "@/components/motion/animated-toast";

/**
 * Dépôt (ou nouvel envoi après demande de correction) d'un justificatif
 * d'absence, avec pièce jointe PDF / photo. Utilisé par l'administration et
 * par les familles (portail).
 */
export function JustificationForm({
  action,
  students,
  defaults,
  justificationId,
  trigger,
  today,
}: {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  students: { id: string; name: string }[];
  defaults?: { studentId?: string; startsOn?: string; endsOn?: string; reason?: string };
  justificationId?: string;
  trigger?: ReactNode;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <>
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <FilePlus2 aria-hidden /> Déposer un justificatif
            </Button>
          )}
        </DialogTrigger>
        <DialogContent title={justificationId ? "Compléter le justificatif" : "Justifier une absence"} description="La pièce jointe (PDF, JPEG ou PNG, 5 Mo max.) est examinée par l'administration.">
          <ActionForm dispatch={formAction} pending={pending} className="grid gap-4" encType="multipart/form-data">
            {justificationId ? <input type="hidden" name="justification_id" value={justificationId} /> : null}
            {students.length === 1 ? (
              <input type="hidden" name="student_id" value={students[0]!.id} />
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="j-student">Élève</Label>
                <Select id="j-student" name="student_id" defaultValue={defaults?.studentId ?? ""} required>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="j-from">Du</Label>
                <Input id="j-from" name="starts_on" type="date" required max={today} defaultValue={defaults?.startsOn ?? today} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="j-to">Au</Label>
                <Input id="j-to" name="ends_on" type="date" required max={today} defaultValue={defaults?.endsOn ?? today} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="j-reason">Motif</Label>
              <Textarea id="j-reason" name="reason" required minLength={3} maxLength={1000} defaultValue={defaults?.reason} placeholder="ex. Consultation médicale" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="j-file">Justificatif (facultatif)</Label>
              <input
                id="j-file"
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary"
              />
            </div>
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
    </>
  );
}
