"use client";

import { HeartPulse } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveMedicalRecord } from "@/features/students/actions";
import type { ActionResult } from "@/lib/utils/action-result";
import { notifyResult } from "@/components/motion/animated-toast";

type Medical = Partial<Record<
  "blood_group" | "allergies" | "conditions" | "medications" | "emergency_contact_name" |
  "emergency_contact_phone" | "doctor_name" | "doctor_phone" | "notes",
  string | null
>>;

export function MedicalDialog({ studentId, medical }: { studentId: string; medical: Medical | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveMedicalRecord(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const v = (key: keyof Medical) => medical?.[key] ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <HeartPulse aria-hidden /> {medical ? "Modifier" : "Renseigner"}
        </Button>
      </DialogTrigger>
      <DialogContent title="Informations médicales" description="Données sensibles : accès limité et modifications journalisées.">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4">
          <input type="hidden" name="student_id" value={studentId} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="blood_group" label="Groupe sanguin">
              <Select id="blood_group" name="blood_group" defaultValue={v("blood_group")}>
                <option value="">Non renseigné</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="medications" label="Traitements">
              <Input id="medications" name="medications" defaultValue={v("medications")} maxLength={1000} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="allergies" label="Allergies">
                <Textarea id="allergies" name="allergies" defaultValue={v("allergies")} maxLength={1000} className="min-h-16" />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField id="conditions" label="Pathologies / conditions particulières">
                <Textarea id="conditions" name="conditions" defaultValue={v("conditions")} maxLength={1000} className="min-h-16" />
              </FormField>
            </div>
            <FormField id="emergency_contact_name" label="Contact d'urgence">
              <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={v("emergency_contact_name")} />
            </FormField>
            <FormField id="emergency_contact_phone" label="Téléphone d'urgence">
              <Input id="emergency_contact_phone" name="emergency_contact_phone" type="tel" defaultValue={v("emergency_contact_phone")} />
            </FormField>
            <FormField id="doctor_name" label="Médecin traitant">
              <Input id="doctor_name" name="doctor_name" defaultValue={v("doctor_name")} />
            </FormField>
            <FormField id="doctor_phone" label="Téléphone du médecin">
              <Input id="doctor_phone" name="doctor_phone" type="tel" defaultValue={v("doctor_phone")} />
            </FormField>
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
