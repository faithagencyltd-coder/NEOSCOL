"use client";

import { Lock } from "lucide-react";

import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/utils/action-result";

type Row = { key: string; label: string; hint: string; enabled: boolean; locked?: boolean };

/**
 * Interrupteurs des fonctionnalités. `mode="org"` : réglage de l'établissement
 * (les arrêts forcés par NeoScool sont affichés verrouillés) ; `mode="platform"` :
 * arrêt forcé par le Super Admin, motif obligatoire.
 */
export function FeaturesForm({
  rows,
  action,
  mode,
  hidden = {},
}: {
  rows: Row[];
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  mode: "org" | "platform";
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useFeedbackAction(action);
  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-3">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.key}>
            <label className="flex h-full items-start gap-3 rounded-2xl border border-border p-3 text-sm">
              <input type="hidden" name={`present_${r.key}`} value="1" />
              <input
                type="checkbox"
                name={`feature_${r.key}`}
                defaultChecked={r.enabled && !r.locked}
                disabled={mode === "org" && r.locked}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  {r.label}
                  {mode === "org" && r.locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 text-xs text-warning">
                      <Lock className="size-3" aria-hidden /> Arrêtée par NeoScool
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {mode === "platform" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="features-reason">Motif</Label>
          <Textarea id="features-reason" name="reason" required maxLength={500} placeholder="Ex. fonctionnalité non incluse dans le contrat" />
        </div>
      ) : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex justify-end">
        <SubmitButton>{mode === "platform" ? "Appliquer à cet établissement" : "Enregistrer les fonctionnalités"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
