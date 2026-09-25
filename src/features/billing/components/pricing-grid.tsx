"use client";

import { ArrowRight, Check, Gift, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FEATURE_LABELS, PLAN_ACCENTS } from "@/features/billing/constants";
import type { PlanWithFeatures } from "@/features/billing/queries";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type Interval = "MONTHLY" | "YEARLY";

/** Sélecteur [ Mensuel ] [ Annuel -30 % ]. */
export function IntervalToggle({ value, onChange, discount = 30 }: { value: Interval; onChange: (value: Interval) => void; discount?: number }) {
  return (
    <div role="radiogroup" aria-label="Périodicité de facturation" className="inline-flex rounded-2xl border border-border bg-surface p-1 shadow-sm">
      {(["MONTHLY", "YEARLY"] as const).map((interval) => {
        const selected = value === interval;
        return (
          <button
            key={interval}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(interval)}
            className={cn(
              "relative flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-300 ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              selected ? "bg-gradient-to-br from-[#1d63ed] to-[#0ea5e9] text-white shadow-[0_8px_20px_-10px_rgba(29,99,237,0.9)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {interval === "MONTHLY" ? "Mensuel" : "Annuel"}
            {interval === "YEARLY" ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", selected ? "bg-white/20 text-white" : "bg-success-soft text-success")}>-{discount} %</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Prix affiché d'une formule, avec prix annuel théorique barré et économie (montants officiels). */
export function PlanPrice({ plan, interval, size = "lg" }: { plan: PlanWithFeatures; interval: Interval; size?: "lg" | "md" }) {
  const annual = interval === "YEARLY";
  return (
    <div key={interval} className="anim-fade-up grid gap-1">
      {annual ? (
        <span className="text-sm text-muted-foreground">
          <s aria-label={`Prix sans réduction : ${formatMoney(plan.annual_list_price, plan.currency)} par an`}>{formatMoney(plan.annual_list_price, plan.currency)}/an</s>
        </span>
      ) : null}
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span className={cn("font-display font-bold tabular-nums tracking-tight text-[#0b1f4d] dark:text-white", size === "lg" ? "text-[1.6rem] leading-tight" : "text-2xl")}>
          {formatMoney(annual ? plan.annual_price : plan.monthly_price, plan.currency)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{annual ? "/an" : "/mois"}</span>
      </span>
      {annual ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
          <Sparkles className="size-3.5" aria-hidden /> Économisez {formatMoney(plan.annual_savings, plan.currency)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">ou {formatMoney(plan.annual_price, plan.currency)}/an en annuel</span>
      )}
    </div>
  );
}

/**
 * Grille des 5 formules officielles. `mode` : « public » (page Tarifs → inscription)
 * ou « app » (établissement connecté → paiement).
 */
export function PricingGrid({
  plans,
  mode,
  initialInterval = "MONTHLY",
  currentPlanCode,
}: {
  plans: PlanWithFeatures[];
  mode: "public" | "app";
  initialInterval?: Interval;
  currentPlanCode?: string | null;
}) {
  const [interval, setBillingInterval] = useState<Interval>(initialInterval);
  const discount = plans[0]?.annual_discount_percent ?? 30;
  return (
    <div className="grid gap-8">
      <div className="flex flex-col items-center gap-3">
        <IntervalToggle value={interval} onChange={setBillingInterval} discount={Number(discount)} />
        <p aria-live="polite" className={cn("text-sm font-semibold transition-colors", interval === "YEARLY" ? "text-success" : "text-muted-foreground")}>
          {interval === "YEARLY" ? `Économisez ${discount} % avec le paiement annuel` : "Sans engagement, résiliable à tout moment"}
        </p>
      </div>
      <ul className={cn("stagger grid gap-4 sm:grid-cols-2", mode === "public" ? "xl:grid-cols-5" : "lg:grid-cols-3 2xl:grid-cols-5")}>
        {plans.map((plan) => {
          const enterprise = plan.code === "ENTERPRISE";
          const current = currentPlanCode === plan.code;
          const href =
            mode === "public"
              ? `/inscription?formule=${plan.code}&periodicite=${interval}`
              : `/abonnement/souscrire?formule=${plan.code}&periodicite=${interval}`;
          const features = plan.features.filter((f) => f.enabled).sort((a, b) => Object.keys(FEATURE_LABELS).indexOf(a.feature_code) - Object.keys(FEATURE_LABELS).indexOf(b.feature_code));
          return (
            <li
              key={plan.code}
              className={cn(
                "hover-lift relative flex flex-col overflow-hidden rounded-3xl border bg-surface shadow-sm",
                enterprise ? "border-[#1d63ed]/50 ring-1 ring-[#1d63ed]/30" : "border-border",
                current && "ring-2 ring-success/60",
              )}
            >
              <div className={cn("h-1.5 bg-gradient-to-r", PLAN_ACCENTS[plan.code] ?? "from-primary to-cyan-400")} aria-hidden />
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold uppercase tracking-wide text-[#0b1f4d] dark:text-white">{plan.name}</h3>
                    {current ? <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">Formule actuelle</span> : null}
                    {enterprise ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">Multi-établissements</span> : null}
                  </div>
                  <p className="min-h-10 text-xs text-muted-foreground">{plan.audience ?? plan.description}</p>
                </div>
                <PlanPrice plan={plan} interval={interval} />
                <p className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-primary-soft/70 px-2.5 py-1 text-xs font-semibold text-primary">
                  <Gift className="size-3.5" aria-hidden /> Essai gratuit {plan.trial_days} jours
                </p>
                <ul className="grid gap-1.5 text-xs">
                  {features.map((f) => (
                    <li key={f.feature_code} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      <span>{FEATURE_LABELS[f.feature_code] ?? f.feature_code}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={href}
                  className={cn(
                    "group mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    enterprise
                      ? "bg-gradient-to-r from-[#0b2559] to-[#1d63ed] text-white shadow-md hover:shadow-lg"
                      : "bg-primary text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  {mode === "public" ? "Commencer mon essai gratuit" : current ? "Renouveler / payer" : "Choisir cette formule"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
