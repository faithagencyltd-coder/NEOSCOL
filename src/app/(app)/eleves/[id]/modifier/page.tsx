import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { CustomValues } from "@/features/forms/fields";
import { updateStudent } from "@/features/students/actions";
import { StudentForm } from "@/features/students/components/student-form";
import { getStudent, getStudentFormFields } from "@/features/students/queries";
import { requirePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Modifier l'élève" };

export default async function EditStudentPage({ params }: PageProps<"/eleves/[id]/modifier">) {
  const context = await requirePermission("students.update");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [student, customFields] = await Promise.all([
    getStudent(context.organization.id, id),
    getStudentFormFields(context.organization.id),
  ]);
  if (!student) notFound();

  const customValues =
    student.custom_fields && typeof student.custom_fields === "object" && !Array.isArray(student.custom_fields)
      ? (student.custom_fields as CustomValues)
      : {};

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          Élèves · {student.last_name} {student.first_name} · {student.matricule}
        </p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Modifier le dossier</h1>
      </div>
      <StudentForm
        action={updateStudent}
        studentId={student.id}
        student={student}
        customFields={customFields}
        customValues={customValues}
        withGuardian={false}
        cancelHref={`/eleves/${student.id}`}
        submitLabel="Enregistrer les modifications"
      />
    </div>
  );
}
