import { AlertTriangle, Banknote, Building2, CalendarClock, CheckCircle2, Gift, Hourglass, Lock, TrendingUp, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { INTERVAL_LABELS, SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { listPlans } from "@/features/billing/queries";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { issuePlatformInvoice, runBillingLifecycle, updateBillingSettings } from "@/features/platform/billing-actions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Abonnements — Plateforme" };

type Overview = Record<string, number>;

/** Tableau de bord des abonnements de tous les établissements (Super Administrateur). */
export default async function PlatformSubscriptionsPage({ searchParams }: PageProps<"/plateforme/abonnements">) {
  const params = await searchParams;
  const filter = typeof params.statut === "string" && params.statut in SUBSCRIPTION_STATUS ? params.statut : null;
  const supabase = await createClient();
  let query = supabase
    .from("subscriptions")
    .select("id, organization_id, status, billing_interval, monthly_price, annual_price, currency, trial_end, current_period_end, cancel_at_period_end, is_demo, organization:organizations(name, code, city), plan:subscription_plans(name, code)")
    .order("updated_at", { ascending: false });
  if (filter) query = query.eq("status", filter);
  const [{ data: overview }, { data: subs }, { data: settings }, plans] = await Promise.all([
    supabase.rpc("platform_billing_overview"),
    query,
    supabase.from("platform_billing_settings").select("*").eq("id", 1).single(),
    listPlans(),
  ]);
  const o = (overview ?? {}) as Overview;
  const money = (n: number | undefined) => ({ amount: Number(n ?? 0), currency: "XOF" });
  const planOptions = plans.map((p) => ({ value: p.code, label: p.name }));

  return (
    <div className="grid gap-6">
      <section className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicateurs">
        <StatCard label="Établissements actifs" value={{ count: o.organizations_active ?? 0 }} hint={`${o.demo ?? 0} de démonstration (exclus)`} icon={Building2} tone="primary" />
        <StatCard label="Essais en cours" value={{ count: o.trialing ?? 0 }} icon={Gift} tone="info" />
        <StatCard label="Abonnements actifs" value={{ count: o.active ?? 0 }} icon={CheckCircle2} tone="success" />
        <StatCard label="Abonnements impayés" value={{ count: o.unpaid ?? 0 }} hint={`${o.restricted ?? 0} restreint(s)`} icon={AlertTriangle} tone="warning" />
        <StatCard label="Expirés / annulés" value={{ count: o.expired ?? 0 }} icon={Lock} tone="danger" />
        <StatCard label="Paiements réussis" value={{ count: o.payments_success ?? 0 }} hint={`${o.payments_pending ?? 0} en attente`} icon={CheckCircle2} tone="success" />
        <StatCard label="Paiements échoués" value={{ count: o.payments_failed ?? 0 }} hint={`${o.webhook_errors ?? 0} notification(s) rejetée(s)`} icon={XCircle} tone="danger" />
      </section>
      <section className="stagger grid gap-4 md:grid-cols-3" aria-label="Revenus">
        <StatCard label="Revenus du mois" value={money(o.revenue_month)} hint="Paiements réels (production et manuels)" icon={Banknote} tone="success" />
        <StatCard label="Revenus de l'année" value={money(o.revenue_year)} hint={`Mode test : ${new Intl.NumberFormat("fr-FR").format(o.revenue_test ?? 0)} F CFA (non comptés)`} icon={TrendingUp} tone="primary" />
        <StatCard label="Revenu mensuel récurrent" value={money(o.mrr)} hint={`Annuel récurrent : ${new Intl.NumberFormat("fr-FR").format(o.arr ?? 0)} F CFA`} icon={CalendarClock} tone="info" />
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Abonnements</CardTitle>
            <CardDescription>Statuts calculés et appliqués par la base de données.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link href="/plateforme/abonnements" className={cn("rounded-full border px-2.5 py-1 font-medium", !filter ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>
              Tous
            </Link>
            {Object.entries(SUBSCRIPTION_STATUS).map(([key, s]) => (
              <Link
                key={key}
                href={`/plateforme/abonnements?statut=${key}`}
                className={cn("rounded-full border px-2.5 py-1 font-medium", filter === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        {!subs?.length ? (
          <CardContent>
            <EmptyState icon={Hourglass} title="Aucun abonnement" description="Aucun abonnement ne correspond à ce filtre." />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <tr className="border-t border-border">
                <TH>Établissement</TH>
                <TH>Formule</TH>
                <TH>Statut</TH>
                <TH>Échéance</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {subs.map((s) => {
                const end = s.status === "TRIALING" ? s.trial_end : (s.current_period_end ?? s.trial_end);
                return (
                  <TR key={s.id}>
                    <TD>
                      <span className="grid">
                        <span className="font-semibold">{s.organization?.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.organization?.code} · {s.organization?.city ?? "—"}
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <span className="grid">
                        <span>{s.plan?.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {INTERVAL_LABELS[s.billing_interval]?.label} · {new Intl.NumberFormat("fr-FR").format(s.billing_interval === "YEARLY" ? s.annual_price : s.monthly_price)} F CFA
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {s.is_demo ? <Badge>Démonstration</Badge> : <StatusBadge value={s.status} map={SUBSCRIPTION_STATUS} />}
                        {s.cancel_at_period_end ? <Badge tone="warning">Annulation</Badge> : null}
                      </span>
                    </TD>
                    <TD className="tabular-nums">{end ? formatDate(end) : "—"}</TD>
                    <TD>
                      <span className="flex justify-end">
                        <QuickFormDialog
                          title={`Émettre une facture — ${s.organization?.name ?? ""}`}
                          description="Montant calculé par la base à partir de la formule officielle. Utile avant un paiement hors plateforme."
                          trigger={
                            <Button size="sm" variant="secondary">
                              Émettre une facture
                            </Button>
                          }
                          submitLabel="Émettre"
                          action={issuePlatformInvoice}
                          hidden={{ organization_id: s.organization_id }}
                          fields={[
                            { name: "plan", label: "Formule", type: "select", required: true, options: planOptions, defaultValue: s.plan?.code ?? undefined },
                            { name: "interval", label: "Périodicité", type: "select", required: true, options: [{ value: "MONTHLY", label: "Mensuel" }, { value: "YEARLY", label: "Annuel (-30 %)" }], defaultValue: s.billing_interval },
                          ]}
                        />
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Impayés et traitement quotidien</CardTitle>
            <CardDescription>
              Après l&apos;échéance : à régler pendant {settings?.past_due_days} j, délai de grâce jusqu&apos;à J+{settings?.restrict_after_days}, lecture seule jusqu&apos;à J+
              {settings?.expire_after_days}, puis expiré. Aucune donnée n&apos;est jamais supprimée.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickFormDialog
              title="Délais d'impayé"
              description="Nombre de jours après l'échéance."
              triggerLabel="Configurer les délais"
              action={updateBillingSettings}
              fields={[
                { name: "past_due", label: "« À régler » pendant (jours)", type: "number", required: true, min: 0, max: 60, defaultValue: String(settings?.past_due_days ?? 3) },
                { name: "restrict", label: "Lecture seule à partir de J+", type: "number", required: true, min: 0, max: 120, defaultValue: String(settings?.restrict_after_days ?? 10) },
                { name: "expire", label: "Expiration à partir de J+", type: "number", required: true, min: 1, max: 730, defaultValue: String(settings?.expire_after_days ?? 60) },
                { name: "renewal_notice", label: "Facture de renouvellement à J-", type: "number", required: true, min: 1, max: 60, defaultValue: String(settings?.renewal_notice_days ?? 7) },
              ]}
            />
            <ConfirmAction
              trigger={<Button>Exécuter maintenant</Button>}
              title="Exécuter le traitement quotidien ?"
              description="Statuts d'impayé, rappels d'essai (J-7, J-3, J-1, jour J), factures de renouvellement et paiements abandonnés. Normalement lancé chaque jour par /api/cron/abonnements."
              confirmLabel="Exécuter"
              action={runBillingLifecycle}
              fields={{}}
            />
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
