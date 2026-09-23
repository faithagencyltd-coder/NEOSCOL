import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TabNav } from "@/components/shared/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { HorizontalBars } from "@/features/dashboard/components/bar-chart";
import { getReportSection } from "@/features/reports/queries";
import { isReportSection, REPORT_SECTIONS, type ReportColumn, type ReportSectionKey } from "@/features/reports/sections";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { PAYMENT_METHOD } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Rapports" };

function cell(value: unknown, column: ReportColumn, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (column.kind === "money") return formatMoney(Number(value), currency);
  if (column.kind === "percent") return `${formatNumber(Number(value))} %`;
  if (column.kind === "number") return formatNumber(Number(value));
  return String(value);
}

/** Rapports et statistiques (données réelles, calculées en base) avec exports CSV. */
export default async function ReportsPage({ searchParams }: PageProps<"/rapports">) {
  const context = await requirePermission("reports.read");
  const org = context.organization;
  const canFinance = can(context, "reports.finance");
  const canExport = can(context, "reports.export");
  const available = (Object.keys(REPORT_SECTIONS) as ReportSectionKey[]).filter((k) => k !== "finances" || canFinance);
  const requested = param(await searchParams, "section");
  const section: ReportSectionKey = isReportSection(requested) && available.includes(requested) ? requested : "effectifs";
  if (isReportSection(requested) && !available.includes(requested)) notFound();
  const meta = REPORT_SECTIONS[section] as { title: string; description: string; columns: readonly ReportColumn[]; chart: { label: string; value: string } };
  const data = await getReportSection(org.id, section);
  const rows = data?.rows ?? [];
  const chartColumn = meta.columns.find((c) => c.key === meta.chart.value)!;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Rapports et statistiques"
        description="Toutes les valeurs proviennent des données réelles de l'établissement et respectent vos permissions."
        actions={
          canExport && rows.length ? (
            <Button asChild variant="secondary">
              <a href={`/api/rapports/${section}`} download>
                <Download aria-hidden /> Exporter en CSV (Excel)
              </a>
            </Button>
          ) : null
        }
      />
      <TabNav label="Sections des rapports" active={section} tabs={available.map((k) => ({ key: k, label: REPORT_SECTIONS[k].title, href: `/rapports?section=${k}` }))} />
      <p className="text-sm text-muted-foreground">{meta.description}</p>
      {!canExport ? <Alert tone="info">L&apos;export des rapports est réservé aux rôles disposant de la permission « reports.export ».</Alert> : null}
      {!data ? (
        <Alert tone="danger">Rapport indisponible.</Alert>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="Aucune donnée" description="Ce rapport se remplira dès que des données seront saisies." />
        </Card>
      ) : (
        <>
          {typeof data.total === "number" ? (
            <Card className="rise flex items-center gap-4 p-4">
              <span className="text-sm text-muted-foreground">Total des élèves inscrits (année en cours)</span>
              <span className="text-2xl font-bold tabular-nums">{formatNumber(data.total)}</span>
            </Card>
          ) : null}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[2fr_3fr]">
            <Card>
              <CardHeader>
                <CardTitle>{chartColumn.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  caption={`${meta.title} — ${chartColumn.label}`}
                  data={rows.slice(0, 20).map((r) => ({
                    label: String(section === "resultats" ? `${r.classe} · ${r.matiere}` : (r[meta.chart.label] ?? "—")),
                    value: Number(r[meta.chart.value] ?? 0),
                    display: cell(r[meta.chart.value], chartColumn, org.currency),
                  }))}
                />
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <Table>
                <THead>
                  <tr>
                    {meta.columns.map((c) => (
                      <TH key={c.key} className={cn(c.kind && c.kind !== "text" && "text-right")}>
                        {c.label}
                      </TH>
                    ))}
                  </tr>
                </THead>
                <tbody>
                  {rows.map((r, i) => (
                    <TR key={i}>
                      {meta.columns.map((c) => (
                        <TD key={c.key} className={cn("whitespace-nowrap", c.kind && c.kind !== "text" && "text-right tabular-nums")}>
                          {cell(r[c.key], c, org.currency)}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
          {section === "finances" ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Recettes et dépenses par mois</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {(data.par_mois ?? []).map((m) => (
                    <div key={m.mois} className="flex items-center justify-between gap-3">
                      <span>{m.mois}</span>
                      <span className="text-success tabular-nums">+{formatMoney(Number(m.recettes), org.currency)}</span>
                      <span className="text-danger tabular-nums">−{formatMoney(Number(m.depenses), org.currency)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Encaissements par mode</CardTitle>
                </CardHeader>
                <CardContent>
                  <HorizontalBars
                    caption="Encaissements par mode de paiement"
                    data={(data.par_mode ?? []).map((m) => ({ label: PAYMENT_METHOD[m.mode] ?? m.mode, value: Number(m.montant), display: formatMoney(Number(m.montant), org.currency) }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Dépenses par catégorie</CardTitle>
                </CardHeader>
                <CardContent>
                  <HorizontalBars
                    caption="Dépenses par catégorie"
                    data={(data.depenses_par_categorie ?? []).map((m) => ({ label: m.categorie, value: Number(m.montant), display: formatMoney(Number(m.montant), org.currency) }))}
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
