"use client";

import { CreditCard, Landmark, Lock, Smartphone, Wallet } from "lucide-react";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { startFeePayment } from "@/features/fee-payments/actions";
import { methodLabel } from "@/lib/payments/school-adapters";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatMoney } from "@/lib/utils/format";

export type PayInstallment = { id: string; label: string; due_on: string; remaining: number };
export type PayProvider = { id: string; label: string; methods: string[]; mode: string; is_default: boolean };

const METHOD_ICON = { mobile_money: Smartphone, card: CreditCard, bank_transfer: Landmark, other: Wallet } as const;

/**
 * Choix de ce que la famille paie (échéance, solde ou montant autorisé) et du
 * moyen de paiement (fournisseurs actifs uniquement). Le montant affiché n'est
 * qu'indicatif : il est recalculé en base à partir de la facture.
 */
export function PayForm({
  invoiceId,
  currency,
  balance,
  installments,
  providers,
  allowPartial,
  minPartial,
}: {
  invoiceId: string;
  currency: string;
  balance: number;
  installments: PayInstallment[];
  providers: PayProvider[];
  allowPartial: boolean;
  minPartial: number;
}) {
  const [choice, setChoice] = useState<"echeance" | "solde" | "montant">(installments.length ? "echeance" : "solde");
  const [installment, setInstallment] = useState(installments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const options = providers.flatMap((p) => p.methods.map((m) => ({ key: `${p.id}:${m}`, provider: p, method: m })));
  const [selected, setSelected] = useState(options.find((o) => o.provider.is_default)?.key ?? options[0]?.key ?? "");
  const pick = options.find((o) => o.key === selected);
  const [state, dispatch, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await startFeePayment(prev, formData);
    notifyResult(result);
    return result;
  }, null);

  const due = choice === "echeance" ? (installments.find((i) => i.id === installment)?.remaining ?? 0) : choice === "solde" ? balance : Number(amount.replace(/\s/g, "").replace(",", ".")) || 0;

  return (
    <ActionForm dispatch={dispatch} pending={pending} className="grid gap-5" data-testid="pay-form">
      <input type="hidden" name="invoice" value={invoiceId} />
      <input type="hidden" name="choice" value={choice} />
      <input type="hidden" name="installment" value={choice === "echeance" ? installment : ""} />
      <input type="hidden" name="provider" value={pick?.provider.id ?? ""} />
      <input type="hidden" name="method" value={pick?.method ?? ""} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">1. Que souhaitez-vous payer ?</legend>
        {installments.map((i) => (
          <label key={i.id} className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm", choice === "echeance" && installment === i.id ? "border-primary bg-primary-soft/40" : "border-border")}>
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="what"
                checked={choice === "echeance" && installment === i.id}
                onChange={() => {
                  setChoice("echeance");
                  setInstallment(i.id);
                }}
                className="accent-[var(--primary)]"
              />
              <span className="grid">
                <span className="font-semibold">{i.label}</span>
                <span className="text-xs text-muted-foreground">Échéance du {formatDate(i.due_on)}</span>
              </span>
            </span>
            <span className="font-semibold tabular-nums">{formatMoney(i.remaining, currency)}</span>
          </label>
        ))}
        <label className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm", choice === "solde" ? "border-primary bg-primary-soft/40" : "border-border")}>
          <span className="flex items-center gap-3">
            <input type="radio" name="what" checked={choice === "solde"} onChange={() => setChoice("solde")} className="accent-[var(--primary)]" />
            <span className="font-semibold">Tout le reste à payer</span>
          </span>
          <span className="font-semibold tabular-nums">{formatMoney(balance, currency)}</span>
        </label>
        {allowPartial ? (
          <label className={cn("grid cursor-pointer gap-2 rounded-xl border p-3 text-sm", choice === "montant" ? "border-primary bg-primary-soft/40" : "border-border")}>
            <span className="flex items-center gap-3">
              <input type="radio" name="what" checked={choice === "montant"} onChange={() => setChoice("montant")} className="accent-[var(--primary)]" />
              <span className="font-semibold">Un autre montant (acompte)</span>
            </span>
            {choice === "montant" ? (
              <Input
                name="amount"
                inputMode="numeric"
                aria-label="Montant à payer"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={minPartial > 0 ? `Minimum ${formatMoney(minPartial, currency)}` : "Montant"}
                autoFocus
              />
            ) : null}
          </label>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">2. Moyen de paiement</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const Icon = METHOD_ICON[o.method as keyof typeof METHOD_ICON] ?? Wallet;
            return (
              <label key={o.key} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors", selected === o.key ? "border-primary bg-primary-soft/40" : "border-border hover:border-primary/40")}>
                <input type="radio" name="option" checked={selected === o.key} onChange={() => setSelected(o.key)} className="accent-[var(--primary)]" />
                <Icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="grid min-w-0">
                  <span className="font-semibold">{methodLabel(o.method)}</span>
                  <span className="truncate text-xs text-muted-foreground">{o.provider.label}</span>
                </span>
                {o.provider.mode === "test" ? (
                  <Badge tone="warning" className="ml-auto">
                    TEST
                  </Badge>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {pick?.provider.mode === "test" ? <Alert tone="warning">Mode test : aucun argent réel ne sera prélevé.</Alert> : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton size="lg" pendingLabel="Ouverture du paiement…" disabled={!pick || due <= 0} data-testid="pay-submit">
        <Lock aria-hidden /> Payer {due > 0 ? formatMoney(due, currency) : ""}
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">Vous allez être dirigé vers la page sécurisée du fournisseur. Le paiement n&apos;est validé qu&apos;après confirmation du fournisseur.</p>
    </ActionForm>
  );
}
