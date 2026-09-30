"use client";

import { Archive, CheckCircle2, Copy, CreditCard, KeyRound, Landmark, Pencil, PlugZap, Puzzle, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCustomGateway, saveGateway, testGateway } from "@/features/platform/gateway-actions";
import type { GatewayDefinition } from "@/lib/payments/gateways";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

export type GatewayView = {
  def: GatewayDefinition;
  enabled: boolean;
  mode: "test" | "live";
  isDefault: boolean;
  publicLabel: string;
  instructions: string;
  config: Record<string, string>;
  secretHint: string | null;
  webhookUrl: string;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
  /** Agrégateur ajouté par le Super Admin. */
  custom?: { editHref: string; archived: boolean };
};

function useNotified(action: (s: ActionResult | null, f: FormData) => Promise<ActionResult>) {
  return useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    notifyResult(result);
    return result;
  }, null);
}

/** Fiche d'une passerelle de paiement : proposer aux clients, mode, clés chiffrées, test, adresse de notification. */
export function GatewayCard({ gateway }: { gateway: GatewayView }) {
  const [saveState, save, saving] = useNotified(saveGateway);
  const [testState, test, testing] = useNotified(testGateway);
  const [deleteState, remove, removing] = useNotified(deleteCustomGateway);
  const [copied, setCopied] = useState(false);
  const { def } = gateway;
  const id = (k: string) => `${def.code}-${k}`;
  const offline = def.code === "offline";
  const configured = offline ? Boolean(gateway.instructions) : Boolean(gateway.secretHint);
  const Icon = offline ? Landmark : gateway.custom ? Puzzle : CreditCard;

  return (
    <article id={`gateway-${def.code}`} className="grid scroll-mt-24 gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm" data-testid={`gateway-${def.code}`} aria-labelledby={id("title")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", gateway.enabled ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <h2 id={id("title")} className="font-bold">
              {def.name}
            </h2>
            <p className="text-sm text-muted-foreground">{def.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {gateway.custom ? <Badge tone="neutral">{gateway.custom.archived ? "Archivé" : "Ajouté par vous"}</Badge> : null}
          {gateway.isDefault ? <Badge tone="info">Par défaut</Badge> : null}
          <Badge tone={gateway.enabled ? "success" : configured ? "warning" : "neutral"}>
            {gateway.enabled ? `Proposé aux clients · ${gateway.mode === "live" ? "réel" : "test"}` : configured ? "Configuré, non proposé" : "Non configuré"}
          </Badge>
        </div>
      </header>

      {gateway.custom ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={gateway.custom.editHref} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium hover:bg-surface-muted">
            <Pencil className="size-4" aria-hidden /> Modifier la définition
          </Link>
          {!gateway.custom.archived ? (
            <ActionForm
              dispatch={(fd) => {
                if (window.confirm(`Supprimer ${def.name} ? S'il a déjà servi, il sera archivé (paiements conservés).`)) remove(fd);
              }}
              pending={removing}
            >
              <input type="hidden" name="code" value={def.code} />
              <SubmitButton variant="ghost" size="sm" className="text-danger" pendingLabel="Suppression…">
                <Trash2 aria-hidden /> Supprimer
              </SubmitButton>
            </ActionForm>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Archive className="size-3.5" aria-hidden /> Paiements passés conservés ; « Modifier la définition » puis enregistrer pour le réactiver.
            </span>
          )}
          {deleteState && !deleteState.ok ? <Alert tone="danger" className="w-full">{deleteState.message}</Alert> : null}
        </div>
      ) : null}

      <ActionForm dispatch={save} pending={saving} className="grid gap-4">
        <input type="hidden" name="provider" value={def.code} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id("label")} label="Nom affiché au client" hint="Ex. : « Mobile Money (Orange, MTN, Moov) »">
            <Input id={id("label")} name="public_label" defaultValue={gateway.publicLabel} maxLength={80} />
          </FormField>
          <FormField id={id("mode")} label="Mode">
            <select id={id("mode")} name="mode" defaultValue={gateway.mode} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm">
              <option value="test">Test (aucun argent réel)</option>
              <option value="live">Réel (paiements encaissés)</option>
            </select>
          </FormField>
          {def.publicFields.map((f) => (
            <FormField key={f.key} id={id(f.key)} label={`${f.label}${f.required ? " *" : ""}`} hint={f.hint}>
              <Input id={id(f.key)} name={`config_${f.key}`} defaultValue={gateway.config[f.key] ?? ""} placeholder={f.placeholder} maxLength={200} autoComplete="off" />
            </FormField>
          ))}
          {def.secretFields.map((f) => (
            <FormField key={f.key} id={id(f.key)} label={`${f.label}${f.required && !gateway.secretHint ? " *" : ""}`} hint={gateway.secretHint ? `Laisser vide pour garder la clé actuelle.${f.hint ? " " + f.hint : ""}` : f.hint}>
              <Input id={id(f.key)} name={`secret_${f.key}`} type="password" autoComplete="new-password" spellCheck={false} maxLength={500} placeholder={gateway.secretHint ? "•••••••• (inchangée)" : "Collez la clé ici"} />
            </FormField>
          ))}
        </div>
        {offline ? (
          <FormField id={id("instructions")} label="Instructions affichées au client *" hint="Numéro Mobile Money, compte bancaire (IBAN, RIB), lien de paiement… Le client verra aussi le montant et la référence à indiquer.">
            <Textarea id={id("instructions")} name="instructions" defaultValue={gateway.instructions} rows={4} maxLength={2000} placeholder={"Orange Money : +229 00 00 00 00 (NeoScool)\nVirement : banque …, IBAN …\nOu payez par ce lien : https://…"} />
          </FormField>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" name="checkout_enabled" defaultChecked={gateway.enabled} className="size-5 accent-[var(--primary)]" /> Proposer aux clients
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="is_default" defaultChecked={gateway.isDefault} className="size-4 accent-[var(--primary)]" /> Passerelle par défaut
          </label>
          {gateway.secretHint ? (
            <label className="flex cursor-pointer items-center gap-2 text-danger">
              <input type="checkbox" name="clear_secret" className="size-4 accent-[var(--danger)]" /> Supprimer les clés enregistrées
            </label>
          ) : null}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {def.where} {def.testNote} {def.secretFields.length ? "Les clés sont chiffrées sur le serveur et ne sont plus jamais affichées." : ""}
        </p>
        {saveState && !saveState.ok ? <Alert tone="danger">{saveState.message}</Alert> : null}
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </div>
      </ActionForm>

      {def.webhook ? (
        <div className="grid gap-2 rounded-2xl bg-surface-muted p-4 text-sm">
          <span className="font-medium">Adresse de notification à copier chez {def.name}</span>
          <span className="text-xs text-muted-foreground">Dans le tableau de bord {def.name}, collez cette adresse dans « URL de notification / Webhook / IPN » : NeoScool est ainsi prévenu de chaque paiement (toujours revérifié auprès de {def.name}).</span>
          <div className="flex gap-2">
            <Input readOnly value={gateway.webhookUrl} className="font-mono text-xs" aria-label={`Adresse de notification ${def.name}`} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(gateway.webhookUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy aria-hidden /> {copied ? "Copié" : "Copier"}
            </Button>
          </div>
        </div>
      ) : null}

      <ActionForm dispatch={test} pending={testing} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4">
        <input type="hidden" name="provider" value={def.code} />
        <p className="flex items-center gap-2 text-sm" role="status">
          {gateway.lastTest ? (
            <>
              {gateway.lastTest.ok ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
              <span className={gateway.lastTest.ok ? "text-success" : "text-danger"}>{gateway.lastTest.message}</span>
              <span className="text-xs text-muted-foreground">· {new Date(gateway.lastTest.at).toLocaleString("fr-FR")}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Jamais testé.</span>
          )}
        </p>
        <SubmitButton variant="secondary" pendingLabel="Test en cours…" disabled={!configured}>
          <PlugZap aria-hidden /> Tester
        </SubmitButton>
        {testState && !testState.ok ? <Alert tone="danger" className="w-full">{testState.message}</Alert> : null}
      </ActionForm>
    </article>
  );
}
