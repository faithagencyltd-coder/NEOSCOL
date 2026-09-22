"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormSection } from "@/components/shared/form-section";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CustomFields } from "@/features/forms/components/custom-fields";
import type { CustomValues, FieldDefinition } from "@/features/forms/fields";
import { RELATIONSHIP } from "@/lib/labels";
import type { ActionResult } from "@/lib/utils/action-result";

type StudentValues = Partial<Record<
  | "first_name" | "last_name" | "other_names" | "sex" | "birth_date" | "birth_place" | "nationality"
  | "national_id" | "address" | "city" | "phone" | "email" | "notes",
  string | null
>>;

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function StudentForm({
  action,
  student,
  studentId,
  customFields,
  customValues,
  withGuardian,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  student?: StudentValues;
  studentId?: string;
  customFields: FieldDefinition[];
  customValues?: CustomValues;
  withGuardian: boolean;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const v = (key: keyof StudentValues) => student?.[key] ?? "";
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={name} label={label} errors={errors[name]}>
      <Input
        id={name}
        name={name}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        {...props}
      />
    </FormField>
  );

  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-5" noValidate>
      {studentId ? <input type="hidden" name="student_id" value={studentId} /> : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <FormSection title="Identité" description="Le matricule est attribué automatiquement à la création du dossier.">
        {field("last_name", "Nom *", { defaultValue: v("last_name"), required: true, autoComplete: "off", maxLength: 80 })}
        {field("first_name", "Prénom(s) *", { defaultValue: v("first_name"), required: true, autoComplete: "off", maxLength: 80 })}
        {field("other_names", "Autres noms", { defaultValue: v("other_names"), maxLength: 120 })}
        <FormField id="sex" label="Sexe" errors={errors.sex}>
          <Select id="sex" name="sex" defaultValue={v("sex")}>
            <option value="">Non renseigné</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </Select>
        </FormField>
        {field("birth_date", "Date de naissance", { type: "date", defaultValue: v("birth_date") })}
        {field("birth_place", "Lieu de naissance", { defaultValue: v("birth_place"), maxLength: 120 })}
        {field("nationality", "Nationalité", { defaultValue: v("nationality"), maxLength: 60 })}
        {field("national_id", "N° d'identification (acte, CNI…)", { defaultValue: v("national_id"), maxLength: 60 })}
      </FormSection>

      <FormSection title="Coordonnées">
        {field("address", "Adresse", { defaultValue: v("address"), maxLength: 200 })}
        {field("city", "Ville", { defaultValue: v("city"), maxLength: 80 })}
        {field("phone", "Téléphone", { type: "tel", defaultValue: v("phone"), inputMode: "tel" })}
        {field("email", "E-mail", { type: "email", defaultValue: v("email") })}
      </FormSection>

      {withGuardian ? (
        <FormSection
          title="Parent / tuteur"
          description="Facultatif. Si ce numéro correspond à un parent déjà enregistré, sa fiche est réutilisée."
        >
          <FormField id="guardian_relationship" label="Lien de parenté">
            <Select id="guardian_relationship" name="guardian_relationship" defaultValue="mother">
              {Object.entries(RELATIONSHIP).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          {field("guardian_phone", "Téléphone", { type: "tel", inputMode: "tel", placeholder: "+225 07 00 00 00 00" })}
          {field("guardian_last_name", "Nom", { maxLength: 80 })}
          {field("guardian_first_name", "Prénom(s)", { maxLength: 80 })}
          {field("guardian_email", "E-mail", { type: "email" })}
          {field("guardian_profession", "Profession", { maxLength: 80 })}
        </FormSection>
      ) : null}

      {customFields.length > 0 ? (
        <FormSection title="Informations complémentaires" description="Champs définis par l'établissement.">
          <CustomFields fields={customFields} values={customValues} errors={errors} />
        </FormSection>
      ) : null}

      <FormSection title="Remarques">
        <div className="sm:col-span-2">
          <FormField id="notes" label="Observations internes" errors={errors.notes}>
            <Textarea id="notes" name="notes" defaultValue={v("notes")} maxLength={2000} />
          </FormField>
        </div>
      </FormSection>

      {errors.allow_duplicate ? (
        <label className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
          <input type="checkbox" name="allow_duplicate" className="size-4.5 accent-[var(--primary)]" />
          Créer quand même (il ne s&apos;agit pas de la même personne)
        </label>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary">
          <Link href={cancelHref}>Annuler</Link>
        </Button>
        <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
