"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { declareOfflinePayment } from "@/features/billing/actions";
import type { ActionResult } from "@/lib/utils/action-result";

export function OfflineDeclarationForm({ reference, declared }: { reference: string; declared: string }) {
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await declareOfflinePayment(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-3">
      <input type="hidden" name="reference" value={reference} />
      <FormField id="declared" label="Référence de votre paiement *" hint="Numéro de transaction Mobile Money, référence du virement…">
        <Input id="declared" name="declared" defaultValue={declared} required minLength={3} maxLength={120} autoComplete="off" />
      </FormField>
      <FormField id="note" label="Précision (facultatif)">
        <Input id="note" name="note" maxLength={300} placeholder="Ex. : payé depuis le numéro +229 …" />
      </FormField>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton pendingLabel="Envoi…">
        <Send aria-hidden /> {declared ? "Mettre à jour ma déclaration" : "J'ai payé"}
      </SubmitButton>
    </ActionForm>
  );
}
