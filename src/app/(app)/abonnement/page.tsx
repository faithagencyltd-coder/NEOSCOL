import { ArrowRight, CalendarClock, CalendarRange, CreditCard, FileText, Gift, History, PartyPopper, RotateCcw, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelSubscription, resumeSubscription } from "@/features/billing/actions";
import { PricingGrid } from "@/features/billing/components/pricing-grid";
import { EVENT_LABELS, INTERVAL_LABELS, INVOICE_KIND, INVOICE_STATUS, PROVIDER_LABELS, SUBSCRIPTION_STATUS, TRANSACTION_STATUS } from "@/features/billing/constants";
import { getAccessState, getSubscription, listEvents, listInvoices, listPlans, listTransactions } from "@/features/billing/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Mon abonnement" };

function DateItem({ icon: Icon, label, value, hint }: { icon: typeof CalendarClock; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="grid">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * Abonnement NéoScol de l'établissement (SYSTÈME A) : formule, statut, échéances,
 * factures, paiements, historique. Distinct des finances de l'établissement.
 */
export default async function SubscriptionPage({ searchParams }: PageProps<"/abonnement">) {
  const context = await requirePermission("billing.read");
  const orgId = context.organization.id;
  const tz = context.organization.timezone;
  const params = await searchParams;
  const [subscription, plans, invoices, transactions, events, access] = await Promise.all([
    getSubscription(orgId),
    listPlans(),
    listInvoices(orgId),
    listTransactions(orgId),
    listEvents(orgId),
    getAccessState(orgId),
  ]);
  const manage = can(context, "billing.manage");
  if (!subscription) {
    return <EmptyState icon={CreditCard} title="Aucun abonnement" description="Contactez l'administration NéoScol." />;
  }
  const status = SUBSCRIPTION_STATUS[subscription.status] ?? SUBSCRIPTION_STATUS.ACTIVE!;
  const plan = subscription.plan;
  const trialing = subscription.status === "TRIALING";
  const interval = INTERVAL_LABELS[subscription.billing_interval]!;
  const price = subscription.billing_interval === "YEARLY" ? subscription.annual_price : subscription.monthly_price;
  const endAt = trialing ? subscription.trial_end : (subscription.current_period_end ?? subscription.trial_end);
  const daysLeft = access?.days_left ?? 0;
  const trialTotal = subscription.trial_start && subscription.trial_end ? Math.max(1, Math.round((+new Date(subscription.trial_end) - +new Date(subscription.trial_start)) / 86400000)) : 14;
  const pending = invoices.filter((i) => i.status === "PENDING");
  const payHref = `/abonnement/souscrire?formule=${plan?.code ?? ""}&periodicite=${subscription.billing_interval}`;
  const fmt = (d: string | null | undefined) => (d ? formatDate(d, "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Mon abonnement"
        description="Votre abonnement au logiciel NéoScol. Les frais de scolarité et paiements des familles se gèrent dans Finances."
        actions={
          <Button asChild variant="secondary">
            <Link href="/tarifs" target="_blank">
              Voir les tarifs
            </Link>
          </Button>
        }
      />

      {params.bienvenue ? (
        <Alert tone="success" title="Bienvenue sur NéoScol !">
          <span className="inline-flex items-center gap-2">
            <PartyPopper className="size-4" aria-hidden /> Votre établissement est créé et votre essai gratuit de 14 jours a commencé. Aucun paiement n&apos;est demandé
            pendant l&apos;essai.
          </span>
        </Alert>
      ) : null}
      {subscription.is_demo ? <Alert tone="info">Abonnement de démonstration : établissement fictif, aucune facturation réelle.</Alert> : null}
      {access?.access === "read_only" ? (
        <Alert tone="danger" title="Lecture seule">
          L&apos;établissement est en lecture seule jusqu&apos;au paiement. Aucune donnée n&apos;est supprimée ; tout est rétabli dès que le paiement est confirmé.
        </Alert>
      ) : null}

      <Card className="anim-fade-up overflow-hidden">
        <div className="bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#1d63ed] p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Formule actuelle</p>
              <h2 className="text-2xl font-bold">{plan?.name}</h2>
              <p className="text-sm text-white/80">
                {formatMoney(price, subscription.currency)} {interval.short} · {interval.label}
                {subscription.billing_interval === "YEARLY" && plan ? ` · économie ${formatMoney(subscription.monthly_price * 12 - subscription.annual_price, subscription.currency)}/an` : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-white/95 px-1 py-0.5">
                <StatusBadge value={subscription.status} map={SUBSCRIPTION_STATUS} />
              </span>
              {subscription.cancel_at_period_end ? <Badge tone="warning">Annulation programmée</Badge> : null}
            </div>
          </div>
          {trialing ? (
            <div className="mt-5 grid gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Gift className="size-4 text-amber-300" aria-hidden /> Essai gratuit — {trialTotal} jours · Il vous reste {daysLeft} jour{daysLeft > 1 ? "s" : ""} d&apos;essai.
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={trialTotal} aria-valuenow={trialTotal - daysLeft} aria-label="Progression de l'essai">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-amber-300 [animation:grow-width_900ms_var(--ease-out)_both] origin-left"
                  style={{ width: `${Math.min(100, Math.max(4, ((trialTotal - daysLeft) / trialTotal) * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
        <CardContent className="grid gap-5 pt-5">
          <p className="text-sm text-muted-foreground">{status.description}</p>
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DateItem icon={CalendarRange} label={trialing ? "Début de l'essai" : "Début de période"} value={fmt(trialing ? subscription.trial_start : subscription.current_period_start)} />
            <DateItem icon={CalendarClock} label={trialing ? "Fin de l'essai" : "Fin de période"} value={fmt(endAt)} />
            <DateItem icon={CreditCard} label="Prochaine échéance" value={fmt(trialing ? subscription.trial_end : subscription.next_billing_date)} hint={subscription.cancel_at_period_end ? "Pas de renouvellement (annulé)" : undefined} />
            <DateItem icon={History} label="Jours restants" value={`${daysLeft} jour${daysLeft > 1 ? "s" : ""}`} />
          </div>
          {manage ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href={payHref}>
                  <CreditCard aria-hidden /> {trialing ? "Payer mon abonnement" : subscription.status === "ACTIVE" ? "Renouveler / payer d'avance" : "Régler mon abonnement"}
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <a href="#formules">
                  Changer de formule <ArrowRight aria-hidden />
                </a>
              </Button>
              {subscription.cancel_at_period_end ? (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="lg">
                      <RotateCcw aria-hidden /> Reprendre l&apos;abonnement
                    </Button>
                  }
                  title="Reprendre l'abonnement ?"
                  description="L'annulation programmée sera retirée ; l'abonnement continuera normalement."
                  confirmLabel="Reprendre"
                  action={resumeSubscription}
                  fields={{}}
                />
              ) : !["CANCELLED", "EXPIRED"].includes(subscription.status) && !subscription.is_demo ? (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="lg" className="text-danger">
                      <XCircle aria-hidden /> Annuler l&apos;abonnement
                    </Button>
                  }
                  title="Annuler l'abonnement NéoScol ?"
                  description={`L'accès reste complet jusqu'au ${fmt(endAt)}. Ensuite, l'établissement passe en lecture seule : aucune donnée n'est supprimée et vous pourrez réactiver à tout moment.`}
                  confirmLabel="Confirmer l'annulation"
                  tone="danger"
                  action={cancelSubscription}
                  fields={{}}
                  reason={{ label: "Motif (facultatif)" }}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Seule la direction peut modifier ou payer l&apos;abonnement.</p>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && manage ? (
        <Card className="anim-fade-up border-warning/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <FileText className="size-5" aria-hidden /> Facture{pending.length > 1 ? "s" : ""} à régler
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {pending.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span className="grid">
                  <span className="font-semibold">
                    {inv.invoice_number} · {inv.plan_name} ({INTERVAL_LABELS[inv.billing_interval]?.label.toLowerCase()})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {INVOICE_KIND[inv.kind]} · émise le {fmt(inv.issued_at)} · échéance {fmt(inv.due_at)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold tabular-nums">{formatMoney(inv.amount, inv.currency)}</span>
                  <Button asChild size="sm">
                    <Link href={`/abonnement/souscrire?formule=${inv.plan_code}&periodicite=${inv.billing_interval}`}>Payer</Link>
                  </Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="anim-fade-up overflow-hidden" style={{ "--delay": "80ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle>Factures NéoScol</CardTitle>
            <CardDescription>Consultables, téléchargeables et imprimables en PDF.</CardDescription>
          </CardHeader>
          {invoices.length === 0 ? (
            <CardContent>
              <EmptyState icon={FileText} title="Aucune facture" description={trialing ? "Aucune facture pendant l'essai gratuit." : "Les factures apparaîtront ici."} />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Numéro</TH>
                  <TH>Formule</TH>
                  <TH className="text-right">Montant</TH>
                  <TH>Statut</TH>
                  <TH />
                </tr>
              </THead>
              <tbody>
                {invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD>
                      <span className="grid">
                        <span className="font-mono text-xs font-semibold">{inv.invoice_number}</span>
                        <span className="text-xs text-muted-foreground">{fmt(inv.issued_at)}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="grid">
                        <span>{inv.plan_name}</span>
                        <span className="text-xs text-muted-foreground">{INTERVAL_LABELS[inv.billing_interval]?.label}</span>
                      </span>
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">{formatMoney(inv.amount, inv.currency)}</TD>
                    <TD>
                      <StatusBadge value={inv.status} map={INVOICE_STATUS} />
                    </TD>
                    <TD>
                      <a href={`/api/abonnement/factures/${inv.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        <FileText className="size-3.5" aria-hidden /> PDF
                      </a>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="anim-fade-up overflow-hidden" style={{ "--delay": "140ms" } as React.CSSProperties}>
          <CardHeader>
            <CardTitle>Paiements</CardTitle>
            <CardDescription>Chaque tentative, avec sa référence NéoScol.</CardDescription>
          </CardHeader>
          {transactions.length === 0 ? (
            <CardContent>
              <EmptyState icon={CreditCard} title="Aucun paiement" description="Vos paiements apparaîtront ici." />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Référence</TH>
                  <TH>Moyen</TH>
                  <TH className="text-right">Montant</TH>
                  <TH>Statut</TH>
                </tr>
              </THead>
              <tbody>
                {transactions.map((tx) => (
                  <TR key={tx.id}>
                    <TD>
                      <span className="grid">
                        <span className="font-mono text-xs font-semibold">{tx.internal_reference}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(tx.paid_at ?? tx.created_at, "fr-FR", tz)}</span>
                      </span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {PROVIDER_LABELS[tx.provider] ?? tx.provider}
                        {tx.mode === "test" ? <Badge tone="warning">Test</Badge> : null}
                      </span>
                      {tx.failure_reason ? <span className="block text-xs text-muted-foreground">{tx.failure_reason}</span> : null}
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">{formatMoney(tx.amount, tx.currency)}</TD>
                    <TD>
                      <StatusBadge value={tx.status} map={TRANSACTION_STATUS} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {manage ? (
        <section id="formules" className="grid scroll-mt-24 gap-4">
          <div className="grid gap-1 text-center">
            <h2 className="text-xl font-bold">{trialing ? "Choisissez votre formule" : "Changer de formule"}</h2>
            <p className="text-sm text-muted-foreground">
              {trialing
                ? "Pendant l'essai, vous pouvez changer de formule gratuitement ou payer dès maintenant (la période payée commence à la fin de l'essai)."
                : "Le changement prend effet au paiement de la nouvelle formule ; l'historique est conservé."}
            </p>
          </div>
          <PricingGrid plans={plans.filter((p) => p.is_active)} mode="app" currentPlanCode={plan?.code} initialInterval={subscription.billing_interval === "YEARLY" ? "YEARLY" : "MONTHLY"} />
        </section>
      ) : null}

      <Card className="anim-fade-up">
        <CardHeader>
          <CardTitle>Historique de l&apos;abonnement</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <EmptyState icon={History} title="Aucun événement" />
          ) : (
            <ol className="stagger relative grid gap-3 border-l-2 border-border pl-5">
              {events.map((e) => {
                const who = e.user ? [e.user.first_name, e.user.last_name].filter(Boolean).join(" ") || e.user.email : "NéoScol";
                const meta = (e.metadata ?? {}) as Record<string, unknown>;
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-surface bg-primary" aria-hidden />
                    <p className="text-sm font-semibold">{EVENT_LABELS[e.event_type] ?? e.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.created_at, "fr-FR", tz)} · {who}
                      {typeof meta.reference === "string" ? ` · ${meta.reference}` : ""}
                      {typeof meta.invoice_number === "string" ? ` · ${meta.invoice_number}` : ""}
                      {typeof meta.to_plan === "string" ? ` · → ${meta.to_plan}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
