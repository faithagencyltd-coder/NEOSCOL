import { BookOpen, Pencil, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { removeClassSubject, saveClassSubject, updateClass } from "@/features/academic/actions";
import { classFields } from "@/features/academic/components/class-fields";
import {
  getClassDetail,
  getClassStudents,
  getLevels,
  getPrograms,
  getRooms,
  getSubjects,
  getTeachers,
} from "@/features/academic/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { CLASS_KIND } from "@/lib/labels";
import { formatDate } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Classe" };

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const context = await requirePermission("academic.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const organizationId = context.organization.id;
  const klass = await getClassDetail(organizationId, id);
  if (!klass) notFound();

  const manage = can(context, "academic.manage");
  const canSeeStudents = can(context, "students.read");
  const [students, levels, programs, rooms, teachers, subjects] = await Promise.all([
    canSeeStudents ? getClassStudents(organizationId, id) : Promise.resolve([]),
    manage ? getLevels(organizationId) : Promise.resolve([]),
    manage ? getPrograms(organizationId) : Promise.resolve([]),
    manage ? getRooms(organizationId) : Promise.resolve([]),
    manage && can(context, "staff.read") ? getTeachers(organizationId) : Promise.resolve([]),
    manage ? getSubjects(organizationId) : Promise.resolve([]),
  ]);
  const classSubjects = [...klass.class_subjects].sort((a, b) => (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "", "fr"));
  const totalCoefficient = classSubjects.reduce((sum, cs) => sum + cs.coefficient, 0);
  const girls = students.filter((s) => s.sex === "F").length;
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: `${t.last_name} ${t.first_name}` }));

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/classes" className="hover:text-primary">
          Classes
        </Link>{" "}
        / <span className="text-foreground">{klass.name}</span>
      </nav>

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft font-display text-lg font-semibold text-primary">
          {klass.code ?? klass.name.slice(0, 3)}
        </span>
        <div className="grid flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{klass.name}</h1>
            <Badge tone="primary">{CLASS_KIND[klass.kind]}</Badge>
            {klass.archived_at ? <Badge>Archivée</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              klass.academic_year?.name ? `Année ${klass.academic_year.name}` : null,
              klass.level?.name,
              klass.program?.name,
              klass.room?.name,
              klass.head_teacher ? `Prof. principal : ${klass.head_teacher.first_name} ${klass.head_teacher.last_name}` : null,
              klass.starts_on && klass.ends_on
                ? `Du ${formatDate(klass.starts_on, "fr-FR", { dateStyle: "short" })} au ${formatDate(klass.ends_on, "fr-FR", { dateStyle: "short" })}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {manage ? (
          <QuickFormDialog
            title={`Modifier ${klass.name}`}
            trigger={
              <Button variant="secondary">
                <Pencil aria-hidden /> Modifier
              </Button>
            }
            action={updateClass}
            hidden={{ class_id: klass.id, academic_year_id: klass.academic_year_id }}
            fields={classFields(
              { levels, programs, rooms, teachers },
              {
                name: klass.name,
                code: klass.code,
                kind: klass.kind,
                capacity: klass.capacity,
                level_id: klass.level_id,
                program_id: klass.program_id,
                room_id: klass.room_id,
                head_teacher_id: klass.head_teacher_id,
                starts_on: klass.starts_on,
                ends_on: klass.ends_on,
              },
            )}
          />
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Matières et enseignants</CardTitle>
              <CardDescription>
                {classSubjects.length} matière{classSubjects.length > 1 ? "s" : ""} · total des coefficients : {totalCoefficient}
              </CardDescription>
            </div>
            {manage ? (
              <QuickFormDialog
                title="Ajouter ou modifier une matière"
                description="Si la matière existe déjà dans la classe, son coefficient et son enseignant sont mis à jour."
                triggerLabel="Matière"
                action={saveClassSubject}
                hidden={{ class_id: klass.id }}
                fields={[
                  { name: "subject_id", label: "Matière", type: "select", required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })), wide: true },
                  { name: "teacher_id", label: "Enseignant", type: "select", options: teacherOptions, wide: true },
                  { name: "coefficient", label: "Coefficient", type: "number", required: true, min: 0.5, step: "0.5", defaultValue: "1" },
                  { name: "weekly_hours", label: "Heures / semaine", type: "number", min: 0, step: "0.5" },
                ]}
              />
            ) : null}
          </CardHeader>
          {classSubjects.length === 0 ? (
            <CardContent>
              <EmptyState icon={BookOpen} title="Aucune matière affectée" />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr className="border-t border-border">
                  <TH>Matière</TH>
                  <TH>Enseignant</TH>
                  <TH className="text-right">Coef.</TH>
                  <TH className="text-right">H/sem.</TH>
                  {manage ? <TH className="sr-only">Actions</TH> : null}
                </tr>
              </THead>
              <tbody>
                {classSubjects.map((cs) => (
                  <TR key={cs.id}>
                    <TD className="font-semibold">{cs.subject?.name}</TD>
                    <TD className={cs.teacher ? undefined : "text-muted-foreground"}>
                      {cs.teacher ? `${cs.teacher.first_name} ${cs.teacher.last_name}` : "Non affecté"}
                    </TD>
                    <TD className="text-right tabular-nums">{cs.coefficient}</TD>
                    <TD className="text-right tabular-nums">{cs.weekly_hours ?? "—"}</TD>
                    {manage ? (
                      <TD className="text-right">
                        <span className="inline-flex gap-1">
                          <QuickFormDialog
                            title={`${cs.subject?.name} — ${klass.name}`}
                            trigger={
                              <Button variant="ghost" size="sm" aria-label={`Modifier ${cs.subject?.name}`}>
                                <Pencil aria-hidden />
                              </Button>
                            }
                            action={saveClassSubject}
                            hidden={{ class_id: klass.id, subject_id: cs.subject?.id ?? "" }}
                            fields={[
                              { name: "teacher_id", label: "Enseignant", type: "select", options: teacherOptions, defaultValue: cs.teacher?.id, wide: true },
                              { name: "coefficient", label: "Coefficient", type: "number", required: true, min: 0.5, step: "0.5", defaultValue: String(cs.coefficient) },
                              { name: "weekly_hours", label: "Heures / semaine", type: "number", min: 0, step: "0.5", defaultValue: cs.weekly_hours === null ? undefined : String(cs.weekly_hours) },
                            ]}
                          />
                          <ConfirmAction
                            trigger={
                              <Button variant="ghost" size="sm" className="text-danger" aria-label={`Retirer ${cs.subject?.name}`}>
                                <Trash2 aria-hidden />
                              </Button>
                            }
                            title={`Retirer ${cs.subject?.name} de ${klass.name} ?`}
                            description="Impossible si des évaluations existent déjà pour cette matière."
                            confirmLabel="Retirer"
                            tone="danger"
                            action={removeClassSubject}
                            fields={{ class_subject_id: cs.id, class_id: klass.id }}
                          />
                        </span>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canSeeStudents ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Élèves</CardTitle>
              <CardDescription>
                {students.length}
                {klass.capacity ? ` / ${klass.capacity}` : ""} inscrits · {girls} filles · {students.length - girls} garçons
              </CardDescription>
            </CardHeader>
            <CardContent>
              {students.length === 0 ? (
                <EmptyState icon={Users} title="Aucun élève inscrit" />
              ) : (
                <ul className="grid gap-1">
                  {students.map((student) => (
                    <li key={student.id}>
                      <Link href={`/eleves/${student.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-background">
                        <Avatar name={`${student.first_name} ${student.last_name}`} className="size-8 text-xs" />
                        <span className="grid flex-1">
                          <span className="text-sm font-semibold">
                            {student.last_name} {student.first_name}
                          </span>
                          <span className="text-xs text-muted-foreground">{student.matricule}</span>
                        </span>
                        {student.type === "reenrollment" ? <Badge>Réinscrit</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
