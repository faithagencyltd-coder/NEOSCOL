import { ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, HandCoins, Hourglass, LogOut, Repeat, Sparkles, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PROVIDER_LABELS, SUBSCRIPTION_STATUS } from "@/features/billing/constants";
import { evolution, parseRevenuePeriod, revenuePresets, type RevenueSummary } from "@/features/platform/revenue";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Revenus — Plateforme" };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const today = () => new Date();

/** Somme affichée pour une liste de montants par devise (« 12 000 F CFA · 50 € »). */
function money(list: { currency: string; amount: number }[]): string {
  if (!list.length) return formatMoney(0);
  return list.map((t) => formatMoney(Number(t.amount), t.currency)).join(" · ");
}

/** Tableau de bord des revenus du Super Admin : encaissements, clients, essais, impayés, départs. */
export default async function PlatformRevenuePage({ searchParams }: PageProps<"/plateforme/revenus">) {
  const params = await searchParams;
  const now = today();
  const period = parseRevenuePeriod(params, now);
  const presets = revenuePresets(now);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_revenue_summary", { p_from: period.from, p_to: period.to });
  if (error || !data) {
    return (
      <Card className="p-6" role="alert">
        Impossible de charger les revenus : {error?.message ?? "réponse vide"}.
      </Card>
    );
  }
  const s = data as unknown as RevenueSummary;
  const mainCurrency = s.totals[0]?.currency ?? s.monthly.at(-1)?.currency ?? "XOF";
  const main = s.totals.find((t) => t.currency === mainCurrency);
  const previous = s.previous_totals.find((t) => t.currency === mainCurrency);
  const change = evolution(Number(main?.amount ?? 0), Number(previous?.amount ?? 0));
  const conversion = s.trials_ended ? Math.round((s.trials_converted / s.trials_ended) * 100) : null;
  const exportQuery = `du=${period.from}&au=${period.to}`;

  // Barres des 12 derniers mois (devise principale).
  const end = new Date(`${period.to}T00:00:00Z`);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = s.monthly.find((m) => m.month === key && m.currency === mainCurrency);
    return { key, label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, amount: Number(row?.amount ?? 0), count: row?.count ?? 0 };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.amount));

  const kpis = [
    {
      label: "Encaissé sur la période",
      value: money(s.totals),
      hint: `${formatNumber(s.totals.reduce((n, t) => n + t.count, 0))} paiement(s)`,
      icon: HandCoins,
      testid: "kpi-revenue",
    },
    {
      label: "Revenu mensuel récurrent",
      value: money(s.recurring),
      hint: `${formatNumber(s.active_now)} abonnement(s) actif(s)`,
      icon: Repeat,
      testid: "kpi-recurring",
    },
    {
      label: "Nouveaux clients",
      value: formatNumber(s.new_paying),
      hint: `premier paiement · ${formatNumber(s.new_organizations)} établissement(s) inscrit(s)`,
      icon: UserPlus,
      testid: "kpi-new",
    },
    {
      label: "Essais convertis",
      value: conversion === null ? "—" : `${conversion} %`,
      hint: `${formatNumber(s.trials_converted)} sur ${formatNumber(s.trials_ended)} essai(s) terminé(s) · ${formatNumber(s.trialing_now)} en cours`,
      icon: Sparkles,
      testid: "kpi-trials",
    },
    {
      label: "Impayés",
      value: money(s.unpaid_totals),
      hint: `${formatNumber(s.unpaid_count)} établissement(s) en retard`,
      icon: Hourglass,
      testid: "kpi-unpaid",
      tone: s.unpaid_count ? "warning" : undefined,
    },
    {
      label: "Départs",
      value: formatNumber(s.churn_count),
      hint: "abonnements annulés ou expirés sur la période",
      icon: LogOut,
      testid: "kpi-churn",
      tone: s.churn_count ? "danger" : undefined,
    },
  ];

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <Card>
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Période">
            {presets.map((p) => (
              <Button key={p.key} asChild size="sm" variant={period.preset === p.key ? "primary" : "secondary"}>
                <Link href={`/plateforme/revenus?periode=${p.key}`} aria-current={period.preset === p.key ? "true" : undefined}>
                  {p.label}
                </Link>
              </Button>
            ))}
          </div>
          <form key={`${period.from}-${period.to}`} className="flex flex-wrap items-end gap-3" action="/plateforme/revenus">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Du</span>
              <Input type="date" name="du" defaultValue={period.from} required className="h-10 w-44" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Au</span>
              <Input type="date" name="au" defaultValue={period.to} required className="h-10 w-44" />
            </label>
            <Button type="submit" size="sm">Afficher</Button>
            <span className="ml-auto flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href={`/plateforme/revenus/export?${exportQuery}&format=xlsx`} data-testid="export-xlsx">
                  <FileSpreadsheet className="size-4" aria-hidden /> Export Excel
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href={`/plateforme/revenus/export?${exportQuery}&format=csv`} data-testid="export-csv">
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              </Button>
            </span>
          </form>
          <p className="text-xs text-muted-foreground" data-testid="period-label">
            Période du {formatDate(period.from)} au {formatDate(period.to)}. Les établissements de démonstration sont exclus
            {s.test_excluded.count > 0
              ? ` ; ${formatNumber(s.test_excluded.count)} paiement(s) de test (${formatMoney(Number(s.test_excluded.amount))}) ne sont pas comptés.`
              : "."}
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Indicateurs">
        {kpis.map((k) => (
          <Card key={k.label} className="flex items-start gap-3 p-4" data-testid={k.testid}>
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                k.tone === "warning" ? "bg-warning/15 text-warning" : k.tone === "danger" ? "bg-danger/10 text-danger" : "bg-primary-soft text-primary",
              )}
            >
              <k.icon className="size-5" aria-hidden />
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-xl font-bold tabular-nums">{k.value}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
              {k.testid === "kpi-revenue" && change !== null ? (
                <span className={cn("flex items-center gap-1 text-xs font-semibold", change >= 0 ? "text-success" : "text-danger")}>
                  {change >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                  {change >= 0 ? "+" : ""}
                  {change} % par rapport à la période précédente
                </span>
              ) : null}
            </span>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Encaissements des 12 derniers mois</CardTitle>
          <CardDescription>En {mainCurrency}, jusqu&apos;au mois de fin de la période choisie.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex h-48 items-end gap-1.5 sm:gap-3" aria-label="Encaissements par mois" data-testid="monthly-chart">
            {months.map((m, i) => (
              <li key={m.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${m.label} : ${formatMoney(m.amount, mainCurrency)} (${m.count} paiement(s))`}>
                <span className="sr-only">
                  {m.label} : {formatMoney(m.amount, mainCurrency)}
                </span>
                <span
                  className={cn("w-full rounded-t-md", m.amount ? "bg-primary" : "bg-muted")}
                  style={{ height: `${Math.max(m.amount ? 4 : 2, Math.round((m.amount / maxMonth) * 100))}%` }}
                  aria-hidden
                />
                <span className={cn("truncate whitespace-nowrap text-[10px] text-muted-foreground sm:block sm:text-xs", i % 3 === 2 ? "block" : "hidden")} aria-hidden>
                  {m.label}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Par formule</CardTitle>
          </CardHeader>
          {s.by_label.length ? (
            <Table data-testid="by-label">
              <THead>
                <tr>
                  <TH>Formule</TH>
                  <TH>Paiements</TH>
                  <TH className="text-right">Montant</TH>
                </tr>
              </THead>
              <tbody>
                {s.by_label.map((r) => (
                  <TR key={`${r.label}-${r.currency}`}>
                    <TD>{r.label}</TD>
                    <TD className="tabular-nums">{formatNumber(r.count)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardContent className="text-sm text-muted-foreground">Aucun encaissement sur la période.</CardContent>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Par moyen de paiement</CardTitle>
            {s.discounts.length ? <CardDescription>Remises accordées (annuel, codes promo, tarifs négociés) : {money(s.discounts)}</CardDescription> : null}
          </CardHeader>
          {s.by_method.length ? (
            <Table data-testid="by-method">
              <THead>
                <tr>
                  <TH>Moyen</TH>
                  <TH>Paiements</TH>
                  <TH className="text-right">Montant</TH>
                </tr>
              </THead>
              <tbody>
                {s.by_method.map((r) => (
                  <TR key={`${r.method}-${r.currency}`}>
                    <TD>{PROVIDER_LABELS[r.method] ?? r.method.charAt(0).toUpperCase() + r.method.slice(1)}</TD>
                    <TD className="tabular-nums">{formatNumber(r.count)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardContent className="text-sm text-muted-foreground">Aucun encaissement sur la période.</CardContent>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Meilleurs clients de la période</CardTitle>
        </CardHeader>
        {s.top_organizations.length ? (
          <Table data-testid="top-organizations">
            <THead>
              <tr>
                <TH>Établissement</TH>
                <TH>Paiements</TH>
                <TH className="text-right">Montant</TH>
              </tr>
            </THead>
            <tbody>
              {s.top_organizations.map((r) => (
                <TR key={`${r.code}-${r.currency}`}>
                  <TD>
                    <span className="font-semibold">{r.name}</span> <span className="text-xs text-muted-foreground">{r.code}</span>
                  </TD>
                  <TD className="tabular-nums">{formatNumber(r.count)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">Aucun encaissement sur la période.</CardContent>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Impayés en cours</CardTitle>
            <CardDescription>Établissements dont l&apos;échéance est dépassée, à relancer. Le paiement se valide dans l&apos;onglet Paiements.</CardDescription>
          </CardHeader>
          {s.unpaid.length ? (
            <Table data-testid="unpaid-list">
              <THead>
                <tr>
                  <TH>Établissement</TH>
                  <TH>Statut</TH>
                  <TH className="text-right">À régler</TH>
                </tr>
              </THead>
              <tbody>
                {s.unpaid.map((u) => (
                  <TR key={u.organization_code}>
                    <TD>
                      <span className="grid">
                        <span className="font-semibold">{u.organization_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {u.plan_name} · depuis le {formatDate(u.status_changed_at)}
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge value={u.status} map={SUBSCRIPTION_STATUS} />
                    </TD>
                    <TD className="text-right tabular-nums">{formatMoney(Number(u.amount), u.currency)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardContent className="text-sm text-muted-foreground">Aucun impayé : tous les abonnements sont à jour.</CardContent>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Départs de la période</CardTitle>
            <CardDescription>Abonnements annulés ou expirés. Les données de ces établissements sont conservées.</CardDescription>
          </CardHeader>
          {s.churn.length ? (
            <Table data-testid="churn-list">
              <THead>
                <tr>
                  <TH>Établissement</TH>
                  <TH>Statut</TH>
                  <TH>Motif</TH>
                </tr>
              </THead>
              <tbody>
                {s.churn.map((c) => (
                  <TR key={c.organization_code}>
                    <TD>
                      <span className="grid">
                        <span className="font-semibold">{c.organization_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.plan_name} · le {formatDate(c.status_changed_at)}
                        </span>
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge value={c.status} map={SUBSCRIPTION_STATUS} />
                    </TD>
                    <TD className="text-sm">{c.cancellation_reason ?? "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardContent className="text-sm text-muted-foreground">Aucun départ sur la période.</CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
