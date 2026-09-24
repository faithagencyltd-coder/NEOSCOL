"use client";

import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveIdentity } from "@/features/organization/actions";
import { ORGANIZATION_TYPE_LABELS, vocabularyFor } from "@/lib/vocabulary";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

type Values = {
  name: string;
  type: string;
  short_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  logoId: string | null;
};

/** Coordonnées et couleurs de l'établissement, avec aperçu de l'en-tête des documents. */
export function IdentityForm({ values, canEdit }: { values: Values; canEdit: boolean }) {
  const [state, action, pending] = useFeedbackAction(saveIdentity);
  const [name, setName] = useState(values.name);
  const [primary, setPrimary] = useState(values.primary_color);
  const [secondary, setSecondary] = useState(values.secondary_color);
  const [type, setType] = useState(values.type);
  const vocab = vocabularyFor(type);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const text = (key: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`org-${key}`} label={label} errors={errors[key]}>
      <Input id={`org-${key}`} name={key} defaultValue={(values[key] as string | null) ?? ""} disabled={!canEdit} {...props} />
    </FormField>
  );
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-4">
        {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="org-name" label="Nom officiel *" errors={errors.name} className="sm:col-span-2">
            <Input id="org-name" name="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField id="org-type" label="Type d'établissement" errors={errors.type} hint={`Vocabulaire : ${vocab.students.toLowerCase()}, ${vocab.classes.toLowerCase()}, ${vocab.teachers.toLowerCase()}.`}>
            <Select id="org-type" name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={!canEdit}>
              {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          {text("short_name", "Sigle / nom court", { maxLength: 40 })}
          {text("phone", "Téléphone", { type: "tel", maxLength: 40 })}
          {text("email", "E-mail", { type: "email", maxLength: 200 })}
          {text("website", "Site web", { maxLength: 200, placeholder: "https://" })}
          {text("address", "Adresse", { maxLength: 300 })}
          {text("city", "Ville", { maxLength: 120 })}
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Couleurs des documents</legend>
          {[
            { key: "secondary_color", label: "Couleur principale (titres, bandeaux)", value: secondary, set: setSecondary },
            { key: "primary_color", label: "Couleur d'accent (filets, QR)", value: primary, set: setPrimary },
          ].map((c) => (
            <label key={c.key} className="flex items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
              <input
                type="color"
                name={c.key}
                value={c.value}
                onChange={(e) => c.set(e.target.value.toUpperCase())}
                disabled={!canEdit}
                className="size-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
              />
              <span className="grid">
                <span className="font-medium">{c.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.value}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {canEdit ? (
          <div>
            <SubmitButton pendingLabel="Enregistrement…">Enregistrer l&apos;identité</SubmitButton>
          </div>
        ) : null}
      </div>
      <figure className="grid content-start gap-2" aria-label="Aperçu de l'en-tête des documents">
        <figcaption className="text-xs font-medium text-muted-foreground">Aperçu de l&apos;en-tête</figcaption>
        <div className="overflow-hidden rounded-xl border border-border bg-white p-4 text-slate-800 shadow-lg">
          <div className="flex items-center gap-3 border-b-2 pb-3" style={{ borderColor: secondary }}>
            {values.logoId ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu : image servie par /api/fichiers
              <img src={`/api/fichiers/${values.logoId}`} alt="" className="h-10 w-auto object-contain" />
            ) : (
              <span className="grid size-10 place-items-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: secondary }}>
                {name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="grid min-w-0">
              <strong className="truncate text-sm">{name || "—"}</strong>
              <span className="truncate text-[11px] text-slate-500">{[values.address, values.city].filter(Boolean).join(", ") || "Adresse"}</span>
            </div>
          </div>
          <p className="mt-4 text-center text-xs font-bold tracking-wider" style={{ color: secondary }}>
            CERTIFICAT DE SCOLARITÉ
          </p>
          <div className="mx-auto mt-3 h-1 w-16 rounded-full" style={{ backgroundColor: primary }} />
          <div className="mt-3 grid gap-1.5">
            {[90, 100, 75].map((w) => (
              <span key={w} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </figure>
    </ActionForm>
  );
}
