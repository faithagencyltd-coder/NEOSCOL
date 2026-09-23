"use client";

import { ArrowDown, ArrowUp, FileStack, FileText } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveDossierOrder } from "@/features/documents/actions";
import { DOSSIER_SECTIONS, type DossierSectionKey } from "@/features/documents/dossier";

/** Attestation : l'objet est saisi puis le PDF numéroté s'ouvre dans un nouvel onglet. */
export function AttestationDialog({ studentId }: { studentId: string }) {
  const [purpose, setPurpose] = useState("");
  const [open, setOpen] = useState(false);
  const href = `/api/documents/certificats/${studentId}?type=attestation&motif=${encodeURIComponent(purpose.trim())}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <FileText aria-hidden /> Attestation
        </Button>
      </DialogTrigger>
      <DialogContent title="Délivrer une attestation" description="Le document reçoit un numéro unique et un QR Code de vérification.">
        <div className="grid gap-1.5">
          <Label htmlFor="attestation-purpose">Objet de l&apos;attestation</Label>
          <Textarea
            id="attestation-purpose"
            value={purpose}
            maxLength={300}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="ex. a suivi avec assiduité les cours du 1er trimestre"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Annuler
            </Button>
          </DialogClose>
          <Button asChild disabled={purpose.trim().length < 3}>
            <a href={purpose.trim().length >= 3 ? href : undefined} target="_blank" rel="noopener" onClick={() => setOpen(false)} aria-disabled={purpose.trim().length < 3}>
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
