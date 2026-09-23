"use client";

import { ArrowDown, ArrowUp, FileStack, FileText } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveDossierOrder } from "@/features/documents/actions";
import { DOSSIER_SECTIONS, type DossierSectionKey } from "@/features/documents/dossier";
import { TEMPLATE_DEFAULTS } from "@/features/documents/templates";
import { TEXT_DOCUMENT_KINDS, type TextDocumentKind } from "@/features/documents/types";

/**
 * Documents rédigés (Document Studio) : type ou modèle personnalisé, champ
 * libre éventuel, puis le PDF numéroté s'ouvre dans un nouvel onglet.
 */
export function WrittenDocumentDialog({ studentId, customTemplates = [], trigger }: { studentId: string; customTemplates?: { id: string; name: string }[]; trigger?: ReactNode }) {
  const kinds = TEXT_DOCUMENT_KINDS.filter((k) => k !== "custom");
  const [choice, setChoice] = useState<string>("attestation");
  const [content, setContent] = useState("");
  const [open, setOpen] = useState(false);
  const custom = choice.startsWith("custom:");
  const kind = (custom ? "custom" : choice) as TextDocumentKind;
  const field = TEMPLATE_DEFAULTS[kind].content;
  const ready = !field?.required || content.trim().length >= 3;
  const params = new URLSearchParams({ type: kind });
  if (custom) params.set("modele", choice.slice(7));
  if (content.trim()) params.set("motif", content.trim());
  const href = `/api/documents/certificats/${studentId}?${params.toString()}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm">
            <FileText aria-hidden /> Autre document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="Délivrer un document" description="Rédigé selon le modèle de l'établissement ; numéro unique et QR Code de vérification.">
        <div className="grid gap-1.5">
          <Label htmlFor="written-kind">Document</Label>
          <Select id="written-kind" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {TEMPLATE_DEFAULTS[k].label}
              </option>
            ))}
            {customTemplates.length ? (
              <optgroup label="Modèles personnalisés">
                {customTemplates.map((t) => (
                  <option key={t.id} value={`custom:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
          <p className="text-xs text-muted-foreground">{TEMPLATE_DEFAULTS[kind].description}</p>
        </div>
        {field ? (
          <div className="grid gap-1.5">
            <Label htmlFor="written-content">{field.label}</Label>
            <Textarea id="written-content" value={content} maxLength={600} onChange={(e) => setContent(e.target.value)} placeholder={field.placeholder} />
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Annuler
            </Button>
          </DialogClose>
          <Button asChild disabled={!ready}>
            <a href={ready ? href : undefined} target="_blank" rel="noopener" onClick={() => setOpen(false)} aria-disabled={!ready}>
              Générer le PDF
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Générer le dossier complet PDF » : choix et ordre des pièces fusionnées.
 * L'ordre peut être enregistré par défaut pour l'établissement (settings.manage).
 */
export function DossierDialog({ studentId, initialOrder, canSaveDefault }: { studentId: string; initialOrder: DossierSectionKey[]; canSaveDefault: boolean }) {
  const [order, setOrder] = useState<DossierSectionKey[]>(() => [
    ...initialOrder,
    ...DOSSIER_SECTIONS.map((s) => s.key).filter((k) => !initialOrder.includes(k)),
  ]);
  const [enabled, setEnabled] = useState<Set<DossierSectionKey>>(() => new Set(initialOrder));
  const [state, formAction, pending] = useActionState(saveDossierOrder, null);
  const selected = order.filter((k) => enabled.has(k));
  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <FileStack aria-hidden /> Générer le dossier complet PDF
        </Button>
      </DialogTrigger>
      <DialogContent title="Dossier complet PDF" description="Toutes les pièces sont fusionnées en un seul PDF, dans l'ordre ci-dessous." className="max-w-xl">
        <ol className="grid gap-2">
          {order.map((key, index) => {
            const section = DOSSIER_SECTIONS.find((s) => s.key === key)!;
            return (
              <li key={key} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                <Checkbox
                  className="min-h-0 flex-1"
                  label={section.label}
                  checked={enabled.has(key)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setEnabled((current) => {
                      const next = new Set(current);
                      if (checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                  }}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={`Monter « ${section.label} »`} onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Descendre « ${section.label} »`} onClick={() => move(index, 1)} disabled={index === order.length - 1}>
                  <ArrowDown aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
        {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {canSaveDefault ? (
            <ActionForm dispatch={formAction} pending={pending}>
              <input type="hidden" name="order" value={selected.join(",")} />
              <SubmitButton variant="ghost" size="sm" disabled={selected.length === 0}>
                Enregistrer comme ordre par défaut
              </SubmitButton>
            </ActionForm>
          ) : (
            <span />
          )}
          <Button asChild disabled={selected.length === 0}>
            <a href={`/api/documents/dossiers/${studentId}?ordre=${selected.join(",")}`} target="_blank" rel="noopener">
              Générer le PDF
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
