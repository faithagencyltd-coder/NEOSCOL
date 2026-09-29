import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePortal } from "@/features/portal/context";
import { AcademicRecordTab } from "@/features/university/components/student-tabs";
import { universityConfigOf } from "@/features/university/config";
import { studentAcademicRecord } from "@/features/university/queries";

export const metadata: Metadata = { title: "Mon parcours" };

/** Portail étudiant (université) : dossier académique permanent de l'étudiant connecté. */
export default async function PortalPathPage() {
  const { organization, student } = await requirePortal();
  const university = universityConfigOf(organization.type, organization.settings);
  if (!university || !university.features.student_portal || !student) notFound();
  const record = await studentAcademicRecord(organization.id, student.id);
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">Mon parcours universitaire</h1>
        <p className="text-sm text-muted-foreground">Inscriptions de toutes les années, crédits capitalisés, stages, mémoire, soutenances et diplômes.</p>
      </div>
      <AcademicRecordTab record={record} config={university} />
    </>
  );
}
