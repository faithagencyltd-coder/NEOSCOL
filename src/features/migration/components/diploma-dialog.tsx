"use client";

import { Award, FileUp } from "lucide-react";
import { useState } from "react";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addDiploma } from "@/features/migration/actions";
import { DIPLOMA_KINDS } from "@/features/migration/fields";

/** Diplôme, certificat ou attestation d'un (ancien) élève, avec scan facultatif. */
export function DiplomaDialog({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, action, pending] = useFeedbackAction(addDiploma, {
    onSuccess: () => {
      setOpen(false);
      setFileName(null);
    },
  });
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Award aria-hidden /> Ajouter un diplôme / certificat
        </Button>
      </DialogTrigger>
      <DialogContent title="Diplôme, certificat ou attestation" description="Le scan (PDF, JPEG ou PNG, 5 Mo) est facultatif et reste stocké dans le dossier." className="max-w-xl">
        <ActionForm dispatch={action} pending={pending} className="grid gap-4" encType="multipart/form-data">
          <input type="hidden" name="student_id" value={studentId} />
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="d-kind" label="Type *">
              <Select id="d-kind" name="kind" defaultValue="diploma">
                {Object.entries(DIPLOMA_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="d-title" label="Intitulé *" errors={errors.title}>
              <Input id="d-title" name="title" required maxLength={200} placeholder="BEPC, BAC série D, Licence…" />
            </FormField>
            <FormField id="d-year" label="Année / session">
              <Input id="d-year" name="year_label" maxLength={20} placeholder="2019-2020" />
            </FormField>
            <FormField id="d-mention" label="Mention">
              <Input id="d-mention" name="mention" maxLength={120} />
            </FormField>
            <FormField id="d-number" label="Numéro">
              <Input id="d-number" name="number" maxLength={120} />
            </FormField>
            <FormField id="d-issued" label="Délivré le" errors={errors.issued_on}>
              <Input id="d-issued" name="issued_on" type="date" />
            </FormField>
            <FormField id="d-issuer" label="Délivré par" className="sm:col-span-2">
              <Input id="d-issuer" name="issuer" maxLength={200} placeholder="Ministère, office des examens…" />
            </FormField>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input p-4 text-sm transition-colors hover:border-primary hover:bg-primary-soft/40">
            <FileUp className="size-5 text-primary" aria-hidden />
            <span className="flex-1 truncate">{fileName ?? "Joindre le scan (facultatif)"}</span>
            <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
