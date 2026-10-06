"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";
import { LEAD_SUBJECTS } from "@/features/ecosystem/constants";
import { submitPublicLead } from "@/features/ecosystem/public-actions";
import type { ActionResult } from "@/lib/utils/action-result";

/** « Demander des informations » : transmis à l'établissement, avec l'origine de la demande. Aucun compte requis. */
export function LeadForm({ slug, programs, source, campaignId, captchaKey }: { slug: string; programs: string[]; source: string; campaignId?: string; captchaKey?: string | null }) {
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => submitPublicLead(prev, formData), null);
  if (state?.ok) {
    return (
      <div className="grid justify-items-center gap-3 py-8 text-center" role="status" data-testid="lead-sent">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <p className="font-semibold">{state.message}</p>
      </div>
    );
  }
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-3" data-testid="public-lead-form">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="source" value={source} />
      {campaignId ? <input type="hidden" name="campaign_id" value={campaignId} /> : null}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <FormField id="lead-name" label="Nom et prénom *">
        <Input id="lead-name" name="full_name" autoComplete="name" required maxLength={120} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="lead-phone" label="Téléphone">
          <Input id="lead-phone" name="phone" type="tel" autoComplete="tel" maxLength={25} />
        </FormField>
        <FormField id="lead-email" label="E-mail">
          <Input id="lead-email" name="email" type="email" autoComplete="email" maxLength={120} />
        </FormField>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">Indiquez au moins un téléphone ou un e-mail. Vos coordonnées sont transmises uniquement à cet établissement.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="lead-subject" label="Objet">
          <Select id="lead-subject" name="subject" defaultValue="information">
            {Object.entries(LEAD_SUBJECTS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="lead-program" label="Formation concernée">
          {programs.length ? (
            <Select id="lead-program" name="program" defaultValue="">
              <option value="">—</option>
              {programs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            <Input id="lead-program" name="program" maxLength={200} />
          )}
        </FormField>
      </div>
      <FormField id="lead-message" label="Message">
        <Textarea id="lead-message" name="message" maxLength={3000} rows={4} />
      </FormField>
      {captchaKey ? <TurnstileWidget siteKey={captchaKey} /> : null}
      <SubmitButton pendingLabel="Envoi…">Envoyer ma demande</SubmitButton>
    </ActionForm>
  );
}
