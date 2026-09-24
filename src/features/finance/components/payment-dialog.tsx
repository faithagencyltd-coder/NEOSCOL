"use client";

import { Banknote, Printer } from "lucide-react";
import { useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { recordPayment } from "@/features/finance/actions";
import { PAYMENT_METHOD } from "@/lib/labels";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";

/** Encaissement à l'administration : le reçu PDF est proposé immédiatement. */
export function PaymentDialog({ invoiceId, balance, currency }: { invoiceId: string; balance: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useFeedbackAction(recordPayment);
  const done = state?.ok ? state.data : undefined;
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Banknote aria-hidden /> Enregistrer un paiement
        </Button>
      </DialogTrigger>
      <DialogContent title="Enregistrer un paiement" description={`Reste dû : ${new Intl.NumberFormat("fr-FR").format(balance)} ${currency === "XOF" ? "FCFA" : currency}`}>
        {done ? (
          <div className="grid gap-3">
            <Alert tone="success">{state?.message}</Alert>
            <Button asChild>
              <a href={`/api/documents/recus/${done.paymentId}`} target="_blank" rel="noopener">
                <Printer aria-hidden /> Imprimer le reçu
              </a>
            </Button>
            <DialogClose asChild>
              <Button variant="secondary">Fermer</Button>
            </DialogClose>
          </div>
        ) : (
          <ActionForm dispatch={formAction} pending={pending} className="grid gap-4">
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="p-amount" label="Montant *" errors={errors.amount}>
                <Input id="p-amount" name="amount" type="number" min={1} step="1" max={balance} defaultValue={balance > 0 ? String(balance) : ""} required />
              </FormField>
              <FormField id="p-method" label="Mode de paiement *">
                <Select id="p-method" name="method" defaultValue="cash">
                  {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="p-ref" label="Référence (transaction, chèque…)">
                <Input id="p-ref" name="reference" maxLength={80} />
              </FormField>
              <FormField id="p-payer" label="Versé par">
                <Input id="p-payer" name="payer_name" maxLength={120} />
              </FormField>
            </div>
            {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
              </DialogClose>
              <SubmitButton>Valider le paiement</SubmitButton>
            </div>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
