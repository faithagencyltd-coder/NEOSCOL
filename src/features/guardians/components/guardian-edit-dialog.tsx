"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CustomFields } from "@/features/forms/components/custom-fields";
import type { CustomValues, FieldDefinition } from "@/features/forms/fields";
import { updateGuardian } from "@/features/guardians/actions";
import type { ActionResult } from "@/lib/utils/action-result";

type Guardian = Record<
  "id" | "first_name" | "last_name",
  string
> &
  Partial<Record<"sex" | "phone" | "phone_secondary" | "email" | "profession" | "employer" | "address" | "city" | "national_id", string | null>>;

export function GuardianEditDialog({ guardian, customFields = [], customValues = {} }: { guardian: Guardian; customFields?: FieldDefinition[]; customValues?: CustomValues }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateGuardian(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const input = (name: keyof Guardian, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={name} label={label} errors={errors[name]}>
      <Input id={name} name={name} defaultValue={guardian[name] ?? ""} aria-invalid={Boolean(errors[name])} {...props} />
    </FormField>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Pencil aria-hidden /> Modifier
        </Button>
      </DialogTrigger>
      <DialogContent title="Modifier la fiche du parent" className="max-w-2xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
          <input type="hidden" name="guardian_id" value={guardian.id} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {input("last_name", "Nom *", { maxLength: 80 })}
            {input("first_name", "Prénom(s) *", { maxLength: 80 })}
            <FormField id="sex" label="Sexe">
              <Select id="sex" name="sex" defaultValue={guardian.sex ?? ""}>
                <option value="">Non renseigné</option>
                <option value="F">Féminin</option>
                <option value="M">Masculin</option>
              </Select>
            </FormField>
            {input("phone", "Téléphone", { type: "tel", inputMode: "tel" })}
            {input("phone_secondary", "Téléphone secondaire", { type: "tel" })}
            {input("email", "E-mail", { type: "email" })}
            {input("profession", "Profession")}
            {input("employer", "Employeur")}
            {input("address", "Adresse")}
            {input("city", "Ville")}
            {input("national_id", "N° de pièce d'identité")}
            {customFields.length ? <CustomFields fields={customFields} values={customValues} errors={errors} /> : null}
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
