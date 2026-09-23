"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveFormDefinition } from "@/features/forms/actions";
import { FIELD_TYPES, slugifyKey, type FieldDefinition, type FieldType } from "@/features/forms/fields";

type EditableField = FieldDefinition & { uid: string; optionsText: string; isNew?: boolean };

// Identifiants stables entre rendu serveur et client (pas de compteur global).
const toEditable = (field: FieldDefinition, uid: string): EditableField => ({
  ...field,
  uid,
  optionsText: (field.options ?? []).join(", "),
});

function uniqueKey(label: string, taken: Set<string>): string {
  const base = slugifyKey(label || "champ");
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base.slice(0, 36)}_${i++}`;
  return key;
}

/**
 * Éditeur de champs. Les identifiants (clés) des champs existants ne changent
 * jamais, pour que les réponses déjà enregistrées restent rattachées.
 */
export function FormEditor({ kind, fields: initial, canEdit }: { kind: string; fields: FieldDefinition[]; canEdit: boolean }) {
  const [fields, setFields] = useState<EditableField[]>(() => initial.map((f, i) => toEditable(f, `${kind}-${i}`)));
  const created = useRef(0);
  const [state, action, pending] = useActionState(saveFormDefinition, null);

  const update = (uid: string, patch: Partial<EditableField>) =>
    setFields((list) => list.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  // Un champ nouveau prend un identifiant dérivé de son libellé ; un champ existant garde le sien.
  const rename = (uid: string, label: string) =>
    setFields((list) =>
      list.map((f) => {
        if (f.uid !== uid) return f;
        if (!f.isNew) return { ...f, label };
        const taken = new Set(list.filter((o) => o.uid !== uid).map((o) => o.key));
        return { ...f, label, key: uniqueKey(label || "champ", taken) };
      }),
    );
  const move = (index: number, delta: number) =>
    setFields((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });
  const add = () =>
    setFields((list) => [
      ...list,
      {
        ...toEditable({ key: uniqueKey("champ", new Set(list.map((f) => f.key))), label: "", type: "text", required: false }, `${kind}-new-${++created.current}`),
        isNew: true,
      },
    ]);

  const serialized = JSON.stringify(
    fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.type === "select" ? f.optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      section: f.section,
      help: f.help,
    })),
  );

  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="fields" value={serialized} />
      {state ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {fields.length === 0 ? <p className="text-sm text-muted-foreground">Aucun champ personnalisé.</p> : null}
      <ol className="grid gap-3">
        {fields.map((field, index) => (
          <li key={field.uid} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_11rem_auto]">
            <div className="grid gap-2">
              <label className="sr-only" htmlFor={`${field.uid}-label`}>
                Libellé du champ {index + 1}
              </label>
              <Input
                id={`${field.uid}-label`}
                value={field.label}
                placeholder="Libellé du champ"
                disabled={!canEdit}
                maxLength={120}
                onChange={(e) => rename(field.uid, e.target.value)}
                className="h-11"
              />
              {field.type === "select" ? (
                <Input
                  value={field.optionsText}
                  placeholder="Options séparées par des virgules"
                  aria-label={`Options du champ ${index + 1}`}
                  disabled={!canEdit}
                  onChange={(e) => update(field.uid, { optionsText: e.target.value })}
                  className="h-11"
                />
              ) : null}
              <p className="text-xs text-muted-foreground">Identifiant : {field.key}</p>
            </div>
            <div className="grid content-start gap-2">
              <Select
                value={field.type}
                aria-label={`Type du champ ${index + 1}`}
                disabled={!canEdit}
                onChange={(e) => update(field.uid, { type: e.target.value as FieldType })}
                className="h-11"
              >
                {Object.entries(FIELD_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={!canEdit}
                  onChange={(e) => update(field.uid, { required: e.target.checked })}
                  className="size-4 accent-[var(--primary)]"
                />
                Obligatoire
              </label>
            </div>
            {canEdit ? (
              <div className="flex gap-1 sm:flex-col">
                <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Monter">
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={index === fields.length - 1} onClick={() => move(index, 1)} aria-label="Descendre">
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => setFields((list) => list.filter((f) => f.uid !== field.uid))}
                  aria-label="Supprimer le champ"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" onClick={add}>
            <Plus aria-hidden /> Ajouter un champ
          </Button>
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer le formulaire</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
