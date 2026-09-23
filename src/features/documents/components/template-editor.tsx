"use client";

import { Pencil, Plus } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplate } from "@/features/documents/actions";
import { fillText, sampleValues, TEMPLATE_DEFAULTS, TEMPLATE_VARIABLES } from "@/features/documents/templates";
import type { TextDocumentKind } from "@/features/documents/types";

type Initial = { id?: string; name: string; description: string; title: string; body: string; closing: string };

/**
 * Éditeur d'un modèle de document : titre, texte, formule finale et variables
 * insérables, avec un aperçu en direct aux couleurs de l'établissement.
 */
export function TemplateEditor({
  kind,
  initial,
  organization,
  mode,
}: {
  kind: TextDocumentKind;
  initial?: Initial;
  organization: { name: string; color: string; accent: string; logoId: string | null; header: string | null; footer: string | null; signatory: string | null; signatoryTitle: string | null };
  mode: "edit" | "create";
}) {
  const defaults = TEMPLATE_DEFAULTS[kind];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? defaults.title);
  const [body, setBody] = useState(initial?.body ?? defaults.body);
  const [closing, setClosing] = useState(initial?.closing ?? defaults.closing);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveTemplate>> | null, formData: FormData) => {
    const result = await saveTemplate(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const values = sampleValues({
    "etablissement.nom": organization.name,
    ...(organization.signatory ? { "signataire.nom": organization.signatory } : {}),
    ...(organization.signatoryTitle ? { "signataire.fonction": organization.signatoryTitle } : {}),
    contenu: defaults.content?.placeholder || "…",
  });
  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus aria-hidden /> Nouveau modèle personnalisé
          </Button>
        ) : (
          <Button variant="secondary" size="sm">
            <Pencil aria-hidden /> Personnaliser
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={mode === "create" ? "Nouveau modèle personnalisé" : `Modèle — ${initial?.name ?? defaults.label}`} className="max-w-5xl">
        <div className="grid gap-5 lg:grid-cols-2">
          <ActionForm dispatch={action} pending={pending} className="grid content-start gap-3">
            <input type="hidden" name="kind" value={kind} />
            {initial?.id ? <input type="hidden" name="template_id" value={initial.id} /> : null}
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="t-name" label="Nom du modèle *">
                <Input id="t-name" name="name" required maxLength={120} defaultValue={initial?.name ?? defaults.label} />
              </FormField>
              <FormField id="t-title" label="Titre imprimé *">
                <Input id="t-title" name="title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
              </FormField>
            </div>
            <FormField id="t-desc" label="Description (interne)">
              <Input id="t-desc" name="description" maxLength={300} defaultValue={initial?.description ?? ""} />
            </FormField>
            <FormField id="t-body" label="Texte du document *">
              <Textarea id="t-body" ref={bodyRef} name="body" rows={8} required maxLength={6000} value={body} onChange={(e) => setBody(e.target.value)} />
            </FormField>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Insérer une variable (à la position du curseur)</span>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insert(v.key)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs transition-colors hover:border-primary hover:bg-primary-soft"
                    title={`{{${v.key}}}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <FormField id="t-closing" label="Formule finale">
              <Textarea id="t-closing" name="closing" rows={2} maxLength={600} value={closing} onChange={(e) => setClosing(e.target.value)} />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTitle(defaults.title);
                  setBody(defaults.body);
                  setClosing(defaults.closing);
                }}
              >
                Texte standard
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton pendingLabel="Enregistrement…">Enregistrer le modèle</SubmitButton>
            </div>
          </ActionForm>

          <figure className="grid content-start gap-2" aria-label="Aperçu du document">
            <figcaption className="text-xs font-medium text-muted-foreground">Aperçu (données d&apos;exemple)</figcaption>
            <div className="aspect-[1/1.414] overflow-hidden rounded-lg border border-border bg-white p-6 text-[10px] leading-relaxed text-slate-800 shadow-lg">
              <div className="flex items-center gap-3 border-b-2 pb-2" style={{ borderColor: organization.color }}>
                {organization.logoId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu : image servie par /api/fichiers
                  <img src={`/api/fichiers/${organization.logoId}`} alt="" className="h-8 w-auto object-contain" />
                ) : (
                  <span className="grid size-8 place-items-center rounded font-bold text-white" style={{ backgroundColor: organization.color }}>
                    {organization.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="grid">
                  <strong className="text-[11px]">{organization.name}</strong>
                  {organization.header ? <span className="text-[8px] text-slate-500">{organization.header}</span> : null}
                </div>
              </div>
              <p className="mt-8 text-center text-sm font-bold tracking-wide" style={{ color: organization.color }}>
                {title || "—"}
              </p>
              <p className="mt-5 whitespace-pre-line text-justify">{fillText(body, values)}</p>
              {closing.trim() ? <p className="mt-3 whitespace-pre-line">{fillText(closing, values)}</p> : null}
              <div className="mt-8 ml-auto w-2/5 text-center">
                <p className="text-[9px] text-slate-500">Fait le {values.date}</p>
                <p className="mt-1 font-semibold">{organization.signatoryTitle ?? "Le chef d'établissement"}</p>
                <div className="mx-auto mt-6 h-px w-3/4" style={{ backgroundColor: organization.accent }} />
                <p className="mt-1">{organization.signatory ?? ""}</p>
              </div>
              {organization.footer ? <p className="mt-10 border-t pt-1 text-center text-[8px] text-slate-500">{organization.footer}</p> : null}
            </div>
          </figure>
        </div>
      </DialogContent>
    </Dialog>
  );
}
