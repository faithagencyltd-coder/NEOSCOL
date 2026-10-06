"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useActionState, useState } from "react";

import { trackConversion } from "@/features/analytics/client";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";
import { submitLead } from "@/features/marketing/actions";
import type { Dict, Locale } from "@/features/marketing/content";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

/** Formulaire de contact / demande de démonstration (enregistré pour le Super Admin). */
export function ContactForm({ locale, defaultKind, labels, countries, captchaKey }: { locale: Locale; defaultKind: "contact" | "demo"; labels: Dict["contact"]; countries: string[]; captchaKey?: string | null }) {
  const [kind, setKind] = useState(defaultKind);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await submitLead(prev, formData);
    if (result.ok) trackConversion(formData.get("kind") === "demo" ? "demo_request" : "contact_request");
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  if (state?.ok) {
    return (
      <div className="grid justify-items-center gap-3 py-12 text-center" role="status" data-testid="lead-sent">
        <CheckCircle2 className="size-12 text-emerald-600" aria-hidden />
        <p className="max-w-sm text-lg font-semibold text-[#0b2559]">{labels.sent}</p>
      </div>
    );
  }
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate data-testid="contact-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="kind" value={kind} />
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div role="radiogroup" className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f0f4fb] p-1">
        {(["demo", "contact"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("rounded-xl px-3 py-2.5 text-sm font-semibold transition-all", kind === k ? "bg-white text-[#0b2559] shadow-sm" : "text-[#0b2559]/60")}
          >
            {k === "demo" ? labels.kindDemo : labels.kindContact}
          </button>
        ))}
      </div>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="lead-name" label={`${labels.name} *`} errors={errors.full_name}>
          <Input id="lead-name" name="full_name" autoComplete="name" required aria-invalid={Boolean(errors.full_name)} />
        </FormField>
        <FormField id="lead-email" label={`${labels.email} *`} errors={errors.email}>
          <Input id="lead-email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(errors.email)} />
        </FormField>
        <FormField id="lead-phone" label={labels.phone} errors={errors.phone}>
          <Input id="lead-phone" name="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} />
        </FormField>
        <FormField id="lead-org" label={labels.organization}>
          <Input id="lead-org" name="organization" autoComplete="organization" />
        </FormField>
        <FormField id="lead-type" label={labels.orgType}>
          <Select id="lead-type" name="organization_type" defaultValue="">
            <option value="">—</option>
            {Object.entries(labels.orgTypes).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="lead-country" label={labels.country}>
          <Input id="lead-country" name="country" list="lead-countries" autoComplete="country-name" />
          <datalist id="lead-countries">
            {countries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
      </div>
      <FormField id="lead-message" label={kind === "contact" ? `${labels.message} *` : labels.message} errors={errors.message}>
        <Textarea id="lead-message" name="message" rows={5} maxLength={3000} aria-invalid={Boolean(errors.message)} />
      </FormField>
      {captchaKey ? <TurnstileWidget siteKey={captchaKey} /> : null}
      <p className="text-xs text-[#0b2559]/55">{labels.privacy}</p>
      <SubmitButton className="h-12 bg-[#0b2559] text-white hover:bg-[#0b2559]/90">
        <Send aria-hidden /> {labels.send}
      </SubmitButton>
    </ActionForm>
  );
}
