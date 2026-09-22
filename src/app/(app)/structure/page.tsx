import { CalendarRange, Layers, Library, Lock, LockOpen, School, Star } from "lucide-react";
import type { Metadata } from "next";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  createAcademicYear,
  createLevel,
  createPeriod,
  createProgram,
  createRoom,
  createSubject,
  setCurrentYear,
  setPeriodLocked,
} from "@/features/academic/actions";
import { getAcademicYears, getLevels, getPeriods, getPrograms, getRooms, getSubjects } from "@/features/academic/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { options, PERIOD_TYPE, PROGRAM_KIND } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Structure académique" };

const TABS = [
  { key: "annees", label: "Années et périodes", href: "?onglet=annees" },
  { key: "niveaux", label: "Niveaux", href: "?onglet=niveaux" },
  { key: "filieres", label: "Filières et formations", href: "?onglet=filieres" },
  { key: "matieres", label: "Matières et modules", href: "?onglet=matieres" },
  { key: "salles", label: "Salles", href: "?onglet=salles" },
];

const short = (d: string) => formatDate(d, "fr-FR", { dateStyle: "medium" });

export default async function StructurePage({ searchParams }: PageProps<"/structure">) {
  const context = await requirePermission("academic.read");
  const organizationId = context.organization.id;
  const requested = param(await searchParams, "onglet");
  const active = TABS.some((t) => t.key === requested) ? requested! : "annees";
  const manage = can(context, "academic.manage");

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Scolarité</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Structure académique</h1>
        <p className="text-sm text-muted-foreground">
          Années scolaires, périodes d&apos;évaluation, niveaux, filières, formations, matières et salles.
        </p>
      </div>
      <TabNav tabs={TABS} active={active} label="Rubriques de la structure" />
      {active === "annees" ? <YearsSection organizationId={organizationId} manage={manage} canLock={can(context, "periods.lock")} /> : null}
      {active === "niveaux" ? <LevelsSection organizationId={organizationId} manage={manage} /> : null}
      {active === "filieres" ? <ProgramsSection organizationId={organizationId} manage={manage} /> : null}
      {active === "matieres" ? <SubjectsSection organizationId={organizationId} manage={manage} /> : null}
      {active === "salles" ? <RoomsSection organizationId={organizationId} manage={manage} /> : null}
    </div>
  );
}

async function YearsSection({ organizationId, manage, canLock }: { organizationId: string; manage: boolean; canLock: boolean }) {
  const years = await getAcademicYears(organizationId);
  const periods = await Promise.all(years.map((y) => getPeriods(organizationId, y.id)));
  return (
    <div className="grid gap-4">
      {manage ? (
        <div className="flex justify-end">
          <QuickFormDialog
            title="Nouvelle année scolaire"
            triggerLabel="Nouvelle année"
            action={createAcademicYear}
            fields={[
              { name: "name", label: "Nom", required: true, placeholder: "2027-2028", wide: true },
              { name: "starts_on", label: "Début", type: "date", required: true },
              { name: "ends_on", label: "Fin", type: "date", required: true },
            ]}
          />
        </div>
      ) : null}
      {years.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState icon={CalendarRange} title="Aucune année scolaire" description="Créez l'année en cours pour commencer." />
          </CardContent>
        </Card>
      ) : null}
      {years.map((year, index) => (
        <Card key={year.id}>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle className="flex items-center gap-2">
                Année {year.name} {year.is_current ? <Badge tone="success">Année courante</Badge> : null}
              </CardTitle>
              <CardDescription>
                Du {short(year.starts_on)} au {short(year.ends_on)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {manage && !year.is_current ? (
                <ConfirmAction
                  trigger={
                    <Button variant="secondary" size="sm">
                      <Star aria-hidden /> Définir comme courante
                    </Button>
                  }
                  title={`Faire de ${year.name} l'année courante ?`}
                  description="Les listes, inscriptions et tableaux de bord utiliseront cette année par défaut."
                  confirmLabel="Confirmer"
                  action={setCurrentYear}
                  fields={{ year_id: year.id }}
                />
              ) : null}
              {manage ? (
                <QuickFormDialog
                  title={`Nouvelle période — ${year.name}`}
                  triggerLabel="Ajouter une période"
                  action={createPeriod}
                  hidden={{ academic_year_id: year.id }}
                  fields={[
                    { name: "name", label: "Nom", required: true, placeholder: "1er trimestre" },
                    { name: "type", label: "Type", type: "select", required: true, options: options(PERIOD_TYPE), defaultValue: "trimester" },
                    { name: "sequence", label: "Ordre", type: "number", required: true, min: 1, defaultValue: String((periods[index]?.length ?? 0) + 1) },
                    { name: "starts_on", label: "Début", type: "date", required: true },
                    { name: "ends_on", label: "Fin", type: "date", required: true },
                  ]}
                />
              ) : null}
            </div>
          </CardHeader>
          {(periods[index] ?? []).length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">Aucune période définie (trimestres, semestres, sessions…).</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Période</TH>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH>Notes</TH>
                </tr>
              </THead>
              <tbody>
                {(periods[index] ?? []).map((period) => (
                  <TR key={period.id}>
                    <TD className="font-semibold">{period.name}</TD>
                    <TD className="text-muted-foreground">{PERIOD_TYPE[period.type]}</TD>
                    <TD className="text-muted-foreground">
                      {short(period.starts_on)} → {short(period.ends_on)}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        {period.is_locked ? <Badge tone="warning">Verrouillée</Badge> : <Badge tone="success">Ouverte</Badge>}
                        {canLock ? (
                          <ConfirmAction
                            trigger={
                              <Button variant="ghost" size="sm" aria-label={period.is_locked ? "Déverrouiller" : "Verrouiller"}>
                                {period.is_locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
                              </Button>
                            }
                            title={period.is_locked ? "Déverrouiller la période ?" : "Verrouiller la période ?"}
                            description={
                              period.is_locked
                                ? "Les enseignants pourront de nouveau modifier les notes."
                                : "Plus aucune note ni évaluation ne pourra être ajoutée ou modifiée sur cette période."
                            }
                            confirmLabel={period.is_locked ? "Déverrouiller" : "Verrouiller"}
                            action={setPeriodLocked}
                            fields={{ period_id: period.id, lock: period.is_locked ? "false" : "true" }}
                          />
                        ) : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ))}
    </div>
  );
}

async function LevelsSection({ organizationId, manage }: { organizationId: string; manage: boolean }) {
  const levels = await getLevels(organizationId);
  return (
    <SimpleList
      title="Niveaux"
      description="Ex. CP, 6e, Terminale, Licence 1, Niveau 1…"
      empty={{ icon: Layers, title: "Aucun niveau" }}
      action={
        manage ? (
          <QuickFormDialog
            title="Nouveau niveau"
            action={createLevel}
            fields={[
              { name: "name", label: "Nom", required: true, placeholder: "Sixième" },
              { name: "short_name", label: "Abréviation", placeholder: "6e" },
              { name: "cycle", label: "Cycle", placeholder: "Collège" },
              { name: "sequence", label: "Ordre", type: "number", required: true, min: 1, defaultValue: String(levels.length + 1) },
            ]}
          />
        ) : null
      }
      headers={["Ordre", "Niveau", "Abréviation", "Cycle"]}
      rows={levels.map((l) => ({ key: l.id, cells: [String(l.sequence), l.name, l.short_name ?? "—", l.cycle ?? "—"] }))}
    />
  );
}

async function ProgramsSection({ organizationId, manage }: { organizationId: string; manage: boolean }) {
  const programs = await getPrograms(organizationId);
  return (
    <SimpleList
      title="Filières et formations"
      description="Filières d'enseignement, formations professionnelles et diplômes."
      empty={{ icon: Library, title: "Aucune filière ni formation" }}
      action={
        manage ? (
          <QuickFormDialog
            title="Nouvelle filière ou formation"
            action={createProgram}
            fields={[
              { name: "name", label: "Nom", required: true, wide: true },
              { name: "code", label: "Code", required: true, placeholder: "ELEC" },
              { name: "kind", label: "Type", type: "select", required: true, options: options(PROGRAM_KIND), defaultValue: "track" },
              { name: "duration_hours", label: "Durée (heures)", type: "number", min: 1 },
              { name: "description", label: "Description", type: "textarea" },
            ]}
          />
        ) : null
      }
      headers={["Code", "Nom", "Type", "Durée"]}
      rows={programs.map((p) => ({
        key: p.id,
        cells: [p.code, p.name, PROGRAM_KIND[p.kind] ?? p.kind, p.duration_hours ? `${p.duration_hours} h` : "—"],
      }))}
    />
  );
}

async function SubjectsSection({ organizationId, manage }: { organizationId: string; manage: boolean }) {
  const [subjects, programs] = await Promise.all([getSubjects(organizationId), getPrograms(organizationId)]);
  return (
    <SimpleList
      title="Matières et modules"
      description="Les coefficients et enseignants se définissent par classe."
      empty={{ icon: School, title: "Aucune matière" }}
      action={
        manage ? (
          <QuickFormDialog
            title="Nouvelle matière ou module"
            action={createSubject}
            fields={[
              { name: "name", label: "Nom", required: true, wide: true },
              { name: "code", label: "Code", required: true, placeholder: "MATH" },
              { name: "kind", label: "Type", type: "select", required: true, options: [{ value: "subject", label: "Matière" }, { value: "module", label: "Module" }], defaultValue: "subject" },
              { name: "program_id", label: "Filière / formation", type: "select", options: programs.map((p) => ({ value: p.id, label: p.name })) },
              { name: "credits", label: "Crédits", type: "number", min: 0, step: "0.5" },
            ]}
          />
        ) : null
      }
      headers={["Code", "Nom", "Type", "Filière / formation"]}
      rows={subjects.map((s) => ({
        key: s.id,
        cells: [s.code, s.name, s.kind === "module" ? "Module" : "Matière", s.program?.name ?? "—"],
      }))}
    />
  );
}

async function RoomsSection({ organizationId, manage }: { organizationId: string; manage: boolean }) {
  const rooms = await getRooms(organizationId);
  return (
    <SimpleList
      title="Salles"
      empty={{ icon: School, title: "Aucune salle" }}
      action={
        manage ? (
          <QuickFormDialog
            title="Nouvelle salle"
            action={createRoom}
            fields={[
              { name: "name", label: "Nom", required: true },
              { name: "building", label: "Bâtiment" },
              { name: "capacity", label: "Capacité", type: "number", min: 1 },
            ]}
          />
        ) : null
      }
      headers={["Salle", "Bâtiment", "Capacité"]}
      rows={rooms.map((r) => ({ key: r.id, cells: [r.name, r.building ?? "—", r.capacity ? String(r.capacity) : "—"] }))}
    />
  );
}

function SimpleList({
  title,
  description,
  action,
  headers,
  rows,
  empty,
}: {
  title: string;
  description?: string;
  action: React.ReactNode;
  headers: string[];
  rows: { key: string; cells: string[] }[];
  empty: { icon: typeof School; title: string };
}) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent>
          <EmptyState icon={empty.icon} title={empty.title} />
        </CardContent>
      ) : (
        <Table>
          <THead>
            <tr className="border-t border-border">
              {headers.map((h) => (
                <TH key={h}>{h}</TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {rows.map((row) => (
              <TR key={row.key}>
                {row.cells.map((cell, i) => (
                  <TD key={i} className={i === 1 ? "font-semibold" : "text-muted-foreground"}>
                    {cell}
                  </TD>
                ))}
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
