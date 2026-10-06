import { Building2, Download, TrendingUp, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LinkSelect } from "@/components/shared/link-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { StatCard } from "@/features/dashboard/components/stat-card";
import { GROWTH_COLUMNS, monthLabel, type Growth } from "@/features/platform/growth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Analyses — Plateforme" };

/** Barres d'une seule série (couleur principale), valeur toujours écrite à côté : la couleur ne porte jamais seule l'information. */
function Bars({ title, rows }: { title: string; rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5" role="list">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={`${r.label} : ${r.text}`}>
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="h-3 rounded-r-[4px] bg-primary transition-[width]" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} aria-hidden />
              <span className="tabular-nums text-foreground">{r.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Analyses : croissance, abonnements, revenus NeoScool (hors frais de scolarité), activité des établissements. */
export default async function PlatformAnalysesPage({ searchParams }: PageProps<"/plateforme/analyses">) {
  const params = await searchParams;
  const months = [6, 12, 24].includes(Number(param(params, "mois"))) ? Number(param(params, "mois")) : 12;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_growth", { p_months: months });
  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-danger">Analyse indisponible.</CardContent>
      </Card>
    );
  }
  const g = data as unknown as Growth;
  const currency = Object.keys(g.months.at(-1)?.revenue ?? {})[0] ?? Object.keys(g.months.find((m) => Object.keys(m.revenue).length)?.revenue ?? {})[0] ?? "XOF";
  const sum = (key: (typeof GROWTH_COLUMNS)[number]["key"]) => g.months.reduce((n, m) => n + Number(m[key]), 0);
  const revenueTotal = g.months.reduce((n, m) => n + Number(m.revenue[currency] ?? 0), 0);
  const short = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold">Analyses de la plateforme</h2>
          <p className="text-sm text-muted-foreground">
            Données réelles, établissements de démonstration exclus. Les revenus sont ceux de NeoScool (abonnements, accès enseignants), jamais les frais de scolarité encaissés par les établissements.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <LinkSelect label="Période" className="w-44" value={String(months)} options={[6, 12, 24].map((m) => ({ value: String(m), label: `${m} derniers mois`, href: `/plateforme/analyses?mois=${m}` }))} />
          <Button asChild variant="secondary">
            <a href={`/plateforme/analyses/export?mois=${months}`} data-testid="growth-export">
              <Download aria-hidden /> Exporter (CSV)
            </a>
          </Button>
        </div>
      </div>

      <section className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Synthèse de la période">
        <StatCard label="Nouveaux établissements" value={{ count: sum("new_organizations") }} hint={`${formatNumber(g.months.at(-1)?.total_organizations ?? 0)} au total`} icon={Building2} />
        <StatCard label="Revenus NeoScool" value={{ amount: revenueTotal, currency }} hint={`${months} derniers mois`} icon={TrendingUp} tone="success" />
        <StatCard label="Renouvellements / résiliations" value={`${sum("renewals")} / ${sum("cancellations")}`} hint={`${sum("activations")} activation(s), ${sum("trials")} essai(s)`} icon={UserCheck} tone="info" />
        <StatCard label="Établissements actifs (30 j)" value={`${g.activity.active_organizations_30d} / ${g.activity.organizations}`} hint="Au moins une connexion en 30 jours" icon={Users} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Bars title={`Revenus NeoScool par mois (${currency})`} rows={g.months.map((m) => ({ label: short(m.month), value: Number(m.revenue[currency] ?? 0), text: formatMoney(Number(m.revenue[currency] ?? 0), currency) }))} />
        <Bars title="Nouveaux établissements par mois" rows={g.months.map((m) => ({ label: short(m.month), value: m.new_organizations, text: String(m.new_organizations) }))} />
        <Bars title="Utilisateurs actifs par mois" rows={g.months.map((m) => ({ label: short(m.month), value: m.active_users, text: String(m.active_users) }))} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Détail mensuel</CardTitle>
          <CardDescription>Même contenu que l&apos;export CSV.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table data-testid="growth-table">
            <THead>
              <tr className="border-t border-border">
                <TH>Mois</TH>
                {GROWTH_COLUMNS.map((c) => (
                  <TH key={c.key} className="text-right">
                    {c.label}
                  </TH>
                ))}
                <TH className="text-right">Revenus</TH>
              </tr>
            </THead>
            <tbody>
              {g.months.map((m) => (
                <TR key={m.month}>
                  <TD className="whitespace-nowrap capitalize">{monthLabel(m.month)}</TD>
                  {GROWTH_COLUMNS.map((c) => (
                    <TD key={c.key} className="text-right tabular-nums">
                      {formatNumber(Number(m[c.key]))}
                    </TD>
                  ))}
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {Object.entries(m.revenue).map(([cur, v]) => formatMoney(Number(v), cur)).join(" · ") || "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Établissements inactifs (aucune connexion depuis 30 jours)</CardTitle>
          <CardDescription>À recontacter avant une résiliation.</CardDescription>
        </CardHeader>
        <CardContent>
          {g.activity.inactive.length ? (
            <ul className="grid gap-1.5 text-sm">
              {g.activity.inactive.map((o) => (
                <li key={o.id} className="flex justify-between gap-3">
                  <Link href={`/plateforme/etablissements/${o.id}`} className="font-medium hover:text-primary">
                    {o.name}
                  </Link>
                  <span className="text-muted-foreground">{o.last_login ? `dernière connexion ${formatDate(o.last_login)}` : "jamais connecté"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">Tous les établissements se sont connectés dans les 30 derniers jours.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
