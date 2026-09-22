import { ClipboardList, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav } from "@/components/shared/tab-nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getClasses, getCurrentYear } from "@/features/academic/queries";
import {
  countEnrollmentsByStatus,
  ENROLLMENT_STATUSES,
  ENROLLMENTS_PAGE_SIZE,
  listEnrollments,
  type EnrollmentStatus,
} from "@/features/enrollments/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { ENROLLMENT_STATUS, ENROLLMENT_TYPE } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid, pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Inscriptions" };

export default async function EnrollmentsPage({ searchParams }: PageProps<"/inscriptions">) {
  const context = await requirePermission("enrollments.read");
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  const [classes, counts] = await Promise.all([
    year ? getClasses(organizationId, year.id) : Promise.resolve([]),
    countEnrollmentsByStatus(organizationId, year?.id),
  ]);

  const requested = param(params, "statut");
  const status = (ENROLLMENT_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as EnrollmentStatus) : undefined;
  const classe = param(params, "classe");
  const filters = {
    status,
    q: param(params, "q"),
    classId: isUuid(classe) ? classe : undefined,
    yearId: year?.id,
    page: pageParam(params),
  };
  const { rows, total } = await listEnrollments(organizationId, filters);
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabHref = (s?: string) => {
    const next = new URLSearchParams();
    if (s) next.set("statut", s);
    if (filters.q) next.set("q", filters.q);
    if (filters.classId) next.set("classe", filters.classId);
    const qs = next.toString();
    return qs ? `/inscriptions?${qs}` : "/inscriptions";
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Scolarité</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Inscriptions</h1>
          <p className="text-sm text-muted-foreground">{year ? `Année ${year.name}` : "Aucune année scolaire"}</p>
        </div>
        {can(context, "enrollments.manage") ? (
          <Button asChild>
            <Link href="/inscriptions/nouvelle">
              <Plus aria-hidden /> Nouvelle inscription
            </Link>
          </Button>
        ) : null}
      </div>

      <TabNav
        label="Statut des inscriptions"
        active={status ?? "all"}
        tabs={[
          { key: "all", label: "Toutes", href: tabHref(), count: all },
          ...ENROLLMENT_STATUSES.map((s) => ({ key: s, label: ENROLLMENT_STATUS[s]!.label, href: tabHref(s), count: counts[s] })),
        ]}
      />

      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Nom de l'élève, matricule ou référence INS-…"
            filters={[{ name: "classe", label: "Toutes les classes", options: classes.map((c) => ({ value: c.id, label: c.name })) }]}
          />
        </Suspense>
        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState icon={ClipboardList} title="Aucune inscription" description="Aucune inscription ne correspond à ces critères." />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr className="border-t border-border">
                    <TH>Référence</TH>
                    <TH>Élève</TH>
                    <TH>Classe</TH>
                    <TH>Type</TH>
                    <TH>Créée le</TH>
                    <TH>Statut</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/inscriptions/${row.id}`} className="font-semibold text-primary hover:underline">
                          {row.reference}
                        </Link>
                      </TD>
                      <TD>
                        <span className="grid">
                          <span className="font-medium">
                            {row.student.last_name} {row.student.first_name}
                          </span>
                          <span className="text-xs text-muted-foreground">{row.student.matricule}</span>
                        </span>
                      </TD>
                      <TD>{row.class?.name ?? "—"}</TD>
                      <TD className="text-muted-foreground">{ENROLLMENT_TYPE[row.type]}</TD>
                      <TD className="text-muted-foreground">{formatDate(row.created_at, "fr-FR", { dateStyle: "short" })}</TD>
                      <TD>
                        <StatusBadge value={row.status} map={ENROLLMENT_STATUS} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="grid gap-2 border-t border-border p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/inscriptions/${row.id}`} className="grid gap-1 rounded-xl border border-border p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {row.student.last_name} {row.student.first_name}
                      </span>
                      <StatusBadge value={row.status} map={ENROLLMENT_STATUS} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.reference} · {row.class?.name ?? "—"} · {ENROLLMENT_TYPE[row.type]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination
          page={filters.page}
          pageSize={ENROLLMENTS_PAGE_SIZE}
          total={total}
          basePath="/inscriptions"
          searchParams={{ statut: status, q: filters.q, classe: filters.classId }}
        />
      </Card>
    </div>
  );
}
