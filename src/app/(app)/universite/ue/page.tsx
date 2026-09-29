import { BookOpen, Pencil, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { LinkSelect } from "@/components/shared/link-select";
import { QuickFormDialog, type QuickField } from "@/components/shared/quick-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { assignCourse, saveCourseSubject, saveTeachingUnit, toggleTeachingUnit } from "@/features/university/actions";
import { ToggleButton } from "@/features/university/components/toggle-button";
import { UniversityHeader } from "@/features/university/components/university-header";
import { fmtCredits, TEACHING_TYPES } from "@/features/university/config";
import { requireUniversity } from "@/features/university/guard";
import { courseAssignments, person, promotions, teacherOptions, teachingUnits, universityStructure } from "@/features/university/queries";
import { can } from "@/lib/auth/session";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "UE / Matières" };

type Opt = { value: string; label: string };
const val = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

function unitFields(o: { programs: Opt[]; levels: Opt[]; tracks: Opt[]; teachers: Opt[] }, v: Record<string, unknown>, semesterLabel: string): QuickField[] {
  return [
    { name: "code", label: "Code UE", required: true, defaultValue: val(v.code), placeholder: "UEF101" },
    { name: "name", label: "Intitulé", required: true, defaultValue: val(v.name), placeholder: "Algorithmique et programmation" },
    { name: "program_id", label: "Filière", type: "select", required: true, options: o.programs, defaultValue: val(v.program_id), wide: true },
    { name: "level_id", label: "Niveau", type: "select", options: o.levels, defaultValue: val(v.level_id) },
    { name: "semester_no", label: `${semesterLabel} (rang dans l'année)`, type: "number", required: true, min: 1, max: 4, defaultValue: val(v.semester_no) ?? "1" },
    { name: "credits", label: "Crédits", type: "number", required: true, min: 0, max: 60, step: "0.5", defaultValue: val(v.credits) ?? "6" },
    { name: "coefficient", label: "Coefficient", type: "number", required: true, min: 0.1, max: 100, step: "0.1", defaultValue: val(v.coefficient) ?? "1" },
    { name: "track_id", label: "Parcours / spécialité (facultatif)", type: "select", options: o.tracks, defaultValue: val(v.track_id) },
    { name: "category", label: "Catégorie", defaultValue: val(v.category), placeholder: "Fondamentale, transversale…" },
    { name: "responsible_id", label: "Responsable de l'UE", type: "select", options: o.teachers, defaultValue: val(v.responsible_id), wide: true },
    { name: "is_optional", label: "UE optionnelle", type: "checkbox", defaultValue: v.is_optional ? "true" : undefined },
    { name: "description", label: "Description", type: "textarea", defaultValue: val(v.description) },
  ];
}

function subjectFields(v: Record<string, unknown> & { teaching_types?: string[] }): QuickField[] {
  return [
    { name: "code", label: "Code", required: true, defaultValue: val(v.code), placeholder: "ALGO1" },
    { name: "name", label: "Matière", required: true, defaultValue: val(v.name), placeholder: "Algorithmique" },
    { name: "credits", label: "Crédits", type: "number", min: 0, max: 60, step: "0.5", defaultValue: val(v.credits) },
    { name: "coefficient", label: "Coefficient", type: "number", min: 0.1, max: 100, step: "0.1", defaultValue: val(v.coefficient) ?? "1" },
    { name: "hours_cm", label: "Volume CM (h)", type: "number", min: 0, max: 999, defaultValue: val(v.hours_cm) },
    { name: "hours_td", label: "Volume TD (h)", type: "number", min: 0, max: 999, defaultValue: val(v.hours_td) },
    { name: "hours_tp", label: "Volume TP (h)", type: "number", min: 0, max: 999, defaultValue: val(v.hours_tp) },
    ...Object.entries(TEACHING_TYPES).map(([t, label]) => ({
      name: `type_${t}`,
      label: `Type d'enseignement : ${label}`,
      type: "checkbox" as const,
      defaultValue: v.teaching_types?.includes(t) ? "true" : undefined,
    })),
  ];
}

export default async function TeachingUnitsPage({ searchParams }: PageProps<"/universite/ue">) {
  const context = await requireUniversity(["academic.read"]);
  const orgId = context.organization.id;
  const sp = await searchParams;
  const programId = param(sp, "filiere");
  const levelId = param(sp, "niveau");
  const semester = Number(param(sp, "semestre")) || undefined;
  const manage = can(context, "academic.manage");
  const semesterLabel = context.university.features.semesters ? "Semestre" : "Période";

  const [structure, units, teachers, classes, assignments] = await Promise.all([
    universityStructure(orgId),
    teachingUnits(orgId, { programId: isUuid(programId) ? programId : undefined, levelId: isUuid(levelId) ? levelId : undefined, semester }),
    can(context, "staff.read") ? teacherOptions(orgId) : Promise.resolve([]),
    promotions(orgId),
    courseAssignments(orgId),
  ]);
  const currentClasses = classes.filter((c) => c.academic_year?.is_current);
  const opts = {
    programs: structure.programs.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
    levels: structure.levels.map((l) => ({ value: l.id, label: l.name })),
    tracks: structure.tracks.filter((t) => t.is_active).map((t) => ({ value: t.id, label: `${t.name} — ${t.program?.code ?? ""}` })),
    teachers,
  };
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { filiere: programId, niveau: levelId, semestre: semester ? String(semester) : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/universite/ue${s ? `?${s}` : ""}`;
  };
  const totalCredits = units.filter((u) => u.is_active).reduce((sum, u) => sum + Number(u.credits ?? 0), 0);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="UE et matières"
        description="Unités d'enseignement par filière, niveau et semestre : crédits, coefficients, volumes horaires (CM, TD, TP), types d'enseignement et enseignants."
        actions={
          manage && opts.programs.length > 0 ? (
            <QuickFormDialog
              title="Nouvelle unité d'enseignement"
              triggerLabel="Nouvelle UE"
              action={saveTeachingUnit}
              fields={unitFields(opts, { program_id: programId, level_id: levelId, semester_no: semester }, semesterLabel)}
            />
          ) : null
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:flex-wrap sm:items-center">
          <LinkSelect
            label="Filière"
            value={programId ?? ""}
            placeholder="Toutes les filières"
            className="min-w-0 sm:w-72"
            options={[{ value: "", label: "Toutes les filières", href: href({ filiere: undefined }) }, ...opts.programs.map((p) => ({ ...p, href: href({ filiere: p.value }) }))]}
          />
          <LinkSelect
            label="Niveau"
            value={levelId ?? ""}
            className="min-w-0 sm:w-48"
            options={[{ value: "", label: "Tous les niveaux", href: href({ niveau: undefined }) }, ...opts.levels.map((l) => ({ ...l, href: href({ niveau: l.value }) }))]}
          />
          <LinkSelect
            label={semesterLabel}
            value={semester ? String(semester) : ""}
            className="min-w-0 sm:w-44"
            options={[
              { value: "", label: `Tous les ${semesterLabel.toLowerCase()}s`, href: href({ semestre: undefined }) },
              ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${semesterLabel} ${n}`, href: href({ semestre: String(n) }) })),
            ]}
          />
          <p className="text-sm text-muted-foreground sm:ml-auto">
            {units.length} UE · {fmtCredits(totalCredits)} crédits actifs
          </p>
        </CardContent>
      </Card>

      {units.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="Aucune UE" description="Créez les unités d'enseignement de vos filières, puis ajoutez-y les matières." />
        </Card>
      ) : (
        units.map((u) => {
          const unitClasses = currentClasses.filter((c) => c.program_id === u.program_id && (!u.level_id || c.level_id === u.level_id)).map((c) => ({ value: c.id, label: c.name }));
          return (
            <Card key={u.id} className="anim-fade-up">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid min-w-0 gap-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-primary">{u.code}</span> {u.name}
                    {u.is_optional ? <Badge tone="info">Optionnelle</Badge> : null}
                    {!u.is_active ? <Badge tone="neutral">Désactivée</Badge> : null}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-x-3 gap-y-1">
                    <Link href={`/universite/filieres/${u.program_id}`} className="underline-offset-2 hover:underline">
                      {u.program?.name}
                    </Link>
                    <span>{u.level?.name ?? "Tous niveaux"}</span>
                    <span>
                      {semesterLabel} {u.semester_no}
                    </span>
                    <span>{fmtCredits(u.credits)} crédits</span>
                    <span>coef. {fmtCredits(u.coefficient)}</span>
                    {u.track ? <span>Parcours : {u.track.name}</span> : null}
                    {u.category ? <span>{u.category}</span> : null}
                    {u.responsible ? <span>Responsable : {person(u.responsible)}</span> : null}
                  </CardDescription>
                </div>
                {manage ? (
                  <div className="flex flex-wrap gap-2">
                    <QuickFormDialog
                      title={`Modifier l'UE ${u.code}`}
                      action={saveTeachingUnit}
                      hidden={{ id: u.id }}
                      fields={unitFields(opts, u, semesterLabel)}
                      trigger={
                        <Button variant="ghost" size="sm" aria-label={`Modifier l'UE ${u.code}`}>
                          <Pencil aria-hidden /> Modifier
                        </Button>
                      }
                    />
                    <ToggleButton id={u.id} active={u.is_active} action={toggleTeachingUnit} label={`l'UE ${u.code}`} />
                    <QuickFormDialog title={`Nouvelle matière — ${u.code}`} triggerLabel="Ajouter une matière" action={saveCourseSubject} hidden={{ teaching_unit_id: u.id }} fields={subjectFields({})} />
                  </div>
                ) : null}
              </CardHeader>
              {u.subjects.length === 0 ? (
                <CardContent>
                  <p className="text-sm text-muted-foreground">Aucune matière dans cette UE.</p>
                </CardContent>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Matière</TH>
                      <TH>Crédits</TH>
                      <TH>Coef.</TH>
                      <TH>Volume horaire</TH>
                      <TH>Types</TH>
                      <TH>Promotion — enseignant</TH>
                      {manage ? <TH className="text-right">Actions</TH> : null}
                    </TR>
                  </THead>
                  <tbody>
                    {u.subjects.map((s) => {
                      const lines = assignments.filter((a) => a.subject_id === s.id);
                      return (
                        <TR key={s.id}>
                          <TD>
                            <span className="font-medium">{s.name}</span> <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                          </TD>
                          <TD>{fmtCredits(s.credits)}</TD>
                          <TD>{fmtCredits(s.coefficient)}</TD>
                          <TD className="whitespace-nowrap text-sm">
                            {[s.hours_cm ? `CM ${s.hours_cm} h` : null, s.hours_td ? `TD ${s.hours_td} h` : null, s.hours_tp ? `TP ${s.hours_tp} h` : null].filter(Boolean).join(" · ") || "—"}
                          </TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              {(s.teaching_types ?? []).map((t) => (
                                <Badge key={t} tone="neutral">
                                  {t.toUpperCase()}
                                </Badge>
                              ))}
                            </div>
                          </TD>
                          <TD className="text-sm">
                            {lines.length === 0 ? (
                              <span className="text-muted-foreground">Non affectée</span>
                            ) : (
                              lines.map((a) => (
                                <p key={a.id}>
                                  {a.class?.name} — {person(a.teacher) ?? <span className="text-warning">sans enseignant</span>}
                                </p>
                              ))
                            )}
                          </TD>
                          {manage ? (
                            <TD className="text-right">
                              <div className="flex justify-end gap-1">
                                <QuickFormDialog
                                  title={`Modifier ${s.name}`}
                                  action={saveCourseSubject}
                                  hidden={{ id: s.id, teaching_unit_id: u.id }}
                                  fields={subjectFields(s)}
                                  trigger={
                                    <Button variant="ghost" size="sm" aria-label={`Modifier ${s.name}`}>
                                      <Pencil aria-hidden />
                                    </Button>
                                  }
                                />
                                {unitClasses.length > 0 ? (
                                  <QuickFormDialog
                                    title={`Affecter ${s.name}`}
                                    description="La matière est enseignée dans la promotion par l'enseignant choisi (emploi du temps, présences, notes)."
                                    action={assignCourse}
                                    hidden={{ subject_id: s.id }}
                                    fields={[
                                      { name: "class_id", label: "Promotion", type: "select", required: true, options: unitClasses, wide: true },
                                      { name: "teacher_id", label: "Enseignant", type: "select", options: teachers, wide: true },
                                      { name: "weekly_hours", label: "Heures par semaine", type: "number", min: 0, max: 60, step: "0.5" },
                                    ]}
                                    trigger={
                                      <Button variant="ghost" size="sm" aria-label={`Affecter ${s.name}`}>
                                        <UserPlus aria-hidden />
                                      </Button>
                                    }
                                  />
                                ) : null}
                              </div>
                            </TD>
                          ) : null}
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
