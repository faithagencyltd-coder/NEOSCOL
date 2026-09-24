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
import { AnimatedSuccess } from "@/components/motion/animated-feedback";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { cn } from "@/lib/utils/cn";

/** Encaissement à l'administration : le reçu PDF est proposé immédiatement. */
export function PaymentDialog({ invoiceId, balance, currency }: { invoiceId: string; balance: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useFeedbackAction(recordPayment);
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const money = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: currency === "XOF" || currency === "XAF" ? 0 : 2 }).format(n);
  const typed = Math.max(0, Number(amount) || 0);
  const after = Math.max(0, balance - typed);
  const tooMuch = typed > balance;
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
            <div className="grid justify-items-center gap-2 py-2 text-center">
              <AnimatedSuccess className="size-16" label="Paiement enregistré" />
              {done.balanceAfter === 0 ? (
                <span className="status-change rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">Payé · facture soldée</span>
              ) : (
                <span className="anim-fade text-sm text-muted-foreground">Reste dû : {money(done.balanceAfter)}</span>
              )}
            </div>
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
                <Input id="p-amount" name="amount" type="number" min={1} step="1" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
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
            {balance > 0 ? (
              <div className="grid gap-1.5 rounded-xl bg-surface-muted p-3 text-sm" aria-live="polite">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reste après ce paiement</span>
                  <strong key={after} className={cn("anim-fade tabular-nums", tooMuch ? "text-danger" : after === 0 ? "text-success" : "")}>
                    {tooMuch ? "Montant supérieur au reste dû" : after === 0 ? "0 — facture soldée" : money(after)}
                  </strong>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300 ease-out", tooMuch ? "bg-danger" : "bg-success")}
                    style={{ width: `${Math.min(100, (typed / balance) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
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
