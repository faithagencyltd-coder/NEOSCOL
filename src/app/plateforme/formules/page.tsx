import { BadgeDollarSign, Check, History, Layers, X } from "lucide-react";
import type { Metadata } from "next";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEATURE_LABELS, PLAN_ACCENTS } from "@/features/billing/constants";
import { listPlans } from "@/features/billing/queries";
import { updatePlan, updatePlanPrices } from "@/features/platform/billing-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Formules — Plateforme" };

/**
 * Formules officielles : activation, description, fonctionnalités et PRIX
 * (modifiables par le Super Admin, avec historique). Jamais rétroactif : les
 * abonnements conservent le prix de leur souscription.
 */
export default async function PlatformPlansPage() {
  const supabase = await createClient();
  const [plans, { data: subs }, { data: history }] = await Promise.all([
    listPlans(),
    supabase.from("subscriptions").select("plan_id, status, is_demo"),
    supabase.from("subscription_plan_price_history").select("id, plan_id, old_monthly_price, monthly_price, annual_price, reason, changed_at").order("changed_at", { ascending: false }).limit(100),
  ]);
  const count = (planId: string) => (subs ?? []).filter((s) => s.plan_id === planId && !s.is_demo);
  const codes = Object.keys(FEATURE_LABELS);
  return (
    <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const linked = count(plan.id);
        const enabled = new Set(plan.features.filter((f) => f.enabled).map((f) => f.feature_code));
        return (
          <Card key={plan.id} className={cn("grid content-start gap-4 overflow-hidden p-0", !plan.is_active && "opacity-70")}>
            <div className={cn("h-1.5 bg-gradient-to-r", PLAN_ACCENTS[plan.code])} aria-hidden />
            <div className="grid gap-3 px-5 pb-5">
              <div className="flex items-start justify-between gap-2">
                <div className="grid">
                  <h2 className="text-lg font-bold">{plan.name}</h2>
                  <span className="font-mono text-xs text-muted-foreground">{plan.code}</span>
                </div>
                {plan.is_active ? <Badge tone="success">Active</Badge> : <Badge>Désactivée</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-surface-muted/60 p-2">
                  <dt className="text-xs text-muted-foreground">Mensuel</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(plan.monthly_price, plan.currency)}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted/60 p-2">
                  <dt className="text-xs text-muted-foreground">Annuel (-{Number(plan.annual_discount_percent)} %)</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(plan.annual_price, plan.currency)}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted/60 p-2">
                  <dt className="text-xs text-muted-foreground">Annuel théorique</dt>
                  <dd className="tabular-nums line-through">{formatMoney(plan.annual_list_price, plan.currency)}</dd>
                </div>
                <div className="rounded-xl bg-success-soft p-2 text-success">
                  <dt className="text-xs">Économie</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(plan.annual_savings, plan.currency)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                {linked.length} abonnement(s) lié(s) · {linked.filter((s) => s.status === "ACTIVE").length} actif(s) · {linked.filter((s) => s.status === "TRIALING").length} essai(s) · essai {plan.trial_days} j
              </p>
              <ul className="grid gap-1 text-xs">
                {codes.map((code) => (
                  <li key={code} className={cn("flex items-center gap-2", !enabled.has(code) && "text-muted-foreground line-through")}>
                    {enabled.has(code) ? <Check className="size-3.5 text-success" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                    {FEATURE_LABELS[code]}
                  </li>
                ))}
              </ul>
              {(history ?? []).some((h) => h.plan_id === plan.id) ? (
                <details className="rounded-xl border border-border p-2 text-xs">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
                    <History className="size-3.5" aria-hidden /> Historique des prix
                  </summary>
                  <ul className="mt-1.5 grid gap-1 text-muted-foreground">
                    {(history ?? [])
                      .filter((h) => h.plan_id === plan.id)
                      .slice(0, 5)
                      .map((h) => (
                        <li key={h.id}>
                          {formatDateTime(h.changed_at)} : {formatMoney(h.old_monthly_price, plan.currency)} → {formatMoney(h.monthly_price, plan.currency)} / mois — {h.reason}
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
              <QuickFormDialog
                title={`Prix de la formule ${plan.name}`}
                description="Le nouveau prix s'applique aux nouvelles souscriptions, aux essais qui passent au paiement et aux changements de formule. Les abonnés actuels gardent leur prix (jamais rétroactif). Le prix annuel = 12 mois moins la remise, arrondi à la centaine."
                trigger={
                  <Button size="sm">
                    <BadgeDollarSign aria-hidden /> Modifier le prix
                  </Button>
                }
                submitLabel="Enregistrer le nouveau prix"
                action={updatePlanPrices}
                hidden={{ plan_id: plan.id }}
                fields={[
                  { name: "monthly_price", label: `Prix mensuel (${plan.currency})`, type: "number", required: true, min: 100, defaultValue: String(plan.monthly_price) },
                  { name: "annual_discount_percent", label: "Remise annuelle (%)", type: "number", required: true, min: 0, max: 60, step: "0.5", defaultValue: String(Number(plan.annual_discount_percent)) },
                  { name: "reason", label: "Motif du changement", type: "textarea", required: true, wide: true },
                ]}
              />
              <QuickFormDialog
                title={`Modifier la formule ${plan.name}`}
                description="Activation, description et fonctionnalités incluses. Le prix se modifie avec « Modifier le prix »."
                trigger={
                  <Button variant="secondary" size="sm">
                    <Layers aria-hidden /> Modifier
                  </Button>
                }
                action={updatePlan}
                hidden={{ plan_id: plan.id, feature_codes: codes.join(",") }}
                fields={[
                  { name: "description", label: "Description", type: "textarea", defaultValue: plan.description ?? "", wide: true },
                  { name: "audience", label: "Public", defaultValue: plan.audience ?? "", wide: true },
                  { name: "is_active", label: "Formule proposée à la souscription", type: "checkbox", defaultValue: plan.is_active ? "true" : "" },
                  ...codes.map((code) => ({ name: `feature_${code}`, label: FEATURE_LABELS[code]!, type: "checkbox" as const, defaultValue: enabled.has(code) ? "true" : "" })),
                ]}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
