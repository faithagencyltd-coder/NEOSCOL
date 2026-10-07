"use client";

import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { checkFeexPayPayment, startFeexPayRequest, type FeexPayState } from "@/features/billing/feexpay-actions";
import { FEEXPAY_COUNTRIES } from "@/lib/payments/feexpay-networks";

const POLL_MS = 5000;
const POLL_MAX = 60; // ≈ 5 minutes

/**
 * Paiement FeexPay : pays, réseau et numéro, puis validation sur le téléphone.
 * L'état affiché vient toujours de la vérification serveur auprès de FeexPay.
 */
export function FeexPayForm({ reference, returnPath }: { reference: string; returnPath: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(startFeexPayRequest, null);
  const [country, setCountry] = useState("BJ");
  const [network, setNetwork] = useState(FEEXPAY_COUNTRIES[0]!.networks[0]!.code);
  const [tracked, setTracked] = useState<{ key: unknown; state: FeexPayState["state"]; polls: number } | null>(null);
  const networks = FEEXPAY_COUNTRIES.find((c) => c.code === country)?.networks ?? [];
  const current = networks.find((n) => n.code === network);

  const requested = state?.ok ? state : null;
  // Nouvel envoi : le suivi repart de l'état renvoyé par le serveur.
  const live = useMemo(
    () => (tracked && tracked.key === requested ? tracked : requested?.data ? { key: requested, state: requested.data.state, polls: 0 } : null),
    [tracked, requested],
  );
  const waiting = live?.state === "pending" && live.polls < POLL_MAX;

  useEffect(() => {
    if (live?.state === "paid") {
      const t = window.setTimeout(() => router.push(returnPath), 1200);
      return () => window.clearTimeout(t);
    }
    if (!waiting || !live) return;
    const t = window.setTimeout(async () => {
      const next = await checkFeexPayPayment(reference);
      setTracked({ key: live.key, state: next.state === "none" ? "pending" : next.state, polls: live.polls + 1 });
    }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [live, waiting, reference, returnPath, router]);

  if (live?.state === "paid") {
    return (
      <p className="anim-pop flex items-center gap-2 rounded-xl bg-success-soft p-4 text-sm font-medium text-success" data-testid="feexpay-paid">
        <CheckCircle2 className="size-5" aria-hidden /> Paiement confirmé par FeexPay. Redirection…
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {waiting ? (
        <div className="flex items-start gap-3 rounded-xl bg-info-soft p-4 text-sm" data-testid="feexpay-waiting">
          <Loader2 className="size-5 shrink-0 [animation:spin-slow_0.9s_linear_infinite]" aria-hidden />
          <span className="grid gap-1">
            <span className="font-medium">{requested?.message}</span>
            <span className="text-muted-foreground">Cette page se met à jour toute seule dès que FeexPay confirme.</span>
          </span>
        </div>
      ) : null}
      {live?.state === "failed" ? (
        <p className="flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm text-danger" data-testid="feexpay-failed">
          <XCircle className="size-5 shrink-0" aria-hidden /> Paiement refusé ou annulé sur le téléphone (solde insuffisant, code erroné…). Aucun montant n&apos;a été retenu : vous pouvez réessayer.
        </p>
      ) : null}
      {live?.state === "pending" && !waiting ? (
        <Alert tone="warning">Toujours pas de confirmation. Si de l&apos;argent a été débité, il sera pris en compte automatiquement ; sinon, réessayez.</Alert>
      ) : null}
      {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      {!waiting ? (
        <ActionForm dispatch={action} pending={pending} className="grid gap-4" data-testid="feexpay-form">
          <input type="hidden" name="reference" value={reference} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fx-country" label="Pays">
              <Select
                id="fx-country"
                name="country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setNetwork(FEEXPAY_COUNTRIES.find((c) => c.code === e.target.value)?.networks[0]?.code ?? "");
                }}
              >
                {FEEXPAY_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="fx-network" label="Réseau Mobile Money">
              <Select id="fx-network" name="network" value={network} onChange={(e) => setNetwork(e.target.value)}>
                {networks.map((n) => (
                  <option key={n.code} value={n.code}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField id="fx-phone" label="Numéro Mobile Money" hint="Le numéro qui va payer : il recevra la demande de validation.">
            <Input id="fx-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01 97 00 00 00" required />
          </FormField>
          {current?.otp ? (
            <FormField id="fx-otp" label="Code de confirmation" hint={`${current.label} : générez d'abord un code de paiement sur votre téléphone, puis saisissez-le ici.`}>
              <Input id="fx-otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
            </FormField>
          ) : null}
          <SubmitButton size="lg" className="w-full" pendingLabel="Envoi de la demande à FeexPay…">
            <Smartphone aria-hidden /> {live?.state === "failed" ? "Réessayer le paiement" : "Payer avec FeexPay"}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
