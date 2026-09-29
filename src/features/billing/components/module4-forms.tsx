"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODULE4_COMPONENTS, type Module4Component } from "@/features/billing/constants";
import { createModule4Space, saveModule4Components } from "@/features/billing/module4-actions";
import type { ActionResult } from "@/lib/utils/action-result";

/**
 * Module 4 : domaines souscrits (1 à 3). Le prix ne change pas. Retirer un domaine
 * met son espace en lecture seule, sans rien supprimer. Contrôles en base.
 */
export function Module4ComponentsForm({ components }: { components: Module4Component[] }) {
  const [selected, setSelected] = useState<Module4Component[]>(components);
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await saveModule4Components(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const removed = components.filter((c) => !selected.includes(c));
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Domaines inclus dans l&apos;abonnement</legend>
        {MODULE4_COMPONENTS.map((c) => (
          <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 transition-colors hover:border-primary/40">
            <input
              type="checkbox"
              name={`component_${c.key}`}
              checked={selected.includes(c.key)}
              onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key)))}
              className="mt-0.5 size-5 accent-[var(--primary)]"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{c.label}</span>
              <span className="text-sm text-muted-foreground">{c.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {selected.length === 0 ? (
        <Alert tone="danger">Veuillez sélectionner au moins un domaine.</Alert>
      ) : removed.length > 0 ? (
        <Alert tone="warning">
          L&apos;espace des domaines retirés passera en lecture seule. Aucune donnée n&apos;est supprimée ; il suffit de réactiver le domaine pour tout
          retrouver.
        </Alert>
      ) : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer les domaines
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Création de l'espace d'un domaine souscrit (établissement rattaché au principal). */
export function CreateSpaceButton({ component, label, defaultName }: { component: Module4Component; label: string; defaultName: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button size="sm">
          <Plus aria-hidden /> Créer l&apos;espace
        </Button>
      }
      title={`Créer l'espace « ${label} » ?`}
      description="Un espace dédié, rattaché à votre établissement principal et couvert par le même abonnement. Vous en serez administrateur."
      confirmLabel="Créer l'espace"
      action={createModule4Space}
      fields={{ component }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`space-name-${component}`}>Nom de l&apos;espace</Label>
        <Input id={`space-name-${component}`} name="name" defaultValue={defaultName} maxLength={200} required />
      </div>
    </ConfirmAction>
  );
}
