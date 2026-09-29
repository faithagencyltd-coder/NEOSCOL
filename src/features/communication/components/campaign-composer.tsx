"use client";

import { Eye, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { notify } from "@/components/motion/animated-toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import { createCampaign, previewAudience, sendCampaignBatch, type AudiencePreview } from "../campaign-actions";
import { renderText, smsSegments } from "../render";

export type ComposerTemplate = { id: string; name: string; channel: "email" | "sms" | "whatsapp"; subject: string | null; body: string };

const AUDIENCES = [
  { value: "guardians", label: "Parents de tous les élèves" },
  { value: "classes", label: "Parents de certaines classes" },
  { value: "unpaid", label: "Parents d'élèves en impayé" },
  { value: "staff", label: "Personnel de l'établissement" },
] as const;

const CHANNEL = { email: "E-mail", sms: "SMS", whatsapp: "WhatsApp" } as const;

/** Envoie les lots restants d'un envoi, avec progression ; s'arrête si rien n'avance. */
export async function runCampaign(id: string, onProgress: (pending: number) => void): Promise<{ ok: boolean; sent: number; message?: string }> {
  let sent = 0;
  let previous = Number.POSITIVE_INFINITY;
  for (;;) {
    const res = await sendCampaignBatch(id);
    if (!res.ok || !res.data) return { ok: false, sent, message: res.ok ? "Envoi interrompu." : res.message };
    sent += res.data.sent;
    onProgress(res.data.pending);
    if (res.data.pending === 0) return { ok: true, sent };
    if (res.data.pending >= previous) return { ok: false, sent, message: "L'envoi n'avance plus : réessayez plus tard." };
    previous = res.data.pending;
  }
}

/**
 * Nouvel envoi groupé : modèle, public, aperçu (nombre de destinataires
 * joignables et message rendu), confirmation, envoi par lots avec progression.
 */
export function CampaignComposer({ templates, classes }: { templates: ComposerTemplate[]; classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [audience, setAudience] = useState<string>("guardians");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; pending: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const template = templates.find((t) => t.id === templateId);

  const form = () => {
    const fd = new FormData();
    fd.set("template_id", templateId);
    fd.set("channel", template?.channel ?? "sms");
    fd.set("audience", audience);
    fd.set("name", name);
    for (const id of classIds) fd.append("class_ids", id);
    return fd;
  };
  const reset = () => setPreview(null);

  const doPreview = () =>
    startTransition(async () => {
      setError(null);
      const res = await previewAudience(form());
      if (!res.ok || !res.data) return setError(res.ok ? "Aperçu impossible." : res.message);
      setPreview(res.data);
    });

  const doSend = () =>
    startTransition(async () => {
      setError(null);
      const created = await createCampaign(form());
      if (!created.ok || !created.data) return setError(created.ok ? "Préparation impossible." : created.message);
      setProgress({ total: created.data.total, pending: created.data.total });
      const result = await runCampaign(created.data.id, (p) => setProgress({ total: created.data!.total, pending: p }));
      if (result.ok) notify.success(`Envoi terminé : ${result.sent} message(s) envoyé(s).`);
      else setError(result.message ?? "Envoi interrompu.");
      setPreview(null);
      setProgress(null);
      router.refresh();
    });

  const sample = preview?.sample[0];
  const rendered = useMemo(() => (template && sample ? renderText(template.body, sample.variables) : null), [template, sample]);

  if (templates.length === 0) {
    return <Alert tone="info">Créez d&apos;abord un modèle de message actif.</Alert>;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cc-template">Modèle</Label>
          <Select
            id="cc-template"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              reset();
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {CHANNEL[t.channel]} — {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cc-name">Nom de l&apos;envoi (facultatif)</Label>
          <Input id="cc-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder={template?.name} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Destinataires</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="cc-audience"
                value={a.value}
                checked={audience === a.value}
                onChange={() => {
                  setAudience(a.value);
                  reset();
                }}
              />
              {a.label}
            </label>
          ))}
        </div>
        {audience === "classes" ? (
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Classes">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="checkbox"
                  checked={classIds.includes(c.id)}
                  onChange={(e) => {
                    setClassIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)));
                    reset();
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {preview ? (
        <div className="grid gap-3 rounded-2xl border border-border bg-surface-muted/40 p-4" aria-live="polite" data-testid="campaign-preview">
          <p className="text-sm">
            <span className="font-semibold">{preview.reachable}</span> destinataire(s) joignable(s) sur {preview.total}
            {preview.total > preview.reachable ? ` — ${preview.total - preview.reachable} sans ${template?.channel === "email" ? "adresse e-mail" : "numéro"}` : ""}.
          </p>
          {rendered && sample ? (
            <div className="grid gap-1 text-sm">
              <p className="text-xs text-muted-foreground">
                Exemple pour {sample.name} ({sample.contact}) :
              </p>
              {template?.channel === "email" && template.subject ? <p className="font-medium">{renderText(template.subject, sample.variables)}</p> : null}
              <p className="whitespace-pre-line rounded-xl bg-surface p-3">{rendered}</p>
              {template?.channel === "sms" ? <p className="text-xs text-muted-foreground">{rendered.length} caractère(s) — {smsSegments(rendered)} SMS par destinataire.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {progress ? (
        <div className="grid gap-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round(((progress.total - progress.pending) / Math.max(progress.total, 1)) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Envoi en cours : {progress.total - progress.pending} / {progress.total}. Ne fermez pas la page.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={doPreview} disabled={pending || (audience === "classes" && classIds.length === 0)}>
          <Eye aria-hidden /> Aperçu des destinataires
        </Button>
        <Button type="button" onClick={doSend} disabled={pending || !preview || preview.reachable === 0}>
          <Send aria-hidden /> Envoyer à {preview?.reachable ?? "…"} destinataire(s)
        </Button>
      </div>
    </div>
  );
}

/** Reprendre un envoi interrompu (page fermée pendant l'envoi). */
export function ResumeCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runCampaign(id, () => {});
          if (result.ok) notify.success(`Envoi terminé : ${result.sent} message(s) envoyé(s).`);
          else notify.error(result.message ?? "Envoi interrompu.");
          router.refresh();
        })
      }
    >
      <Send aria-hidden /> {pending ? "Envoi…" : "Reprendre"}
    </Button>
  );
}
