"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addGuardianToStudent } from "@/features/students/actions";
import { RELATIONSHIP } from "@/lib/labels";
import type { ActionResult } from "@/lib/utils/action-result";

export function GuardianDialog({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await addGuardianToStudent(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <UserPlus aria-hidden /> Ajouter un parent
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Ajouter un parent / tuteur"
        description="Si le numéro correspond à un parent déjà enregistré, sa fiche existante est rattachée."
      >
        <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
          <input type="hidden" name="student_id" value={studentId} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="guardian_relationship" label="Lien de parenté">
              <Select id="guardian_relationship" name="guardian_relationship" defaultValue="father">
                {Object.entries(RELATIONSHIP).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="guardian_phone" label="Téléphone" errors={errors.guardian_phone}>
              <Input id="guardian_phone" name="guardian_phone" type="tel" inputMode="tel" placeholder="+225…" />
            </FormField>
            <FormField id="guardian_last_name" label="Nom *" errors={errors.guardian_last_name}>
              <Input id="guardian_last_name" name="guardian_last_name" maxLength={80} />
            </FormField>
            <FormField id="guardian_first_name" label="Prénom(s) *" errors={errors.guardian_first_name}>
              <Input id="guardian_first_name" name="guardian_first_name" maxLength={80} />
            </FormField>
            <FormField id="guardian_email" label="E-mail" errors={errors.guardian_email}>
              <Input id="guardian_email" name="guardian_email" type="email" />
            </FormField>
            <FormField id="guardian_profession" label="Profession">
              <Input id="guardian_profession" name="guardian_profession" maxLength={80} />
            </FormField>
          </div>
          <fieldset className="grid gap-1 text-sm">
            <legend className="mb-1 font-medium">Rôle auprès de l&apos;élève</legend>
            <label className="flex min-h-10 items-center gap-3">
              <input type="checkbox" name="is_primary" className="size-4.5 accent-[var(--primary)]" /> Contact principal
            </label>
            <label className="flex min-h-10 items-center gap-3">
              <input type="checkbox" name="is_financial_responsible" className="size-4.5 accent-[var(--primary)]" /> Responsable financier
            </label>
            <label className="flex min-h-10 items-center gap-3">
              <input type="checkbox" name="portal_access" defaultChecked className="size-4.5 accent-[var(--primary)]" /> Accès au portail parent
            </label>
          </fieldset>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>Rattacher</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
