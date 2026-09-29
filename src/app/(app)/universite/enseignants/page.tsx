import { GraduationCap, Pencil, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { QuickFormDialog } from "@/components/shared/quick-form-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { createStaffMember } from "@/features/staff/actions";
import { staffFormFields } from "@/features/staff/form";
import { saveTeacherProfile } from "@/features/university/actions";
import { UniversityHeader } from "@/features/university/components/university-header";
import { requireUniversity } from "@/features/university/guard";
import { universityStructure, universityTeachers } from "@/features/university/queries";
import { can } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Enseignants" };

const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  active: { label: "Actif", tone: "success" },
  inactive: { label: "Désactivé", tone: "neutral" },
  withdrawn: { label: "Retiré", tone: "warning" },
};

export default async function UniversityTeachersPage() {
  const context = await requireUniversity(["staff.read"]);
  const orgId = context.organization.id;
  const [teachers, structure] = await Promise.all([universityTeachers(orgId), universityStructure(orgId)]);
  const manage = can(context, "staff.manage");
  const ranks = context.university.teacherRanks;
  const departments = structure.departments.filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name }));
  const byRank = ranks.map((r) => ({ rank: r, count: teachers.filter((t) => t.academic_rank === r).length })).filter((r) => r.count > 0);

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <UniversityHeader
        title="Enseignants"
        description="Corps enseignant : grade (configurable dans les paramètres universitaires), département, spécialités et matières enseignées."
        actions={
          manage ? (
            <QuickFormDialog
              title="Nouvel enseignant"
              description="Le matricule est attribué automatiquement ; complétez ensuite le grade et le département."
              trigger={
                <Button size="sm">
                  <UserRoundPlus aria-hidden /> Nouvel enseignant
                </Button>
              }
              submitLabel="Créer la fiche"
              action={createStaffMember}
              fields={staffFormFields({ is_teacher: "true", job_title: "Enseignant" })}
            />
          ) : null
        }
      />
      {byRank.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {byRank.map((r) => (
            <Badge key={r.rank} tone="info">
              {r.rank} : {r.count}
            </Badge>
          ))}
        </div>
      ) : null}
      <Card>
        {teachers.length === 0 ? (
          <CardContent>
            <EmptyState icon={GraduationCap} title="Aucun enseignant" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Enseignant</TH>
                <TH>Grade</TH>
                <TH>Département</TH>
                <TH>Spécialités</TH>
                <TH>Enseignements (année en cours)</TH>
                <TH>Statut</TH>
                {manage ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <tbody>
              {teachers.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/personnel/${t.id}`} className="flex items-center gap-3 hover:text-primary">
                      <Avatar name={`${t.first_name} ${t.last_name}`} photoId={t.photo_path} className="size-9" />
                      <span className="grid">
                        <span className="font-medium">
                          {t.last_name} {t.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{t.employee_number}</span>
                      </span>
                    </Link>
                  </TD>
                  <TD className="text-sm">{t.academic_rank ?? <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-sm">{t.department?.name ?? "—"}</TD>
                  <TD className="text-sm">{t.specialties?.length ? t.specialties.join(", ") : "—"}</TD>
                  <TD className="text-sm">
                    {t.courses.length === 0 ? <span className="text-muted-foreground">Aucun</span> : t.courses.map((c) => <p key={c}>{c}</p>)}
                  </TD>
                  <TD>
                    <Badge tone={STATUS[t.status]?.tone ?? "neutral"}>{STATUS[t.status]?.label ?? t.status}</Badge>
                  </TD>
                  {manage ? (
                    <TD className="text-right">
                      <QuickFormDialog
                        title={`Profil universitaire — ${t.first_name} ${t.last_name}`}
                        action={saveTeacherProfile}
                        hidden={{ id: t.id }}
                        fields={[
                          {
                            name: "academic_rank",
                            label: "Grade",
                            type: "select",
                            options: [...new Set([...ranks, ...(t.academic_rank ? [t.academic_rank] : [])])].map((r) => ({ value: r, label: r })),
                            defaultValue: t.academic_rank ?? undefined,
                          },
                          { name: "department_id", label: "Département", type: "select", options: departments, defaultValue: t.department?.id },
                          { name: "specialties", label: "Spécialités", hint: "Séparées par des virgules.", defaultValue: (t.specialties ?? []).join(", "), wide: true },
                        ]}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Modifier le profil de ${t.first_name} ${t.last_name}`}>
                            <Pencil aria-hidden /> Grade
                          </Button>
                        }
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
