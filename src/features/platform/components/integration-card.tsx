"use client";

import { CheckCircle2, KeyRound, Mail, MessageCircle, MessageSquare, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { useActionState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { saveIntegration, testIntegration } from "@/features/platform/integration-actions";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

export type IntegrationView = {
  code: string;
  label: string;
  channel: "email" | "sms" | "whatsapp" | "antibot";
  description: string;
  docs: string;
  fields: { key: string; label: string; hint?: string; required?: boolean; placeholder?: string }[];
  secret: { label: string; hint: string };
  enabled: boolean;
  config: Record<string, string>;
  secretHint: string | null;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
};

const ICONS = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle, antibot: ShieldCheck } as const;
const RECIPIENT: Record<string, { label: string; placeholder: string } | null> = {
  email: { label: "Envoyer un e-mail de test à (facultatif)", placeholder: "Votre adresse par défaut" },
  sms: { label: "Envoyer un SMS de test au (facultatif)", placeholder: "+229 97 00 00 00" },
  whatsapp: { label: "Envoyer le modèle « hello_world » au (facultatif)", placeholder: "+229 97 00 00 00" },
  antibot: null,
};

function useNotifiedAction(action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>) {
  return useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    return result;
  }, null);
}

/**
 * Carte d'une intégration de la plateforme : activation, configuration, clé
 * secrète (jamais réaffichée : seul un indice « ••1234 » est montré), test.
 */
export function IntegrationCard({ integration }: { integration: IntegrationView }) {
  const [saveState, save, saving] = useNotifiedAction(saveIntegration);
  const [testState, test, testing] = useNotifiedAction(testIntegration);
  const Icon = ICONS[integration.channel];
  const recipient = RECIPIENT[integration.channel];
  const status = integration.enabled ? "active" : integration.secretHint ? "configured" : "empty";
  const id = (k: string) => `${integration.code}-${k}`;

  return (
    <article className="hover-lift grid gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm" aria-labelledby={id("title")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", status === "active" ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <h2 id={id("title")} className="font-bold">
              {integration.label}
            </h2>
            <p className="text-sm text-muted-foreground">{integration.description}</p>
          </div>
        </div>
        <Badge tone={status === "active" ? "success" : status === "configured" ? "warning" : "neutral"}>
          {status === "active" ? "Actif" : status === "configured" ? "Configuré, désactivé" : "Non configuré"}
        </Badge>
      </header>

      <ActionForm dispatch={save} pending={saving} className="grid gap-4">
        <input type="hidden" name="provider" value={integration.code} />
        <div className="grid gap-4 sm:grid-cols-2">
          {integration.fields.map((f) => (
            <FormField key={f.key} id={id(f.key)} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
              <Input id={id(f.key)} name={`config_${f.key}`} defaultValue={integration.config[f.key] ?? ""} placeholder={f.placeholder} maxLength={300} autoComplete="off" />
            </FormField>
          ))}
          <FormField
            id={id("secret")}
            label={integration.secretHint ? `${integration.secret.label} (enregistrée : ${integration.secretHint})` : `${integration.secret.label} *`}
            hint={integration.secretHint ? "Laisser vide pour conserver la clé actuelle. " + integration.secret.hint : integration.secret.hint}
          >
            <Input id={id("secret")} name="secret" type="password" autoComplete="new-password" spellCheck={false} maxLength={500} placeholder={integration.secretHint ? "•••••••• (inchangée)" : "Collez la clé ici"} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" name="enabled" defaultChecked={integration.enabled} className="size-5 accent-[var(--primary)]" /> Activer pour tous les établissements
          </label>
          {integration.secretHint ? (
            <label className="flex cursor-pointer items-center gap-2 text-danger">
              <input type="checkbox" name="clear_secret" className="size-4 accent-[var(--danger)]" /> Supprimer la clé enregistrée
            </label>
          ) : null}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {integration.docs} La clé est chiffrée sur le serveur et n&apos;est plus jamais affichée.
        </p>
        {saveState && !saveState.ok ? <Alert tone="danger">{saveState.message}</Alert> : null}
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </div>
      </ActionForm>

      <ActionForm dispatch={test} pending={testing} className="grid gap-3 rounded-2xl border border-dashed border-border p-4">
        <input type="hidden" name="provider" value={integration.code} />
        {recipient ? (
          <FormField id={id("recipient")} label={recipient.label}>
            <Input id={id("recipient")} name="recipient" placeholder={recipient.placeholder} maxLength={200} autoComplete="off" />
          </FormField>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm" role="status">
            {integration.lastTest ? (
              <>
                {integration.lastTest.ok ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
                <span className={integration.lastTest.ok ? "text-success" : "text-danger"}>{integration.lastTest.message}</span>
                <span className="text-xs text-muted-foreground">· {new Date(integration.lastTest.at).toLocaleString("fr-FR")}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Jamais testé.</span>
            )}
          </p>
          <SubmitButton variant="secondary" pendingLabel="Test en cours…" disabled={!integration.secretHint}>
            <PlugZap aria-hidden /> Tester
          </SubmitButton>
        </div>
        {testState && !testState.ok ? <Alert tone="danger">{testState.message}</Alert> : null}
      </ActionForm>
    </article>
  );
}
