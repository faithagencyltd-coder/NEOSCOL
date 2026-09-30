import { BadgeDollarSign, Check, Copy, Gift, History, Layers, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APPLIED_FEATURES, FEATURE_LABELS, MULTI_MODULES_PLAN, PLAN_ACCENTS, PLAN_ORG_TYPES } from "@/features/billing/constants";
import { listPlans } from "@/features/billing/queries";
import { createPlan, deletePlan, duplicatePlan, savePlan, setPlanActive, updatePlanPrices } from "@/features/platform/billing-actions";
import { PlanEditor } from "@/features/platform/components/plan-editor";
import { updatePlanTrial } from "@/features/platform/offer-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Formules — Plateforme" };

const TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(PLAN_ORG_TYPES.flatMap((g) => g.types.map((t) => [t.value, t.label]))),
  school_group: "Établissement principal (Module 4)",
};

/**
 * Formules : le Super Admin crée, modifie (textes, avantages, établissements
 * concernés, options), duplique, retire ou supprime une formule, et change son
 * prix (historique). Jamais rétroactif : les abonnements gardent leur prix.
 */
export default async function PlatformPlansPage() {
  const supabase = await createClient();
  const [plans, { data: subs }, { data: history }] = await Promise.all([
    listPlans(),
    supabase.from("subscriptions").select("plan_id, status, is_demo"),
    supabase.from("subscription_plan_price_history").select("id, plan_id, old_monthly_price, monthly_price, annual_price, reason, changed_at").order("changed_at", { ascending: false }).limit(100),
  ]);
  const count = (planId: string) => (subs ?? []).filter((s) => s.plan_id === planId && !s.is_demo);
  const used = (planId: string) => (subs ?? []).some((s) => s.plan_id === planId);
  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Formules</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Créez et réglez les formules proposées à chaque type d&apos;établissement : nom, textes, avantages, options incluses, prix et essai gratuit. Un changement
            ne touche jamais les abonnements en cours.
          </p>
        </div>
        <PlanEditor
          action={createPlan}
          trigger={
            <Button>
              <Plus aria-hidden /> Nouvelle formule
            </Button>
          }
        />
      </div>
      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="platform-plans">
        {plans.map((plan) => {
          const linked = count(plan.id);
          const enabled = new Set(plan.features.filter((f) => f.enabled).map((f) => f.feature_code));
          const codes = Object.keys(FEATURE_LABELS).filter((c) => plan.code === MULTI_MODULES_PLAN || c !== "multi_establishment");
          return (
            <Card key={plan.id} data-plan={plan.code} className={cn("grid content-start gap-4 overflow-hidden p-0", !plan.is_active && "opacity-80")}>
              <div className={cn("h-1.5 bg-gradient-to-r", PLAN_ACCENTS[plan.code] ?? "from-slate-500 to-slate-400")} aria-hidden />
              <div className="grid gap-3 px-5 pb-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid">
                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <span className="font-mono text-xs text-muted-foreground">{plan.code}</span>
                  </div>
                  {plan.is_active ? <Badge tone="success">Proposée</Badge> : <Badge>Retirée</Badge>}
                </div>
                {plan.audience ? <p className="text-sm font-medium">{plan.audience}</p> : null}
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <div className="flex flex-wrap gap-1.5" aria-label="Établissements concernés">
                  {plan.org_types.length ? (
                    plan.org_types.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {TYPE_LABELS[t] ?? t}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-warning">Aucun type d&apos;établissement : formule non proposée.</span>
                  )}
                </div>
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
                {plan.highlights.length ? (
                  <ul className="grid gap-1 text-sm">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {linked.length} abonnement(s) lié(s) · {linked.filter((s) => s.status === "ACTIVE").length} actif(s) · {linked.filter((s) => s.status === "TRIALING").length} essai(s) · essai {plan.trial_days} j
                </p>
                <details className="rounded-xl border border-border p-2 text-xs">
                  <summary className="cursor-pointer font-semibold">Options incluses ({codes.filter((c) => enabled.has(c)).length}/{codes.length})</summary>
                  <ul className="mt-1.5 grid gap-1">
                    {codes.map((code) => (
                      <li key={code} className={cn("flex items-center gap-2", !enabled.has(code) && "text-muted-foreground line-through")}>
                        {enabled.has(code) ? <Check className="size-3.5 text-success" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                        {FEATURE_LABELS[code]}
                        {APPLIED_FEATURES.has(code) ? <span className="text-[11px] text-primary no-underline">(appliquée)</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
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
                <div className="flex flex-wrap gap-2">
                  <PlanEditor
                    plan={plan}
                    action={savePlan}
                    trigger={
                      <Button size="sm">
                        <Layers aria-hidden /> Modifier
                      </Button>
                    }
                  />
                  <QuickFormDialog
                    title={`Prix de la formule ${plan.name}`}
                    description="Le nouveau prix s'applique aux nouvelles souscriptions, aux essais qui passent au paiement et aux changements de formule. Les abonnés actuels gardent leur prix (jamais rétroactif). Le prix annuel = 12 mois moins la remise, arrondi à la centaine."
                    trigger={
                      <Button size="sm" variant="secondary">
                        <BadgeDollarSign aria-hidden /> Prix
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
                    title={`Essai gratuit — ${plan.name}`}
                    description="Durée de l'essai gratuit proposé aux nouveaux établissements (0 = pas d'essai). Les essais en cours ne changent pas."
                    trigger={
                      <Button size="sm" variant="secondary">
                        <Gift aria-hidden /> Essai : {plan.trial_days} j
                      </Button>
                    }
                    submitLabel="Enregistrer la durée"
                    action={updatePlanTrial}
                    hidden={{ plan_id: plan.id }}
                    fields={[{ name: "trial_days", label: "Durée de l'essai (jours)", type: "number", required: true, min: 0, max: 90, defaultValue: String(plan.trial_days) }]}
                  />
                  {plan.code !== MULTI_MODULES_PLAN ? (
                    <QuickFormDialog
                      title={`Dupliquer ${plan.name}`}
                      description="La copie reprend textes, prix, essai, établissements et options. Elle est créée retirée : relisez-la puis proposez-la."
                      trigger={
                        <Button size="sm" variant="ghost">
                          <Copy aria-hidden /> Dupliquer
                        </Button>
                      }
                      submitLabel="Créer la copie"
                      action={duplicatePlan}
                      hidden={{ plan_id: plan.id }}
                      fields={[
                        { name: "code", label: "Code de la copie", required: true, placeholder: `${plan.code}_PLUS` },
                        { name: "name", label: "Nom de la copie", required: true, defaultValue: `${plan.name} (copie)` },
                      ]}
                    />
                  ) : null}
                  {plan.is_active ? (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost">
                          <Undo2 aria-hidden /> Retirer
                        </Button>
                      }
                      title={`Retirer la formule ${plan.name} ?`}
                      description="Elle n'est plus proposée (inscription, Mon abonnement, Tarifs). Les établissements abonnés la gardent, avec leur prix."
                      confirmLabel="Retirer"
                      action={setPlanActive}
                      fields={{ plan_id: plan.id, active: "false" }}
                    />
                  ) : (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost">
                          <RotateCcw aria-hidden /> Réactiver
                        </Button>
                      }
                      title={`Proposer de nouveau ${plan.name} ?`}
                      confirmLabel="Réactiver"
                      action={setPlanActive}
                      fields={{ plan_id: plan.id, active: "true" }}
                    />
                  )}
                  {!used(plan.id) && plan.code !== MULTI_MODULES_PLAN ? (
                    <ConfirmAction
                      trigger={
                        <Button size="sm" variant="ghost" className="text-danger">
                          <Trash2 aria-hidden /> Supprimer
                        </Button>
                      }
                      title={`Supprimer définitivement ${plan.name} ?`}
                      description="Possible seulement pour une formule qui n'a jamais servi (aucun abonnement, facture, tarif négocié ni code promo)."
                      confirmLabel="Supprimer"
                      tone="danger"
                      action={deletePlan}
                      fields={{ plan_id: plan.id }}
                    />
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
