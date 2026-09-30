"use client";

import { ShoppingCart } from "lucide-react";
import { useActionState, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils/format";

import { startSmsCreditCheckout } from "../actions";

/** Achat de crédit : le total (SMS × prix d'un SMS) s'affiche avant le paiement ; le montant réel est recalculé en base. */
export function BuyCreditForm({ unitPrice, currency, minPurchase, suggested }: { unitPrice: number; currency: string; minPurchase: number; suggested?: number }) {
  const [state, action, pending] = useActionState(startSmsCreditCheckout, null);
  const [count, setCount] = useState(String(Math.max(minPurchase, suggested ?? minPurchase)));
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return (
    <ActionForm dispatch={action} pending={pending} className="grid gap-4" noValidate>
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="sms-count">Nombre de SMS</Label>
          <Input id="sms-count" name="sms" type="number" min={minPurchase} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
          <p className="text-xs text-muted-foreground">Minimum {minPurchase} SMS.</p>
        </div>
        <div className="rounded-2xl bg-primary-soft/50 p-4" data-testid="sms-purchase-total">
          <p className="text-sm text-muted-foreground">
            {n} SMS × {formatMoney(unitPrice, currency)}
          </p>
          <p className="font-display text-2xl font-bold tabular-nums">{formatMoney(n * unitPrice, currency)}</p>
        </div>
      </div>
      <SubmitButton pendingLabel="Ouverture du paiement…" disabled={n < minPurchase}>
        <ShoppingCart aria-hidden /> Payer et ajouter {n} SMS
      </SubmitButton>
    </ActionForm>
  );
}
