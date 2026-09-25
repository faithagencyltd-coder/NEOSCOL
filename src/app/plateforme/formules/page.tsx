import { Check, Layers, X } from "lucide-react";
import type { Metadata } from "next";

import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEATURE_LABELS, PLAN_ACCENTS } from "@/features/billing/constants";
import { listPlans } from "@/features/billing/queries";
import { updatePlan } from "@/features/platform/billing-actions";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Formules — Plateforme" };

/**
 * Formules officielles : activation, description, fonctionnalités. Les prix
 * officiels sont figés ; les abonnements conservent le prix de leur souscription.
 */
export default async function PlatformPlansPage() {
  const supabase = await createClient();
  const [plans, { data: subs }] = await Promise.all([listPlans(), supabase.from("subscriptions").select("plan_id, status, is_demo")]);
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
              <QuickFormDialog
                title={`Modifier la formule ${plan.name}`}
                description="Les prix officiels ne sont pas modifiables ici ; une évolution de prix ne serait jamais rétroactive."
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
