"use client";

import { Send, Users } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_STATUSES, MODULES } from "@/features/platform/communication";
import { previewCampaign, startCampaign, type CampaignPreview } from "@/features/platform/communication-actions";
import type { ActionResult } from "@/lib/utils/action-result";

function CheckboxGroup({ legend, prefix, items, defaults = [] }: { legend: string; prefix: string; items: readonly { value: string; label: string }[]; defaults?: string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label key={item.value} className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
            <input type="checkbox" name={`${prefix}_${item.value}`} defaultChecked={defaults.includes(item.value)} className="size-4 accent-[var(--primary)]" />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Envoi groupé aux directions, avec le nombre de destinataires mis à jour en direct. */
export function CampaignForm({ emailConfigured }: { emailConfigured: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<CampaignPreview>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await startCampaign(prev, formData);
    notifyResult(result);
    if (result.ok) formRef.current?.reset();
    return result;
  }, null);

  const refresh = useCallback(() => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    void previewCampaign(data).then(setPreview);
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-5" ref={formRef} onChange={(e) => {
      const name = (e.target as unknown as HTMLInputElement).name ?? "";
      if (/^(module|status)_|^include_demo$/.test(name)) refresh();
    }}>
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      <CheckboxGroup legend="Modules (aucun coché = tous)" prefix="module" items={MODULES} />
      <CheckboxGroup legend="Situation de l'abonnement (aucune cochée = toutes)" prefix="status" items={CAMPAIGN_STATUSES} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="include_demo" className="size-4 accent-[var(--primary)]" /> Inclure les établissements de démonstration
      </label>
      <p className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm" data-testid="campaign-preview" aria-live="polite">
        <Users className="size-4 text-primary" aria-hidden />
        {preview
          ? `${preview.recipients} membre(s) de direction dans ${preview.organizations} établissement(s) · ${preview.with_email} adresse(s) e-mail`
          : "Calcul des destinataires…"}
      </p>
      <FormField id="campaign-subject" label="Objet *">
        <Input id="campaign-subject" name="subject" required minLength={3} maxLength={150} />
      </FormField>
      <FormField id="campaign-body" label="Message *" hint="Texte simple ; les retours à la ligne sont conservés.">
        <Textarea id="campaign-body" name="body" required minLength={10} maxLength={5000} rows={7} />
      </FormField>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Canaux</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="channel_in_app" defaultChecked className="size-4 accent-[var(--primary)]" /> Notification dans l&apos;application (et sur téléphone si activé)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="channel_email" defaultChecked={emailConfigured} className="size-4 accent-[var(--primary)]" /> E-mail
          {!emailConfigured ? <span className="text-xs text-warning">— l&apos;envoi d&apos;e-mails n&apos;est pas encore activé (onglet Intégrations)</span> : null}
        </label>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Envoi en cours…" disabled={preview?.recipients === 0}>
          <Send aria-hidden /> Envoyer
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
