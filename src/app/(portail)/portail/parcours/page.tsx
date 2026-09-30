import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { SchoolHistory } from "@/features/portal/components/school-record";
import { requirePortalSection } from "@/features/portal/context";
import { getPortalSchoolRecord } from "@/features/portal/queries";
import { AcademicRecordTab } from "@/features/university/components/student-tabs";
import { isHigherOrg, universityConfigOf } from "@/features/university/config";
import { studentAcademicRecord } from "@/features/university/queries";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Mon parcours" };

/**
 * Historique scolaire permanent : université → dossier académique (crédits,
 * stages, diplômes) ; école et centre de formation → inscriptions de toutes les
 * années, résultats annuels validés et années antérieures importées.
 */
export default async function PortalPathPage() {
  const { organization, parent, student } = await requirePortalSection("results");
  if (isHigherOrg(organization.type)) {
    const university = universityConfigOf(organization.type, organization.settings);
    if (!university || !university.features[parent ? "parent_portal" : "student_portal"] || !student) notFound();
    const record = await studentAcademicRecord(organization.id, student.id);
    return (
      <>
        <div className="grid gap-1">
          <h1 className="text-xl font-bold">{parent ? `Parcours universitaire de ${student.first_name}` : "Mon parcours universitaire"}</h1>
          <p className="text-sm text-muted-foreground">Inscriptions de toutes les années, crédits capitalisés, stages, mémoire, soutenances et diplômes.</p>
        </div>
        <AcademicRecordTab record={record} config={university} />
      </>
    );
  }
  if (!student) {
    return <EmptyState icon={ShieldCheck} title="Aucun dossier rattaché" description="Contactez le secrétariat de l'établissement." />;
  }
  const record = await getPortalSchoolRecord(student.id);
  if (!record) notFound();
  const vocabulary = vocabularyFor(organization.type);
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-bold">{parent ? `Parcours de ${student.first_name}` : vocabulary.family === "training" ? "Mon parcours de formation" : "Mon parcours scolaire"}</h1>
        <p className="text-sm text-muted-foreground">Inscriptions de toutes les années, résultats annuels validés et années antérieures.</p>
      </div>
      <SchoolHistory record={record} vocabulary={vocabulary} />
    </>
  );
}
