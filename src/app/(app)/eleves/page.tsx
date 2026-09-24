import { Archive, GraduationCap, History, Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav, TabPanel, type TabLink } from "@/components/shared/tab-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { getClasses, getCurrentYear } from "@/features/academic/queries";
import { getStudentStatusCounts } from "@/features/migration/queries";
import { listStudents, STUDENTS_PAGE_SIZE } from "@/features/students/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { STUDENT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid, pageParam, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Élèves" };

const VIEWS = ["actifs", "anciens", "diplomes", "transferes", "archives"] as const;
type View = (typeof VIEWS)[number];

export default async function StudentsPage({ searchParams }: PageProps<"/eleves">) {
  const context = await requirePermission("students.read");
  const v = vocabularyFor(context.organization.type);
  const organizationId = context.organization.id;
  const params = await searchParams;
  const year = await getCurrentYear(organizationId);
  const classes = year ? await getClasses(organizationId, year.id) : [];

  // Onglets : élèves actuels, anciens (tous statuts de sortie), diplômés, transférés, archivés.
  const legacyArchive = param(params, "statut") === "archive";
  const requestedView = param(params, "vue") ?? (legacyArchive ? "archives" : "actifs");
  const view = (VIEWS as readonly string[]).includes(requestedView) ? (requestedView as View) : "actifs";
  const viewStatuses: Record<View, string[] | undefined> = {
    actifs: ["prospect", "active", "inactive"],
    anciens: ["alumni", "graduated", "transferred", "withdrawn"],
    diplomes: ["graduated"],
    transferes: ["transferred"],
    archives: undefined,
  };
  const status = legacyArchive ? undefined : param(params, "statut");
  const classe = param(params, "classe");
  const filters = {
    q: param(params, "q"),
    classId: isUuid(classe) ? classe : undefined,
    statuses: viewStatuses[view],
    status: status && (viewStatuses[view] ?? []).includes(status) ? status : undefined,
    sex: param(params, "sexe"),
    archived: view === "archives",
    page: pageParam(params),
  };
  const counts = await getStudentStatusCounts(organizationId);
  const tabHref = (key: View) => (key === "actifs" ? "/eleves" : `/eleves?vue=${key}`);
  const tabs: TabLink[] = [
    { key: "actifs", label: `${v.students} actifs`, href: tabHref("actifs"), count: counts.current },
    { key: "anciens", label: `Anciens ${v.students.toLowerCase()}`, href: tabHref("anciens"), count: counts.former },
    { key: "diplomes", label: "Diplômés", href: tabHref("diplomes"), count: counts.graduated },
    { key: "transferes", label: "Transférés", href: tabHref("transferes"), count: counts.transferred },
    { key: "archives", label: "Archivés", href: tabHref("archives"), count: counts.archived },
  ];
  const canImport = can(context, "students.import");
  const { rows, total } = await listStudents(organizationId, year?.id ?? null, filters);
  const hasFilters = Boolean(filters.q || filters.classId || filters.status || filters.sex);
  const former = view !== "actifs";

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">Scolarité</p>
          <h1 className="text-2xl font-semibold sm:text-[26px]">{v.students}</h1>
          <p className="text-sm text-muted-foreground">
            {total} dossier{total > 1 ? "s" : ""}
            {year ? ` · année ${year.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/donnees-historiques/importer">
                  <Upload aria-hidden /> Importer des anciens {v.students.toLowerCase()}
                </Link>
              </Button>
              {can(context, "students.create") ? (
                <Button asChild variant="secondary">
                  <Link href="/donnees-historiques/ancien-eleve">
                    <History aria-hidden /> Ajouter un ancien {v.student.toLowerCase()}
                  </Link>
                </Button>
              ) : null}
            </>
          ) : null}
          {can(context, "students.create") ? (
            <Button asChild>
              <Link href="/eleves/nouveau">
                <Plus aria-hidden /> Nouvel {v.student.toLowerCase()}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <TabNav tabs={tabs} active={view} label={`Catégories d'${v.students.toLowerCase()}`} />

      <TabPanel active={view}>
      <Card className="overflow-hidden">
        <Suspense>
          <FilterBar
            placeholder="Nom, prénom ou matricule…"
            filters={[
              ...(view === "actifs"
                ? [{ name: "classe", label: `Toutes les ${v.classes.toLowerCase()}`, options: classes.map((c) => ({ value: c.id, label: c.name })) }]
                : []),
              ...((viewStatuses[view]?.length ?? 0) > 1
                ? [
                    {
                      name: "statut",
                      label: "Tous les statuts",
                      options: viewStatuses[view]!.map((value) => ({ value, label: STUDENT_STATUS[value]?.label ?? value })),
                    },
                  ]
                : []),
              v.family === "school"
                ? { name: "sexe", label: "Filles et garçons", options: [{ value: "F", label: "Filles" }, { value: "M", label: "Garçons" }] }
                : { name: "sexe", label: "Femmes et hommes", options: [{ value: "F", label: "Femmes" }, { value: "M", label: "Hommes" }] },
            ]}
          />
        </Suspense>

        {rows.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              icon={view === "archives" ? Archive : GraduationCap}
              title={hasFilters ? `Aucun ${v.student.toLowerCase()} ne correspond` : former ? "Aucun dossier dans cette catégorie" : `Aucun ${v.student.toLowerCase()} pour le moment`}
              description={
                hasFilters
                  ? "Modifiez la recherche ou les filtres."
                  : former
                    ? canImport
                      ? "Importez l'historique de l'établissement (Excel ou CSV) ou ajoutez un ancien dossier manuellement."
                      : "Les anciens dossiers apparaîtront ici."
                    : `Créez le premier dossier ${v.student.toLowerCase()}.`
              }
              action={
                former && canImport && !hasFilters ? (
                  <Button asChild size="sm">
                    <Link href="/donnees-historiques/importer">
                      <Upload aria-hidden /> Importer des données historiques
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr className="border-t border-border">
                    <TH>{v.student}</TH>
                    <TH>{former ? "Période" : v.klass}</TH>
                    <TH>Naissance</TH>
                    <TH>{v.family === "school" ? "Parent principal" : "Contact / responsable"}</TH>
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
                            <span className="text-xs font-normal text-muted-foreground">
                              {row.matricule}
                              {row.legacyMatricule ? ` · ancien : ${row.legacyMatricule}` : ""}
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        {row.className && !former ? (
                          <Badge tone="primary">{row.className}</Badge>
                        ) : row.entryYear || row.exitYear ? (
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {row.entryYear ?? "…"} – {row.exitYear ?? "…"}
                          </span>
                        ) : row.className ? (
                          <Badge>{row.className}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
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
          searchParams={{ q: filters.q, classe: filters.classId, statut: filters.status, sexe: filters.sex, vue: view === "actifs" ? undefined : view }}
        />
      </Card>
      </TabPanel>
    </div>
  );
}
