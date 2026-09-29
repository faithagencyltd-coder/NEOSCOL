import { Building2, GitBranch, Landmark, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { TabNav, TabPanel, type TabLink } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import {
  saveCycle,
  saveDepartment,
  saveFaculty,
  saveLevel,
  saveProgram,
  saveTrack,
  toggleDepartment,
  toggleFaculty,
  toggleProgram,
  toggleTrack,
} from "@/features/university/actions";
import { ToggleButton } from "@/features/university/components/toggle-button";
import { UniversityHeader } from "@/features/university/components/university-header";
import { FACULTY_KINDS, fmtCredits, TRACK_KINDS } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { person, teacherOptions, universityStructure } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Structure universitaire" };

type Opt = { value: string; label: string };
const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

function programFields(o: { faculties: Opt[]; departments: Opt[]; cycles: Opt[]; teachers: Opt[] }, v: Record<string, unknown> = {}, features: { faculties: boolean; departments: boolean }): QuickField[] {
  return [
    { name: "name", label: "Nom de la filière", required: true, defaultValue: val(v.name), placeholder: "Licence Informatique", wide: true },
    { name: "code", label: "Code", required: true, defaultValue: val(v.code), placeholder: "LINFO" },
    { name: "degree_title", label: "Diplôme préparé", defaultValue: val(v.degree_title), placeholder: "Licence en Informatique" },
    ...(features.faculties ? [{ name: "faculty_id", label: "Faculté / école", type: "select" as const, options: o.faculties, defaultValue: val(v.faculty_id) }] : []),
    ...(features.departments ? [{ name: "department_id", label: "Département", type: "select" as const, options: o.departments, defaultValue: val(v.department_id) }] : []),
    { name: "academic_cycle_id", label: "Cycle", type: "select", options: o.cycles, defaultValue: val(v.academic_cycle_id) },
    { name: "duration_years", label: "Durée (années)", type: "number", min: 1, max: 12, defaultValue: val(v.duration_years) },
    { name: "responsible_id", label: "Responsable de filière", type: "select", options: o.teachers, defaultValue: val(v.responsible_id), wide: true },
    { name: "admission_conditions", label: "Conditions d'admission", type: "textarea", defaultValue: val(v.admission_conditions), wide: true },
    { name: "syllabus", label: "Programme", type: "textarea", defaultValue: val(v.syllabus), wide: true },
    { name: "description", label: "Description", type: "textarea", defaultValue: val(v.description), wide: true },
  ];
}

export default async function UniversityStructurePage({ searchParams }: PageProps<"/universite/structure">) {
  const context = await requireUniversity(["academic.read"]);
  const organization = context.organization;
  const u = context.university;
  const manage = can(context, "academic.manage");
  const [data, teachers] = await Promise.all([universityStructure(organization.id), can(context, "staff.read") ? teacherOptions(organization.id) : Promise.resolve([])]);
  const opts = {
    faculties: data.faculties.filter((f) => f.is_active).map((f) => ({ value: f.id, label: f.name })),
    departments: data.departments.filter((d) => d.is_active).map((d) => ({ value: d.id, label: `${d.name}${d.faculty ? ` (${d.faculty.code})` : ""}` })),
    cycles: data.cycles.filter((c) => c.is_active).map((c) => ({ value: c.id, label: c.name })),
    teachers,
    programs: data.programs.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name })),
    levels: data.levels.map((l) => ({ value: l.id, label: l.name })),
  };
  const tabs: TabLink[] = [
    { key: "vue", label: "Vue d'ensemble", href: "?onglet=vue" },
    ...(u.features.faculties ? [{ key: "facultes", label: "Facultés / Écoles", href: "?onglet=facultes", count: data.faculties.length }] : []),
    ...(u.features.departments ? [{ key: "departements", label: "Départements", href: "?onglet=departements", count: data.departments.length }] : []),
    { key: "filieres", label: "Filières", href: "?onglet=filieres", count: data.programs.length },
    { key: "parcours", label: "Parcours et spécialités", href: "?onglet=parcours", count: data.tracks.length },
    { key: "cycles", label: "Cycles et niveaux", href: "?onglet=cycles", count: data.cycles.length },
  ];
  const requested = param(await searchParams, "onglet");
  const active = tabs.some((t) => t.key === requested) ? requested! : "vue";
  const features = { faculties: u.features.faculties, departments: u.features.departments };

  // Arborescence : faculté → département → filière → parcours (les niveaux facultatifs sont regroupés).
  const programsOf = (predicate: (p: (typeof data.programs)[number]) => boolean) => data.programs.filter((p) => p.is_active && predicate(p));
  const tracksOf = (programId: string) => data.tracks.filter((t) => t.program_id === programId && t.is_active);
  const ProgramNode = ({ p }: { p: (typeof data.programs)[number] }) => (
    <li className="grid gap-1">
      <Link href={`/universite/filieres/${p.id}`} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 font-medium hover:bg-surface-muted/70 hover:text-primary">
        <GitBranch className="size-4 text-primary" aria-hidden /> {p.name}
        {p.degree_title ? <span className="text-xs font-normal text-muted-foreground">· {p.degree_title}</span> : null}
      </Link>
      {tracksOf(p.id).length ? (
        <ul className="ml-7 flex flex-wrap gap-1.5">
          {tracksOf(p.id).map((t) => (
            <li key={t.id}>
              <Badge tone="neutral">{t.name}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Structure universitaire"
        description={`Établissement → ${u.features.faculties ? "Facultés / Écoles → " : ""}${u.features.departments ? "Départements → " : ""}Filières → Parcours → Cycles → Niveaux. Tout est défini librement par l'établissement.`}
      />
      <TabNav tabs={tabs} active={active} label="Sections de la structure" />
      <TabPanel active={active}>
        {active === "vue" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="size-5 text-primary" aria-hidden /> {organization.name}
              </CardTitle>
              <CardDescription>
                {data.programs.length} filière(s), {data.tracks.length} parcours, {data.cycles.length} cycle(s), {data.levels.length} niveau(x)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {u.features.faculties && data.faculties.length ? (
                data.faculties
                  .filter((f) => f.is_active)
                  .map((f) => (
                    <section key={f.id} className="grid gap-2 rounded-2xl border border-border p-4">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Building2 className="size-4 text-primary" aria-hidden /> {f.name} <Badge tone="info">{FACULTY_KINDS[f.kind]}</Badge>
                      </h3>
                      {u.features.departments
                        ? data.departments
                            .filter((d) => d.faculty_id === f.id && d.is_active)
                            .map((d) => (
                              <div key={d.id} className="ml-4 grid gap-1 border-l-2 border-primary/20 pl-4">
                                <p className="text-sm font-medium text-muted-foreground">{d.name}</p>
                                <ul className="grid gap-1">{programsOf((p) => p.department_id === d.id).map((p) => <ProgramNode key={p.id} p={p} />)}</ul>
                              </div>
                            ))
                        : null}
                      <ul className="ml-4 grid gap-1">{programsOf((p) => p.faculty_id === f.id && (!u.features.departments || !p.department_id)).map((p) => <ProgramNode key={p.id} p={p} />)}</ul>
                    </section>
                  ))
              ) : null}
              {programsOf((p) => !u.features.faculties || !p.faculty_id).length ? (
                <section className="grid gap-2 rounded-2xl border border-dashed border-border p-4">
                  <h3 className="font-semibold">{u.features.faculties ? "Filières rattachées directement à l'établissement" : "Filières"}</h3>
                  <ul className="grid gap-1">{programsOf((p) => !u.features.faculties || !p.faculty_id).map((p) => <ProgramNode key={p.id} p={p} />)}</ul>
                </section>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {active === "facultes" ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Facultés / Écoles</CardTitle>
                <CardDescription>Facultatif : un petit établissement peut fonctionner directement avec ses filières.</CardDescription>
              </div>
              {manage ? (
                <QuickFormDialog
                  title="Nouvelle faculté / école"
                  triggerLabel="Nouvelle faculté / école"
                  action={saveFaculty}
                  fields={[
                    { name: "name", label: "Nom", required: true, placeholder: "Faculté des Sciences", wide: true },
                    { name: "code", label: "Code", required: true, placeholder: "FS" },
                    { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(FACULTY_KINDS).map(([value, label]) => ({ value, label })), defaultValue: "faculte" },
                    { name: "dean_id", label: "Doyen / directeur", type: "select", options: teachers, wide: true },
                    { name: "description", label: "Description", type: "textarea", wide: true },
                  ]}
                />
              ) : null}
            </CardHeader>
            {data.faculties.length === 0 ? (
              <EmptyState icon={Building2} title="Aucune faculté" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Faculté / école</TH>
                    <TH>Type</TH>
                    <TH>Doyen / directeur</TH>
                    <TH>Filières</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.faculties.map((f) => (
                    <TR key={f.id} className={f.is_active ? undefined : "opacity-60"}>
                      <TD className="font-medium">
                        {f.name} <span className="text-xs text-muted-foreground">{f.code}</span>
                      </TD>
                      <TD>{FACULTY_KINDS[f.kind]}</TD>
                      <TD className="text-sm">{person(f.dean) ?? "—"}</TD>
                      <TD className="tabular-nums">{data.programs.filter((p) => p.faculty_id === f.id).length}</TD>
                      <TD className="text-right">
                        {manage ? (
                          <span className="flex justify-end gap-1">
                            <QuickFormDialog
                              title="Modifier la faculté"
                              action={saveFaculty}
                              hidden={{ id: f.id }}
                              fields={[
                                { name: "name", label: "Nom", required: true, defaultValue: f.name, wide: true },
                                { name: "code", label: "Code", required: true, defaultValue: f.code },
                                { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(FACULTY_KINDS).map(([value, label]) => ({ value, label })), defaultValue: f.kind },
                                { name: "dean_id", label: "Doyen / directeur", type: "select", options: teachers, defaultValue: f.dean?.id, wide: true },
                                { name: "description", label: "Description", type: "textarea", defaultValue: f.description ?? undefined, wide: true },
                              ]}
                              trigger={
                                <Button variant="ghost" size="sm" aria-label={`Modifier ${f.name}`}>
                                  <Pencil aria-hidden />
                                </Button>
                              }
                            />
                            <ToggleButton id={f.id} active={f.is_active} action={toggleFaculty} label="cette faculté" />
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        {active === "departements" ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Départements</CardTitle>
                <CardDescription>Faculté → Département → Filière (facultatif).</CardDescription>
              </div>
              {manage ? (
                <QuickFormDialog
                  title="Nouveau département"
                  triggerLabel="Nouveau département"
                  action={saveDepartment}
                  fields={[
                    { name: "name", label: "Nom", required: true, placeholder: "Département d'Informatique", wide: true },
                    { name: "code", label: "Code", required: true, placeholder: "DINFO" },
                    ...(u.features.faculties ? [{ name: "faculty_id", label: "Faculté / école", type: "select" as const, options: opts.faculties }] : []),
                    { name: "head_id", label: "Chef de département", type: "select", options: teachers, wide: true },
                    { name: "description", label: "Description", type: "textarea", wide: true },
                  ]}
                />
              ) : null}
            </CardHeader>
            {data.departments.length === 0 ? (
              <EmptyState icon={Building2} title="Aucun département" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Département</TH>
                    {u.features.faculties ? <TH>Faculté</TH> : null}
                    <TH>Chef de département</TH>
                    <TH>Filières</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.departments.map((d) => (
                    <TR key={d.id} className={d.is_active ? undefined : "opacity-60"}>
                      <TD className="font-medium">
                        {d.name} <span className="text-xs text-muted-foreground">{d.code}</span>
                      </TD>
                      {u.features.faculties ? <TD className="text-sm">{d.faculty?.name ?? "—"}</TD> : null}
                      <TD className="text-sm">{person(d.head) ?? "—"}</TD>
                      <TD className="tabular-nums">{data.programs.filter((p) => p.department_id === d.id).length}</TD>
                      <TD className="text-right">
                        {manage ? (
                          <span className="flex justify-end gap-1">
                            <QuickFormDialog
                              title="Modifier le département"
                              action={saveDepartment}
                              hidden={{ id: d.id }}
                              fields={[
                                { name: "name", label: "Nom", required: true, defaultValue: d.name, wide: true },
                                { name: "code", label: "Code", required: true, defaultValue: d.code },
                                ...(u.features.faculties ? [{ name: "faculty_id", label: "Faculté / école", type: "select" as const, options: opts.faculties, defaultValue: d.faculty_id ?? undefined }] : []),
                                { name: "head_id", label: "Chef de département", type: "select", options: teachers, defaultValue: d.head?.id, wide: true },
                                { name: "description", label: "Description", type: "textarea", defaultValue: d.description ?? undefined, wide: true },
                              ]}
                              trigger={
                                <Button variant="ghost" size="sm" aria-label={`Modifier ${d.name}`}>
                                  <Pencil aria-hidden />
                                </Button>
                              }
                            />
                            <ToggleButton id={d.id} active={d.is_active} action={toggleDepartment} label="ce département" />
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        {active === "filieres" ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Filières</CardTitle>
                <CardDescription>Créées librement : aucune liste imposée.</CardDescription>
              </div>
              {manage ? <QuickFormDialog title="Nouvelle filière" triggerLabel="Nouvelle filière" action={saveProgram} fields={programFields(opts, {}, features)} submitLabel="Créer la filière" /> : null}
            </CardHeader>
            {data.programs.length === 0 ? (
              <EmptyState icon={GitBranch} title="Aucune filière" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Filière</TH>
                    <TH>Diplôme préparé</TH>
                    {u.features.faculties ? <TH>Faculté</TH> : null}
                    {u.features.departments ? <TH>Département</TH> : null}
                    <TH>Responsable</TH>
                    <TH>Statut</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.programs.map((p) => (
                    <TR key={p.id} className={p.is_active ? undefined : "opacity-60"}>
                      <TD>
                        <Link href={`/universite/filieres/${p.id}`} className="font-medium hover:text-primary">
                          {p.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>
                      </TD>
                      <TD className="text-sm">
                        {p.degree_title ?? "—"}
                        {p.duration_years ? <span className="text-muted-foreground"> · {p.duration_years} an(s)</span> : null}
                      </TD>
                      {u.features.faculties ? <TD className="text-sm">{p.faculty?.code ?? "—"}</TD> : null}
                      {u.features.departments ? <TD className="text-sm">{p.department?.name ?? "—"}</TD> : null}
                      <TD className="text-sm">{person(p.responsible) ?? "—"}</TD>
                      <TD>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Désactivée</Badge>}</TD>
                      <TD className="text-right">
                        {manage ? (
                          <span className="flex justify-end gap-1">
                            <QuickFormDialog
                              title="Modifier la filière"
                              action={saveProgram}
                              hidden={{ id: p.id }}
                              fields={programFields(opts, p, features)}
                              trigger={
                                <Button variant="ghost" size="sm" aria-label={`Modifier ${p.name}`}>
                                  <Pencil aria-hidden />
                                </Button>
                              }
                            />
                            <ToggleButton id={p.id} active={p.is_active} action={toggleProgram} label="cette filière" />
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        {active === "parcours" ? (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Parcours et spécialités</CardTitle>
                <CardDescription>Une filière peut comporter plusieurs parcours, spécialités ou options.</CardDescription>
              </div>
              {manage ? (
                <QuickFormDialog
                  title="Nouveau parcours"
                  triggerLabel="Nouveau parcours"
                  action={saveTrack}
                  fields={[
                    { name: "program_id", label: "Filière", type: "select", required: true, options: opts.programs, wide: true },
                    { name: "name", label: "Nom", required: true, placeholder: "Génie logiciel", wide: true },
                    { name: "code", label: "Code", required: true, placeholder: "GL" },
                    { name: "kind", label: "Type", type: "select", required: true, options: Object.entries(TRACK_KINDS).map(([value, label]) => ({ value, label })), defaultValue: "parcours" },
                    { name: "starts_at_level_id", label: "À partir du niveau", type: "select", options: opts.levels },
                    { name: "description", label: "Description", type: "textarea", wide: true },
                  ]}
                />
              ) : null}
            </CardHeader>
            {data.tracks.length === 0 ? (
              <EmptyState icon={GitBranch} title="Aucun parcours" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Parcours</TH>
                    <TH>Type</TH>
                    <TH>Filière</TH>
                    <TH>À partir de</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.tracks.map((t) => (
                    <TR key={t.id} className={t.is_active ? undefined : "opacity-60"}>
                      <TD className="font-medium">
                        {t.name} <span className="text-xs text-muted-foreground">{t.code}</span>
                      </TD>
                      <TD>{TRACK_KINDS[t.kind]}</TD>
                      <TD className="text-sm">{t.program?.name}</TD>
                      <TD className="text-sm">{t.starts_at?.short_name ?? t.starts_at?.name ?? "—"}</TD>
                      <TD className="text-right">{manage ? <ToggleButton id={t.id} active={t.is_active} action={toggleTrack} label="ce parcours" /> : null}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ) : null}

        {active === "cycles" ? (
          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>Cycles</CardTitle>
                  <CardDescription>Licence, Master, Doctorat… ou toute autre organisation.</CardDescription>
                </div>
                {manage ? (
                  <QuickFormDialog
                    title="Nouveau cycle"
                    triggerLabel="Nouveau cycle"
                    action={saveCycle}
                    fields={[
                      { name: "name", label: "Nom", required: true, placeholder: "Licence", wide: true },
                      { name: "code", label: "Code", required: true, placeholder: "LIC" },
                      { name: "credits_required", label: "Crédits requis", type: "number", min: 1, placeholder: "180" },
                      { name: "duration_years", label: "Durée (années)", type: "number", min: 1, max: 12 },
                      { name: "sequence", label: "Ordre", type: "number", min: 0, defaultValue: String(data.cycles.length + 1) },
                    ]}
                  />
                ) : null}
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Cycle</TH>
                    <TH className="text-right">Crédits requis</TH>
                    <TH className="text-right">Durée</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.cycles.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-medium">
                        {c.name} <span className="text-xs text-muted-foreground">{c.code}</span>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtCredits(c.credits_required)}</TD>
                      <TD className="text-right tabular-nums">{c.duration_years ? `${c.duration_years} an(s)` : "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>Niveaux</CardTitle>
                  <CardDescription>L1, L2, L3, M1, M2, D1… configurables.</CardDescription>
                </div>
                {manage ? (
                  <QuickFormDialog
                    title="Nouveau niveau"
                    triggerLabel="Nouveau niveau"
                    action={saveLevel}
                    fields={[
                      { name: "name", label: "Nom", required: true, placeholder: "Licence 1", wide: true },
                      { name: "short_name", label: "Abréviation", placeholder: "L1" },
                      { name: "academic_cycle_id", label: "Cycle", type: "select", options: opts.cycles },
                      { name: "credits_target", label: "Crédits de l'année", type: "number", min: 1, placeholder: "60" },
                      { name: "sequence", label: "Ordre", type: "number", required: true, min: 0, defaultValue: String(data.levels.length + 1) },
                    ]}
                  />
                ) : null}
              </CardHeader>
              <Table>
                <THead>
                  <tr>
                    <TH>Niveau</TH>
                    <TH>Cycle</TH>
                    <TH className="text-right">Crédits</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.levels.map((l) => (
                    <TR key={l.id}>
                      <TD className="font-medium">
                        {l.name} {l.short_name ? <span className="text-xs text-muted-foreground">{l.short_name}</span> : null}
                      </TD>
                      <TD className="text-sm">{data.cycles.find((c) => c.id === l.academic_cycle_id)?.name ?? l.cycle ?? "—"}</TD>
                      <TD className="text-right tabular-nums">{fmtCredits(l.credits_target)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        ) : null}
      </TabPanel>
    </div>
  );
}
