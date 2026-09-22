import { GraduationCap, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getClasses, getCurrentYear } from "@/features/academic/queries";
import { listStudents, STUDENTS_PAGE_SIZE } from "@/features/students/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { STUDENT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid, pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Élèves" };

export default async function StudentsPage({ searchParams }: PageProps<"/eleves">) {
  const context = await requirePermission("students.read");
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  const classes = year ? await getClasses(organizationId, year.id) : [];

  const status = param(params, "statut");
  const classe = param(params, "classe");
  const filters = {
    q: param(params, "q"),
    classId: isUuid(classe) ? classe : undefined,
    status: status && status !== "archive" && status in STUDENT_STATUS ? status : undefined,
    sex: param(params, "sexe"),
    archived: status === "archive",
    page: pageParam(params),
  };
  const { rows, total } = await listStudents(organizationId, year?.id ?? null, filters);
  const hasFilters = Boolean(filters.q || filters.classId || filters.status || filters.sex || filters.archived);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Scolarité</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Élèves</h1>
          <p className="text-sm text-muted-foreground">
            {total} dossier{total > 1 ? "s" : ""}
            {year ? ` · année ${year.name}` : ""}
          </p>
        </div>
        {can(context, "students.create") ? (
          <Button asChild>
            <Link href="/eleves/nouveau">
              <Plus aria-hidden /> Nouvel élève
            </Link>
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Nom, prénom ou matricule…"
            filters={[
              { name: "classe", label: "Toutes les classes", options: classes.map((c) => ({ value: c.id, label: c.name })) },
              {
                name: "statut",
                label: "Tous les statuts",
                options: [
                  ...Object.entries(STUDENT_STATUS).map(([value, { label }]) => ({ value, label })),
                  { value: "archive", label: "Archivés" },
                ],
              },
              { name: "sexe", label: "Filles et garçons", options: [{ value: "F", label: "Filles" }, { value: "M", label: "Garçons" }] },
            ]}
          />
        </Suspense>

        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              icon={GraduationCap}
              title={hasFilters ? "Aucun élève ne correspond" : "Aucun élève pour le moment"}
              description={hasFilters ? "Modifiez la recherche ou les filtres." : "Créez le premier dossier élève."}
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr className="border-t border-border">
                    <TH>Élève</TH>
                    <TH>Classe</TH>
                    <TH>Naissance</TH>
                    <TH>Parent principal</TH>
                    <TH>Statut</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/eleves/${row.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                          <Avatar name={`${row.firstName} ${row.lastName}`} />
                          <span className="grid">
                            <span>
                              {row.lastName} {row.firstName}
                            </span>
                            <span className="text-xs font-normal text-muted-foreground">{row.matricule}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD>{row.className ? <Badge tone="primary">{row.className}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                      <TD className="text-muted-foreground">{row.birthDate ? formatDate(row.birthDate, "fr-FR", { dateStyle: "short" }) : "—"}</TD>
                      <TD>
                        {row.guardian ? (
                          <span className="grid">
                            <span>{row.guardian.name}</span>
                            <span className="text-xs text-muted-foreground">{row.guardian.phone ?? ""}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>{row.archived ? <Badge>Archivé</Badge> : <StatusBadge value={row.status} map={STUDENT_STATUS} />}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="grid gap-2 border-t border-border p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/eleves/${row.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-background">
                    <Avatar name={`${row.firstName} ${row.lastName}`} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-semibold">
                        {row.lastName} {row.firstName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.matricule}
                        {row.className ? ` · ${row.className}` : ""}
                      </span>
                    </span>
                    {row.archived ? <Badge>Archivé</Badge> : <StatusBadge value={row.status} map={STUDENT_STATUS} />}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination
          page={filters.page}
          pageSize={STUDENTS_PAGE_SIZE}
          total={total}
          basePath="/eleves"
          searchParams={{ q: filters.q, classe: filters.classId, statut: status, sexe: filters.sex }}
        />
      </Card>
    </div>
  );
}
