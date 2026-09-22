"use client";

import { MessageSquareText } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveAppreciation } from "@/features/report-cards/actions";
import type { ActionResult } from "@/lib/utils/action-result";

export function AppreciationDialog({
  reportCardId,
  studentName,
  values,
}: {
  reportCardId: string;
  studentName: string;
  values: { appreciation: string | null; head_teacher_comment: string | null; decision: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveAppreciation(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Appréciation — ${studentName}`}>
          <MessageSquareText aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Appréciations — ${studentName}`}>
        <ActionForm dispatch={action} pending={pending} className="grid gap-4">
          <input type="hidden" name="report_card_id" value={reportCardId} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <FormField id="appreciation" label="Appréciation générale">
            <Textarea id="appreciation" name="appreciation" defaultValue={values.appreciation ?? ""} maxLength={1000} />
          </FormField>
          <FormField id="head_teacher_comment" label="Avis du professeur principal">
            <Textarea id="head_teacher_comment" name="head_teacher_comment" defaultValue={values.head_teacher_comment ?? ""} maxLength={1000} className="min-h-16" />
          </FormField>
          <FormField id="decision" label="Décision du conseil" hint="Ex. Félicitations, Encouragements, Avertissement travail…">
            <Input id="decision" name="decision" defaultValue={values.decision ?? ""} maxLength={200} />
          </FormField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Enregistrer</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
