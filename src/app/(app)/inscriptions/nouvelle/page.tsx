import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { getAcademicYears, getClasses, getClassHeadcounts } from "@/features/academic/queries";
import { EnrollmentForm } from "@/features/enrollments/components/enrollment-form";
import { getEnrollmentFeeRates, getEnrollmentForms, getStudentSummary } from "@/features/enrollments/queries";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Nouvelle inscription" };

export default async function NewEnrollmentPage({ searchParams }: PageProps<"/inscriptions/nouvelle">) {
  const context = await requirePermission("enrollments.manage");
  const organizationId = context.organization.id;
  const studentParam = param(await searchParams, "eleve");

  const years = (await getAcademicYears(organizationId)).filter((y) => y.status !== "closed");
  const classesByYear = await Promise.all(years.map((y) => getClasses(organizationId, y.id)));
  const allClasses = classesByYear.flatMap((list, i) => list.map((c) => ({ ...c, yearId: years[i]!.id })));
  const counts = await getClassHeadcounts(organizationId, allClasses.map((c) => c.id));
  const forms = await getEnrollmentForms(organizationId);
  const feeRates = await getEnrollmentFeeRates(organizationId, years.map((y) => y.id));
  const preset = isUuid(studentParam) ? await getStudentSummary(organizationId, studentParam) : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Scolarité · Inscriptions</p>
        <h1 className="text-2xl font-semibold sm:text-[26px]">Assistant d&apos;inscription</h1>
        <p className="text-sm text-muted-foreground">
          Brouillon : modifiable plus tard. Soumise : transmise à la direction pour validation.
        </p>
      </div>
      {years.length === 0 ? (
        <Alert tone="warning" title="Aucune année scolaire ouverte">
          Créez l&apos;année scolaire et ses classes dans la structure académique avant d&apos;inscrire des élèves.
        </Alert>
      ) : (
        <EnrollmentForm
          years={years.map((y) => ({ id: y.id, name: y.name, is_current: y.is_current }))}
          classes={allClasses.map((c) => ({
            id: c.id,
            name: c.name,
            yearId: c.yearId,
            levelId: c.level?.id ?? null,
            programId: c.program?.id ?? null,
            capacity: c.capacity,
            count: counts.get(c.id) ?? 0,
          }))}
          feeRates={feeRates}
          currency={context.organization.currency}
          vocabulary={vocabularyFor(context.organization.type)}
          forms={{ enrollment: forms.enrollment?.fields ?? [], reenrollment: forms.reenrollment?.fields ?? null }}
          presetStudent={
            preset && !preset.archived_at
              ? { id: preset.id, name: `${preset.last_name} ${preset.first_name}`, matricule: preset.matricule, className: null }
              : null
          }
          canCreateGuardian={can(context, "guardians.manage")}
        />
      )}
    </div>
  );
}
