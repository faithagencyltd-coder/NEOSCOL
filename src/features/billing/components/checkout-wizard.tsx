"use client";

import { ArrowLeft, ArrowRight, Building2, Check, CreditCard, FlaskConical, Gift, Lock, Receipt, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { changeTrialPlan, startSubscriptionCheckout } from "@/features/billing/actions";
import { IntervalToggle, PlanPrice, type Interval } from "@/features/billing/components/pricing-grid";
import { PLAN_ACCENTS } from "@/features/billing/constants";
import type { PlanWithFeatures } from "@/features/billing/queries";
import type { ActionResult } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";

const STEPS = ["Formule", "Périodicité", "Établissement", "Récapitulatif", "Paiement"] as const;

export type CheckoutOrganization = { name: string; type: string; city: string | null; country: string; email: string | null; phone: string | null; code: string };

/**
 * Tunnel de paiement de l'abonnement. Les montants affichés sont informatifs :
 * le montant facturé est recalculé en base à partir de la formule officielle.
 */
export function CheckoutWizard({
  plans,
  organization,
  initialPlan,
  initialInterval,
  trial,
  payment,
}: {
  plans: PlanWithFeatures[];
  organization: CheckoutOrganization;
  initialPlan: string;
  initialInterval: Interval;
  trial: { active: boolean; endLabel: string | null };
  payment: { enabled: boolean; label: string; test: boolean; reason?: string };
}) {
  const [step, setStep] = useState(0);
  const [planCode, setPlanCode] = useState(plans.some((p) => p.code === initialPlan) ? initialPlan : (plans[0]?.code ?? ""));
  const [interval, setBillingInterval] = useState<Interval>(initialInterval);
  const [payState, payAction, paying] = useActionState(startSubscriptionCheckout, null);
  const [trialState, trialAction, savingTrial] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await changeTrialPlan(prev, formData);
    notifyResult(result);
    return result;
  }, null);
  const plan = plans.find((p) => p.code === planCode) ?? plans[0]!;
  const yearly = interval === "YEARLY";
  const list = yearly ? plan.annual_list_price : plan.monthly_price;
  const total = yearly ? plan.annual_price : plan.monthly_price;
  const discount = list - total;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-5">
        <ol className="flex flex-wrap gap-2" aria-label="Étapes du paiement">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-300",
                  i === step ? "border-primary bg-primary text-primary-foreground shadow-sm" : i < step ? "border-success/40 bg-success-soft text-success" : "border-border text-muted-foreground",
                )}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-[11px]">{i < step ? <Check className="size-3" aria-hidden /> : i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <Card key={step} className="anim-fade-up grid gap-5 p-5 sm:p-6">
          {step === 0 ? (
            <>
              <h2 className="text-lg font-semibold">1. Choisissez votre formule</h2>
              <div role="radiogroup" aria-label="Formule" className="grid gap-3 sm:grid-cols-2">
                {plans.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    role="radio"
                    aria-checked={p.code === planCode}
                    onClick={() => setPlanCode(p.code)}
                    className={cn(
                      "hover-lift grid gap-2 overflow-hidden rounded-2xl border bg-surface p-4 text-left",
                      p.code === planCode ? "border-primary ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <span className={cn("h-1 w-12 rounded-full bg-gradient-to-r", PLAN_ACCENTS[p.code])} aria-hidden />
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold">{p.name}</span>
                      {p.code === planCode ? <Check className="anim-pop size-5 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.audience}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(p.monthly_price, p.currency)}/mois</span>
                  </button>
                ))}
              </div>
            </>
          ) : step === 1 ? (
            <>
              <h2 className="text-lg font-semibold">2. Périodicité de facturation</h2>
              <IntervalToggle value={interval} onChange={setBillingInterval} discount={Number(plan.annual_discount_percent)} />
              <div className="rounded-2xl border border-border p-4">
                <PlanPrice plan={plan} interval={interval} />
                {yearly ? <p className="mt-2 text-sm font-semibold text-success">Économisez {Number(plan.annual_discount_percent)} %</p> : null}
              </div>
            </>
          ) : step === 2 ? (
            <>
              <h2 className="text-lg font-semibold">3. Informations de l&apos;établissement</h2>
              <dl className="grid gap-2 rounded-2xl bg-surface-muted/60 p-4 text-sm">
                {[
                  ["Établissement", organization.name],
                  ["Code", organization.code],
                  ["Ville", [organization.city, organization.country].filter(Boolean).join(", ")],
                  ["E-mail", organization.email],
                  ["Téléphone", organization.phone],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Ces informations figurent sur vos factures NéoScol.{" "}
                <Link href="/parametres/etablissement" className="font-semibold text-primary hover:underline">
                  Les modifier
                </Link>
              </p>
            </>
          ) : step === 3 ? (
            <>
              <h2 className="text-lg font-semibold">4. Récapitulatif financier</h2>
              <dl className="grid gap-2 text-sm">
                {[
                  ["Établissement", organization.name],
                  ["Formule", plan.name],
                  ["Périodicité", yearly ? "Annuel (12 mois)" : "Mensuel (1 mois)"],
                  ["Prix", formatMoney(list, plan.currency)],
                  ["Réduction annuelle", yearly ? `- ${formatMoney(discount, plan.currency)} (${Number(plan.annual_discount_percent)} %)` : "—"],
                  ["Devise", `${plan.currency} (F CFA)`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-border/70 pb-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={cn("text-right font-medium", label === "Réduction annuelle" && yearly && "text-success")}>{value}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 pt-1">
                  <dt className="font-semibold">Total</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">{formatMoney(total, plan.currency)}</dd>
                </div>
              </dl>
              {trial.active ? (
                <p className="rounded-xl bg-primary-soft/70 p-3 text-xs text-primary">
                  <Gift className="mr-1 inline size-3.5" aria-hidden />
                  Vous êtes en essai gratuit{trial.endLabel ? ` jusqu'au ${trial.endLabel}` : ""} : la période payée commencera à la fin de l&apos;essai.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">5. Paiement</h2>
              {payment.test ? (
                <Alert tone="warning" title="Mode test">
                  <span className="inline-flex items-center gap-1.5">
                    <FlaskConical className="size-4" aria-hidden /> {payment.label} : aucun argent réel n&apos;est débité.
                  </span>
                </Alert>
              ) : null}
              {!payment.enabled ? <Alert tone="warning">{payment.reason}</Alert> : null}
              {payState && !payState.ok ? (
                <div className="anim-shake">
                  <Alert tone="danger">{payState.message}</Alert>
                </div>
              ) : null}
              <ul className="grid gap-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden /> Vous êtes redirigé vers la page sécurisée du prestataire (mobile money ou carte).
                </li>
                <li className="flex gap-2">
                  <Lock className="size-4 shrink-0 text-success" aria-hidden /> L&apos;abonnement est activé uniquement après confirmation du paiement par nos serveurs.
                </li>
                <li className="flex gap-2">
                  <Receipt className="size-4 shrink-0 text-success" aria-hidden /> Une facture NéoScol numérotée est créée et reste disponible en PDF.
                </li>
              </ul>
              <ActionForm dispatch={payAction} pending={paying} className="grid gap-3">
                <input type="hidden" name="plan" value={plan.code} />
                <input type="hidden" name="interval" value={interval} />
                <SubmitButton size="lg" className="w-full uppercase tracking-wide" pendingLabel="Redirection vers le paiement…" disabled={!payment.enabled}>
                  <CreditCard aria-hidden /> Payer mon abonnement — {formatMoney(total, plan.currency)}
                </SubmitButton>
              </ActionForm>
              {trial.active ? (
                <ActionForm dispatch={trialAction} pending={savingTrial} className="grid">
                  <input type="hidden" name="plan" value={plan.code} />
                  <input type="hidden" name="interval" value={interval} />
                  <SubmitButton variant="secondary" pendingLabel="Enregistrement…">
                    <Gift aria-hidden /> Continuer mon essai gratuit avec cette formule
                  </SubmitButton>
                  {trialState?.ok ? <p className="mt-2 text-center text-xs text-success">{trialState.message}</p> : null}
                </ActionForm>
              ) : null}
            </>
          )}

          <div className="flex justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft aria-hidden /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                Continuer <ArrowRight aria-hidden />
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="grid gap-3 overflow-hidden p-0">
          <div className={cn("h-1.5 bg-gradient-to-r", PLAN_ACCENTS[plan.code])} aria-hidden />
          <div className="grid gap-3 p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden /> {organization.name}
            </p>
            <p className="text-lg font-bold">{plan.name}</p>
            <PlanPrice plan={plan} interval={interval} size="md" />
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total {yearly ? "annuel" : "mensuel"}</span>
              <span className="font-display text-xl font-bold tabular-nums">{formatMoney(total, plan.currency)}</span>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}
