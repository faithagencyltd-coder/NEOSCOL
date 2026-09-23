import { BadgeCheck, IdCard, UserRoundPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { createStaffMember } from "@/features/staff/actions";
import { staffFormFields } from "@/features/staff/form";
import { listStaff, STAFF_PAGE_SIZE } from "@/features/staff/queries";
import { STAFF_STATUS } from "@/features/staff/schemas";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Personnel" };

export default async function StaffPage({ searchParams }: PageProps<"/personnel">) {
  const context = await requirePermission("staff.read");
  const params = await searchParams;
  const filters = { q: param(params, "q"), status: param(params, "statut"), kind: param(params, "type"), page: pageParam(params) };
  const { rows, total } = await listStaff(context.organization.id, filters);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Administration</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Personnel</h1>
          <p className="text-sm text-muted-foreground">
            {total} membre{total > 1 ? "s" : ""} · badges QR, comptes de connexion et pointage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(context, "staff_attendance.read") ? (
            <Button asChild variant="secondary">
              <Link href="/personnel/pointage">
                <BadgeCheck aria-hidden /> Pointage
              </Link>
            </Button>
          ) : null}
          {can(context, "staff.manage") ? (
            <QuickFormDialog
              title="Nouveau membre du personnel"
              description="Le matricule est attribué automatiquement."
              trigger={
                <Button>
                  <UserRoundPlus aria-hidden /> Ajouter
                </Button>
              }
              submitLabel="Créer la fiche"
              action={createStaffMember}
              fields={staffFormFields()}
            />
          ) : null}
        </div>
      </div>
      {params.supprime ? <Alert tone="success">Membre du personnel supprimé définitivement.</Alert> : null}
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Nom, matricule ou téléphone…"
            filters={[
              { name: "type", label: "Type", options: [{ value: "", label: "Tout le personnel" }, { value: "teacher", label: "Enseignants" }, { value: "staff", label: "Administratif" }] },
              {
                name: "statut",
                label: "Statut",
                options: [
                  { value: "", label: "Tous statuts" },
                  { value: "active", label: "Actifs" },
                  { value: "inactive", label: "Désactivés" },
                  { value: "withdrawn", label: "Retirés" },
                  { value: "archived", label: "Archivés" },
                ],
              },
            ]}
          />
        </Suspense>
        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState icon={Users} title={filters.q ? "Aucun résultat" : "Aucun membre du personnel"} />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr className="border-t border-border">
                    <TH>Nom</TH>
                    <TH>Matricule</TH>
                    <TH>Fonction</TH>
                    <TH>Badge</TH>
                    <TH>Compte</TH>
                    <TH>Statut</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link href={`/personnel/${row.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                          <Avatar name={`${row.first_name} ${row.last_name}`} photoId={row.photo_path} />
                          <span>
                            {row.last_name} {row.first_name}
                          </span>
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs">{row.employee_number}</TD>
                      <TD>
                        <span className="grid">
                          <span>{row.job_title ?? "—"}</span>
                          {row.is_teacher ? <span className="text-xs text-primary">Enseignant</span> : null}
                        </span>
                      </TD>
                      <TD>
                        {row.staff_badges.some((b) => b.status === "active") ? (
                          <Badge tone="success">
                            <IdCard className="size-3.5" aria-hidden /> Actif
                          </Badge>
                        ) : (
                          <Badge>Aucun</Badge>
                        )}
                      </TD>
                      <TD>{row.user_id ? <Badge tone="info">Oui</Badge> : <Badge>Non</Badge>}</TD>
                      <TD>{row.archived_at ? <Badge>Archivé</Badge> : <StatusBadge value={row.status} map={STAFF_STATUS} />}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="grid gap-2 border-t border-border p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/personnel/${row.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Avatar name={`${row.first_name} ${row.last_name}`} photoId={row.photo_path} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-semibold">
                        {row.last_name} {row.first_name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.employee_number} · {row.job_title ?? "—"}
                      </span>
                    </span>
                    {row.archived_at ? <Badge>Archivé</Badge> : <StatusBadge value={row.status} map={STAFF_STATUS} />}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination
          page={filters.page}
          pageSize={STAFF_PAGE_SIZE}
          total={total}
          basePath="/personnel"
          searchParams={{ q: filters.q, statut: filters.status, type: filters.kind }}
        />
      </Card>
    </div>
  );
}
