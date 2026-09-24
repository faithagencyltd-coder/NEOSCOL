"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateEnrollmentDetails } from "@/features/enrollments/actions";
import { CustomFields } from "@/features/forms/components/custom-fields";
import type { CustomValues, FieldDefinition } from "@/features/forms/fields";
import type { ActionResult } from "@/lib/utils/action-result";
import { notifyResult } from "@/components/motion/animated-toast";

export function EnrollmentDetailsDialog({
  enrollmentId,
  classId,
  classes,
  fields,
  values,
  notes,
}: {
  enrollmentId: string;
  classId: string | null;
  classes: { id: string; name: string }[];
  fields: FieldDefinition[];
  values: CustomValues;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateEnrollmentDetails(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Pencil aria-hidden /> Compléter
        </Button>
      </DialogTrigger>
      <DialogContent title="Compléter l'inscription" description="Classe, informations et pièces reçues." className="max-w-2xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
          <input type="hidden" name="enrollment_id" value={enrollmentId} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField id="class_id" label="Classe / session">
                <Select id="class_id" name="class_id" defaultValue={classId ?? ""}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <CustomFields fields={fields} values={values} errors={errors} />
            <div className="sm:col-span-2">
              <FormField id="notes" label="Observations">
                <Textarea id="notes" name="notes" defaultValue={notes ?? ""} maxLength={2000} />
              </FormField>
            </div>
          </div>
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
