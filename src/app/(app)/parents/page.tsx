import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { GUARDIANS_PAGE_SIZE, listGuardians } from "@/features/guardians/queries";
import { requirePermission } from "@/lib/auth/guards";
import { pageParam, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Parents et tuteurs" };

export default async function GuardiansPage({ searchParams }: PageProps<"/parents">) {
  const context = await requirePermission("guardians.read");
  const params = await searchParams;
  const filters = { q: param(params, "q"), page: pageParam(params) };
  const { rows, total } = await listGuardians(context.organization.id, filters);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Scolarité</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Parents et tuteurs</h1>
        <p className="text-sm text-muted-foreground">
          {total} fiche{total > 1 ? "s" : ""} · les parents sont créés depuis le dossier de l&apos;élève ou l&apos;inscription.
        </p>
      </div>
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar placeholder="Nom, téléphone ou e-mail…" />
        </Suspense>
        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState icon={Users} title={filters.q ? "Aucun parent ne correspond" : "Aucun parent enregistré"} />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr className="border-t border-border">
                    <TH>Parent / tuteur</TH>
                    <TH>Contact</TH>
                    <TH>Enfants</TH>
                    <TH>Portail</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((row) => {
                    const children = row.student_guardians.filter((sg) => sg.student && !sg.student.archived_at);
                    return (
                      <TR key={row.id}>
                        <TD>
                          <Link href={`/parents/${row.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                            <Avatar name={`${row.first_name} ${row.last_name}`} />
                            <span className="grid">
                              <span>
                                {row.last_name} {row.first_name}
                              </span>
                              <span className="text-xs font-normal text-muted-foreground">{row.profession ?? ""}</span>
                            </span>
                          </Link>
                        </TD>
                        <TD>
                          <span className="grid">
                            <span>{row.phone ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">{row.email ?? ""}</span>
                          </span>
                        </TD>
                        <TD>
                          <span className="flex flex-wrap gap-1">
                            {children.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                            {children.map((sg) => (
                              <Badge key={sg.student!.id} tone="primary">
                                {sg.student!.first_name} {sg.student!.last_name}
                              </Badge>
                            ))}
                          </span>
                        </TD>
                        <TD>{row.user_id ? <Badge tone="info">Actif</Badge> : <Badge>Non activé</Badge>}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <ul className="grid gap-2 border-t border-border p-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/parents/${row.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Avatar name={`${row.first_name} ${row.last_name}`} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate font-semibold">
                        {row.last_name} {row.first_name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.phone ?? "—"} · {row.student_guardians.length} enfant(s)
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination page={filters.page} pageSize={GUARDIANS_PAGE_SIZE} total={total} basePath="/parents" searchParams={{ q: filters.q }} />
      </Card>
    </div>
  );
}
