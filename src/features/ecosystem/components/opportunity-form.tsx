"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { notifyResult } from "@/components/motion/animated-toast";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveOpportunity } from "@/features/ecosystem/public-actions";
import type { ActionResult } from "@/lib/utils/action-result";

export type OpportunityValues = Partial<Record<"id" | "category" | "title" | "description" | "country" | "city" | "location" | "subject" | "level" | "compensation" | "contract" | "schedule" | "starts_on" | "expires_at" | "visibility", string | null>>;

/** Annonce NeoScool Opportunities (particulier ou établissement) : brouillon ou envoi en publication. */
export function OpportunityForm({
  categories,
  countries,
  organizationId,
  values = {},
  doneHref,
}: {
  categories: { key: string; label: string }[];
  countries: { code: string; name: string }[];
  organizationId?: string;
  values?: OpportunityValues;
  /** Adresse après enregistrement ; « {id} » est remplacé par l'identifiant de l'annonce. */
  doneHref: string;
}) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult<{ id: string }> | null, formData: FormData) => {
    const result = await saveOpportunity(prev, formData);
    notifyResult(result);
    if (result.ok && result.data) router.push(doneHref.replace("{id}", result.data.id));
    return result;
  }, null);
  const v = (k: keyof OpportunityValues) => values[k] ?? "";
  return (
    <ActionForm dispatch={dispatch} pending={pending} className="grid gap-4" data-testid="opportunity-form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {organizationId ? <input type="hidden" name="organization_id" value={organizationId} /> : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="op-category" label="Catégorie *">
          <Select id="op-category" name="category" defaultValue={v("category")} required>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="op-title" label="Titre *">
          <Input id="op-title" name="title" defaultValue={v("title")} required minLength={5} maxLength={140} />
        </FormField>
      </div>
      <FormField id="op-description" label="Description *" hint="Missions, profil recherché, conditions. 20 caractères minimum.">
        <Textarea id="op-description" name="description" defaultValue={v("description")} required minLength={20} maxLength={5000} rows={8} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="op-country" label="Pays *">
          <Select id="op-country" name="country" defaultValue={v("country")} required>
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="op-city" label="Ville">
          <Input id="op-city" name="city" defaultValue={v("city")} maxLength={80} />
        </FormField>
        <FormField id="op-location" label="Quartier / lieu">
          <Input id="op-location" name="location" defaultValue={v("location")} maxLength={200} />
        </FormField>
        <FormField id="op-subject" label="Matière / domaine">
          <Input id="op-subject" name="subject" defaultValue={v("subject")} maxLength={120} />
        </FormField>
        <FormField id="op-level" label="Niveau">
          <Input id="op-level" name="level" defaultValue={v("level")} maxLength={120} />
        </FormField>
        <FormField id="op-compensation" label="Rémunération / tarif">
          <Input id="op-compensation" name="compensation" defaultValue={v("compensation")} maxLength={120} />
        </FormField>
        <FormField id="op-contract" label="Contrat">
          <Input id="op-contract" name="contract" defaultValue={v("contract")} maxLength={120} placeholder="CDI, vacation, stage…" />
        </FormField>
        <FormField id="op-schedule" label="Horaires">
          <Input id="op-schedule" name="schedule" defaultValue={v("schedule")} maxLength={200} />
        </FormField>
        <FormField id="op-starts" label="Début">
          <Input id="op-starts" name="starts_on" type="date" defaultValue={v("starts_on")} />
        </FormField>
        <FormField id="op-expires" label="Fin de diffusion" hint="30 jours par défaut, 180 au plus.">
          <Input id="op-expires" name="expires_at" type="date" defaultValue={v("expires_at")} />
        </FormField>
        <FormField id="op-visibility" label="Visibilité">
          <Select id="op-visibility" name="visibility" defaultValue={v("visibility") || "public"}>
            <option value="public">Tout le monde</option>
            <option value="members">Personnes connectées uniquement</option>
          </Select>
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">N&apos;indiquez pas de coordonnées personnelles dans le texte : les réponses vous arrivent dans votre espace. Les annonces peuvent être vérifiées par NeoScool avant publication.</p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="submit" value="publish" pendingLabel="Envoi…">
          Publier
        </SubmitButton>
        <SubmitButton name="submit" value="draft" variant="secondary">
          Enregistrer le brouillon
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
