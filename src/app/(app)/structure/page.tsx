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
  addCommonLyceeSeries,
  createAcademicYear,
  createLevel,
  createPeriod,
  createProgram,
  createRoom,
  createSubject,
  setCurrentYear,
  setPeriodLocked,
  setProgramActive,
  updateProgram,
  updateSubject,
} from "@/features/academic/actions";
import { SchoolLevelsCard } from "@/features/academic/components/school-levels-card";
import {
  LYCEE_TRACK_LABELS,
  programVisible,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVELS,
  schoolConfigOf,
  type LyceeTrack,
  type SchoolConfig,
  type SchoolLevel,
} from "@/features/academic/school";
import { getAcademicYears, getLevels, getPeriods, getPrograms, getRooms, getSubjects } from "@/features/academic/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { options, PERIOD_TYPE, PROGRAM_KIND } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
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
  const school = schoolConfigOf(context.organization.settings);
  // Module Scolaire : l'onglet des séries n'existe que si le lycée est activé.
  const tabs = school
    ? TABS.filter((t) => t.key !== "filieres" || school.levels.includes("lycee")).map((t) =>
        t.key === "filieres" ? { ...t, label: "Séries et filières (lycée)" } : t.key === "matieres" ? { ...t, label: "Matières" } : t,
      )
    : TABS;
  const params = await searchParams;
  const requested = param(params, "onglet");
  const active = tabs.some((t) => t.key === requested) ? requested! : "annees";
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
      <TabNav tabs={tabs} active={active} label="Rubriques de la structure" />
      {active === "annees" ? <YearsSection organizationId={organizationId} manage={manage} canLock={can(context, "periods.lock")} /> : null}
      {active === "niveaux" ? (
        <>
          {school ? <SchoolLevelsCard config={school} canEdit={can(context, "settings.manage")} /> : null}
          <LevelsSection organizationId={organizationId} manage={manage} school={school} />
        </>
      ) : null}
      {active === "filieres" ? <ProgramsSection organizationId={organizationId} manage={manage} school={school} /> : null}
      {active === "matieres" ? (
        <SubjectsSection organizationId={organizationId} manage={manage} school={school} filter={param(params, "niveau")} />
      ) : null}
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

async function LevelsSection({ organizationId, manage, school }: { organizationId: string; manage: boolean; school: SchoolConfig | null }) {
  const levels = await getLevels(organizationId);
  const cycleCell = (l: (typeof levels)[number]) => {
    if (!school || !l.school_cycle) return l.cycle ?? "—";
    const enabled = school.levels.includes(l.school_cycle as SchoolLevel);
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={enabled ? "primary" : "neutral"}>{SCHOOL_LEVEL_LABELS[l.school_cycle as SchoolLevel]}</Badge>
        {enabled ? null : <span className="text-xs">niveau désactivé (conservé)</span>}
      </span>
    );
  };
  return (
    <SimpleList
      title="Niveaux"
      description={school ? "Classes de chaque niveau scolaire activé (ex. PS, CP, 6e, Terminale)." : "Ex. CP, 6e, Terminale, Licence 1, Niveau 1…"}
      empty={{ icon: Layers, title: "Aucun niveau" }}
      action={
        manage ? (
          <QuickFormDialog
            title="Nouveau niveau"
            action={createLevel}
            fields={
              school
                ? [
                    { name: "name", label: "Nom", required: true, placeholder: "Sixième" },
                    { name: "short_name", label: "Abréviation", placeholder: "6e" },
                    {
                      name: "school_cycle",
                      label: "Niveau scolaire",
                      type: "select",
                      required: true,
                      options: school.levels.map((l) => ({ value: l, label: SCHOOL_LEVEL_LABELS[l] })),
                      defaultValue: school.levels[0],
                    },
                    { name: "sequence", label: "Ordre", type: "number", required: true, min: 1, defaultValue: String(levels.length + 1) },
                  ]
                : [
                    { name: "name", label: "Nom", required: true, placeholder: "Sixième" },
                    { name: "short_name", label: "Abréviation", placeholder: "6e" },
                    { name: "cycle", label: "Cycle", placeholder: "Collège" },
                    { name: "sequence", label: "Ordre", type: "number", required: true, min: 1, defaultValue: String(levels.length + 1) },
                  ]
            }
          />
        ) : null
      }
      headers={["Ordre", "Niveau", "Abréviation", school ? "Niveau scolaire" : "Cycle"]}
      rows={levels.map((l) => ({ key: l.id, cells: [String(l.sequence), l.name, l.short_name ?? "—", cycleCell(l)] }))}
    />
  );
}

async function ProgramsSection({ organizationId, manage, school }: { organizationId: string; manage: boolean; school: SchoolConfig | null }) {
  const programs = await getPrograms(organizationId);
  if (!school) {
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
  // Module Scolaire : séries du lycée (général / technique), configurables par l'établissement.
  const tracks = school.lyceeTracks;
  const trackOf = (p: (typeof programs)[number]) => (p.track_type as LyceeTrack | null) ?? null;
  return (
    <SimpleList
      title="Séries et filières du lycée"
      description={`${tracks.map((t) => LYCEE_TRACK_LABELS[t]).join(" et ")} : n'activez que les séries que vous utilisez. Désactiver une série la retire des listes sans rien supprimer.`}
      empty={{ icon: Library, title: "Aucune série", description: "Ajoutez vos séries une à une, ou les séries courantes pour les modifier ensuite." }}
      action={
        manage ? (
          <div className="flex flex-wrap gap-2">
            {tracks.map((track) => (
              <ConfirmAction
                key={track}
                trigger={
                  <Button size="sm" variant="secondary">
                    Séries courantes ({LYCEE_TRACK_LABELS[track].replace("Lycée ", "")})
                  </Button>
                }
                title={`Ajouter les séries courantes du ${LYCEE_TRACK_LABELS[track].toLowerCase()} ?`}
                description="Seules les séries absentes sont ajoutées. Vous pourrez ensuite les renommer ou désactiver celles que vous n'utilisez pas."
                confirmLabel="Ajouter"
                action={addCommonLyceeSeries}
                fields={{ track_type: track }}
              />
            ))}
            <QuickFormDialog
              title="Nouvelle série ou filière"
              triggerLabel="Nouvelle série ou filière"
              action={createProgram}
              hidden={{ kind: "track" }}
              fields={[
                { name: "name", label: "Nom", required: true, wide: true, placeholder: "F4 — Génie civil" },
                { name: "code", label: "Code", required: true, placeholder: "F4" },
                {
                  name: "track_type",
                  label: "Enseignement",
                  type: "select",
                  required: true,
                  options: tracks.map((t) => ({ value: t, label: LYCEE_TRACK_LABELS[t] })),
                  defaultValue: tracks[0],
                },
                { name: "description", label: "Description", type: "textarea" },
              ]}
            />
          </div>
        ) : null
      }
      headers={manage ? ["Code", "Série / filière", "Enseignement", "Statut", ""] : ["Code", "Série / filière", "Enseignement", "Statut"]}
      rows={programs.map((p) => {
        const visible = programVisible(p, school);
        const cells: React.ReactNode[] = [
          p.code,
          p.name,
          trackOf(p) ? LYCEE_TRACK_LABELS[trackOf(p)!] : (PROGRAM_KIND[p.kind] ?? p.kind),
          p.is_active ? (
            visible ? <Badge tone="success">Active</Badge> : <Badge>Enseignement non activé</Badge>
          ) : (
            <Badge>Désactivée</Badge>
          ),
        ];
        if (manage) {
          cells.push(
            <span className="flex justify-end gap-1.5">
              <QuickFormDialog
                title={`Modifier ${p.code}`}
                trigger={
                  <Button size="sm" variant="ghost">
                    Modifier
                  </Button>
                }
                action={updateProgram}
                hidden={{ id: p.id }}
                fields={[
                  { name: "name", label: "Nom", required: true, wide: true, defaultValue: p.name },
                  { name: "code", label: "Code", required: true, defaultValue: p.code },
                  { name: "description", label: "Description", type: "textarea", defaultValue: p.description ?? "" },
                ]}
              />
              <ConfirmAction
                trigger={
                  <Button size="sm" variant={p.is_active ? "ghost" : "secondary"}>
                    {p.is_active ? "Désactiver" : "Activer"}
                  </Button>
                }
                title={p.is_active ? `Désactiver ${p.code} ?` : `Activer ${p.code} ?`}
                description={p.is_active ? "Elle ne sera plus proposée pour les nouvelles classes et matières. Les classes existantes sont conservées." : undefined}
                confirmLabel={p.is_active ? "Désactiver" : "Activer"}
                action={setProgramActive}
                fields={{ id: p.id, active: p.is_active ? "0" : "1" }}
              />
            </span>,
          );
        }
        return { key: p.id, cells, muted: !p.is_active };
      })}
    />
  );
}

async function SubjectsSection({
  organizationId,
  manage,
  school,
  filter,
}: {
  organizationId: string;
  manage: boolean;
  school: SchoolConfig | null;
  filter?: string;
}) {
  const [subjects, programs] = await Promise.all([getSubjects(organizationId), getPrograms(organizationId)]);
  if (!school) {
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
  // Module Scolaire : matières rattachées à des niveaux (vide = tous) et éventuellement à une série.
  const series = programs.filter((p) => p.track_type && programVisible(p, school));
  const level = school.levels.find((l) => l === filter) ?? null;
  const shown = subjects.filter((s) => {
    const cycles = (s.school_cycles ?? []) as SchoolLevel[];
    if (level) return cycles.length === 0 || cycles.includes(level);
    return cycles.length === 0 || cycles.some((c) => school.levels.includes(c));
  });
  const levelFields = school.levels.map((l) => ({ name: `cycle_${l}`, label: `Niveau : ${SCHOOL_LEVEL_LABELS[l]}`, type: "checkbox" as const }));
  const seriesOptions = series.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const levelsCell = (cycles: string[]) =>
    cycles.length === 0 ? (
      <span className="text-xs">Tous les niveaux</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {SCHOOL_LEVELS.filter((l) => cycles.includes(l)).map((l) => (
          <Badge key={l} tone={school.levels.includes(l) ? "primary" : "neutral"}>
            {SCHOOL_LEVEL_LABELS[l]}
          </Badge>
        ))}
      </span>
    );
  return (
    <div className="grid gap-3">
      <nav aria-label="Filtrer par niveau" className="flex flex-wrap gap-1.5 text-xs">
        {[{ key: null, label: "Tous les niveaux activés" }, ...school.levels.map((l) => ({ key: l, label: SCHOOL_LEVEL_LABELS[l] }))].map((f) => (
          <a
            key={f.key ?? "tous"}
            href={f.key ? `?onglet=matieres&niveau=${f.key}` : "?onglet=matieres"}
            aria-current={level === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 font-medium transition-colors",
              level === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary",
            )}
          >
            {f.label}
          </a>
        ))}
      </nav>
      <SimpleList
        title="Matières"
        description="Chaque matière s'applique à des niveaux (aucun coché = tous) et, au lycée, éventuellement à une série. Coefficients et enseignants : par classe."
        empty={{ icon: School, title: "Aucune matière pour ce niveau" }}
        action={
          manage ? (
            <QuickFormDialog
              title="Nouvelle matière"
              triggerLabel="Nouvelle matière"
              description="Cochez les niveaux concernés (aucun : tous les niveaux)."
              action={createSubject}
              hidden={{ kind: "subject" }}
              fields={[
                { name: "name", label: "Nom", required: true, wide: true },
                { name: "code", label: "Code", required: true, placeholder: "MATH" },
                ...(seriesOptions.length ? [{ name: "program_id", label: "Série / filière (lycée)", type: "select" as const, options: seriesOptions, hint: "Vide : toutes les séries" }] : []),
                ...levelFields,
              ]}
            />
          ) : null
        }
        headers={manage ? ["Code", "Matière", "Niveaux", "Série / filière", ""] : ["Code", "Matière", "Niveaux", "Série / filière"]}
        rows={shown.map((s) => {
          const cycles = (s.school_cycles ?? []) as string[];
          const cells: React.ReactNode[] = [s.code, s.name, levelsCell(cycles), s.program?.name ?? "—"];
          if (manage) {
            cells.push(
              <span className="flex justify-end">
                <QuickFormDialog
                  title={`Modifier ${s.code}`}
                  trigger={
                    <Button size="sm" variant="ghost">
                      Modifier
                    </Button>
                  }
                  action={updateSubject}
                  hidden={{ id: s.id }}
                  fields={[
                    { name: "name", label: "Nom", required: true, wide: true, defaultValue: s.name },
                    ...(seriesOptions.length
                      ? [{ name: "program_id", label: "Série / filière (lycée)", type: "select" as const, options: seriesOptions, defaultValue: s.program_id ?? undefined }]
                      : []),
                    ...levelFields.map((f) => ({ ...f, defaultValue: cycles.includes(f.name.replace("cycle_", "")) ? "true" : "" })),
                  ]}
                />
              </span>,
            );
          }
          return { key: s.id, cells };
        })}
      />
    </div>
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
  rows: { key: string; cells: React.ReactNode[]; muted?: boolean }[];
  empty: { icon: typeof School; title: string; description?: string };
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
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
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
              <TR key={row.key} className={row.muted ? "opacity-60" : undefined}>
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
