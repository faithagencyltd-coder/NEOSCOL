"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createExpense, updateExpense } from "@/features/finance/actions";
import { PAYMENT_METHOD } from "@/lib/labels";
import { notifyResult } from "@/components/motion/animated-toast";

type Expense = {
  id: string;
  label: string;
  amount: number;
  spent_on: string;
  supplier: string | null;
  payment_method: string;
  reference: string | null;
  comment: string | null;
  category: { id: string } | null;
};

/** Saisie ou modification d'une dépense, avec justificatif PDF ou photo. */
export function ExpenseDialog({ categories, today, expense, trigger }: { categories: { id: string; name: string }[]; today: string; expense?: Expense; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createExpense>> | null, formData: FormData) => {
    const result = await (expense ? updateExpense : createExpense)(prev, formData);
    notifyResult(result);
    if (result.ok) setOpen(false);
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden /> Nouvelle dépense
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={expense ? "Modifier la dépense" : "Nouvelle dépense"} className="max-w-xl">
        <ActionForm dispatch={formAction} pending={pending} className="grid gap-4" encType="multipart/form-data">
          {expense ? <input type="hidden" name="expense_id" value={expense.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="e-label" label="Libellé *" errors={errors.label} className="sm:col-span-2">
              <Input id="e-label" name="label" required maxLength={200} defaultValue={expense?.label} />
            </FormField>
            <FormField id="e-cat" label="Catégorie *" errors={errors.category_id}>
              <Select id="e-cat" name="category_id" required defaultValue={expense?.category?.id ?? categories[0]?.id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="e-amount" label="Montant *" errors={errors.amount}>
              <Input id="e-amount" name="amount" type="number" min={1} step="1" required defaultValue={expense ? String(expense.amount) : undefined} />
            </FormField>
            <FormField id="e-date" label="Date *" errors={errors.spent_on}>
              <Input id="e-date" name="spent_on" type="date" required max={today} defaultValue={expense?.spent_on ?? today} />
            </FormField>
            <FormField id="e-method" label="Moyen de paiement">
              <Select id="e-method" name="payment_method" defaultValue={expense?.payment_method ?? "cash"}>
                {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="e-supplier" label="Fournisseur">
              <Input id="e-supplier" name="supplier" maxLength={120} defaultValue={expense?.supplier ?? undefined} />
            </FormField>
            <FormField id="e-ref" label="Référence">
              <Input id="e-ref" name="reference" maxLength={80} defaultValue={expense?.reference ?? undefined} />
            </FormField>
            <FormField id="e-comment" label="Commentaire" className="sm:col-span-2">
              <Textarea id="e-comment" name="comment" maxLength={1000} defaultValue={expense?.comment ?? undefined} />
            </FormField>
            <FormField id="e-file" label={expense ? "Remplacer le justificatif (PDF ou photo)" : "Justificatif (PDF ou photo)"} className="sm:col-span-2">
              <input
                id="e-file"
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary"
              />
            </FormField>
          </div>
          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton>{expense ? "Enregistrer" : "Ajouter la dépense"}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
