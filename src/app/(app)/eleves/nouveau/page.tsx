import type { Metadata } from "next";

import { createStudent } from "@/features/students/actions";
import { StudentForm } from "@/features/students/components/student-form";
import { getStudentFormFields } from "@/features/students/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nouvel élève" };

export default async function NewStudentPage() {
  const context = await requirePermission("students.create");
  const customFields = await getStudentFormFields(context.organization.id);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Scolarité · Élèves</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Nouveau dossier élève</h1>
        <p className="text-sm text-muted-foreground">
          Le dossier est créé avec le statut « Candidat » ; il devient « Actif » à la validation de son inscription.
        </p>
      </div>
      <StudentForm
        action={createStudent}
        customFields={customFields}
        withGuardian={can(context, "guardians.manage")}
        cancelHref="/eleves"
        submitLabel="Créer le dossier"
      />
    </div>
  );
}
