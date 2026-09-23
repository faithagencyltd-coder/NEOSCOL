import { History } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { AUDIT_MODULES, AUDIT_PAGE_SIZE, AUDIT_PERIODS, listAuditLogs } from "@/features/audit/queries";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Journal d'audit" };

const RESULT = {
  success: { label: "Réussi", tone: "success" },
  denied: { label: "Refusé", tone: "danger" },
  failure: { label: "Échec", tone: "warning" },
} as const;

const OPERATIONS: Record<string, string> = { insert: "création", update: "modification", delete: "suppression" };

/** Libellé lisible : résumé applicatif, sinon « table · opération ». */
function describe(row: { action: string; summary: string | null; entity_type: string | null }) {
  if (row.summary) return row.summary;
  const [entity, op] = row.action.split(".");
  return `${entity?.replaceAll("_", " ")} — ${OPERATIONS[op ?? ""] ?? op ?? ""}`;
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const context = await requirePermission("audit.read");
  const params = await searchParams;
  const filters = {
    q: param(params, "q"),
    module: param(params, "module"),
    result: param(params, "resultat"),
    period: param(params, "periode"),
    page: pageParam(params),
  };
  const { rows, total } = await listAuditLogs(context.organization.id, { ...filters, result: filters.result && filters.result in RESULT ? filters.result : undefined });
  const tz = context.organization.timezone;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Journal d'audit"
        description={`Qui a fait quoi, quand, avec quel rôle et quel résultat — ${formatNumber(total)} entrée(s). Le journal est en lecture seule, y compris pour l'administration.`}
      />
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Action, résumé ou utilisateur…"
            filters={[
              { name: "module", label: "Tous les modules", options: Object.entries(AUDIT_MODULES).map(([value, m]) => ({ value, label: m.label })) },
              { name: "resultat", label: "Tous les résultats", options: Object.entries(RESULT).map(([value, r]) => ({ value, label: r.label })) },
              { name: "periode", label: "Toute la période", options: Object.entries(AUDIT_PERIODS).map(([value, p]) => ({ value, label: p.label })) },
            ]}
          />
        </Suspense>
        {rows.length === 0 ? (
          <EmptyState icon={History} title="Aucune entrée" description="Aucune action ne correspond à ces filtres." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Utilisateur</TH>
                <TH>Action</TH>
                <TH>Résultat</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((row) => (
                <TR key={row.id} className="align-top">
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.created_at, "fr-FR", tz)}</TD>
                  <TD>
                    <span className="grid">
                      <span className="font-medium">{row.actor_email ?? "Système"}</span>
                      <span className="text-xs text-muted-foreground">{row.actor_role ?? "—"}</span>
                    </span>
                  </TD>
                  <TD className="min-w-72">
                    <span className="grid gap-0.5">
                      <span className="font-medium first-letter:uppercase">{describe(row)}</span>
                      <code className="text-xs text-muted-foreground">{row.action}</code>
                      {row.changes && Object.keys(row.changes as object).length ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary">Détail des modifications</summary>
                          <pre className="mt-1 max-h-64 max-w-xl overflow-auto rounded-lg bg-surface-muted p-2">{JSON.stringify(row.changes, null, 2)}</pre>
                        </details>
                      ) : null}
                    </span>
                  </TD>
                  <TD>
                    <StatusBadge value={row.result} map={RESULT} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={filters.page}
          pageSize={AUDIT_PAGE_SIZE}
          total={total}
          basePath="/audit"
          searchParams={{ q: filters.q, module: filters.module, resultat: filters.result, periode: filters.period }}
        />
      </Card>
    </div>
  );
}
