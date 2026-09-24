import { Archive, ArchiveRestore, ClipboardPlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { StatusBadge } from "@/components/shared/status-badge";
import { TabNav, TabPanel, type TabLink } from "@/components/shared/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StudentDocumentsTab } from "@/features/documents/components/student-documents";
import { dossierOrder } from "@/features/documents/dossier";
import { listCustomTemplates, listStudentDocuments } from "@/features/documents/queries";
import { setStudentArchived } from "@/features/students/actions";
import { ConductTab, PreviousSchoolsCard, ReportCardsTab } from "@/features/students/components/dossier-extra";
import { StudentLifecycleActions } from "@/features/students/components/lifecycle-actions";
import { StudentPortalAccess } from "@/features/portal/components/portal-access";
import { getPortalAccount, getPortalStatus } from "@/features/portal/queries";
import {
  AttendanceTab,
  FinanceTab,
  GradesTab,
  GuardiansTab,
  HistoryTab,
  InformationTab,
  SchoolingTab,
} from "@/features/students/components/dossier-tabs";
import {
  getStudent,
  getStudentAttendance,
  getStudentConduct,
  getStudentPreviousSchools,
  getStudentReportCards,
  getStudentFinance,
  getStudentFormFields,
  getStudentGrades,
  getStudentHistory,
  getStudentMedical,
} from "@/features/students/queries";
import { featureEnabled } from "@/lib/features";
import { requirePermission } from "@/lib/auth/guards";
import { todayIn } from "@/lib/dates";
import { can } from "@/lib/auth/session";
import { STUDENT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";

export const metadata: Metadata = { title: "Dossier élève" };

export default async function StudentPage({ params, searchParams }: PageProps<"/eleves/[id]">) {
  const context = await requirePermission("students.read");
  const v = vocabularyFor(context.organization.type);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const organization = context.organization;
  const student = await getStudent(organization.id, id);
  if (!student) notFound();

  const canFinance = can(context, "finance.read");
  const canAudit = can(context, "audit.read");
  const canGrades = can(context, "grades.read") || can(context, "grades.manage");
  const canAttendance = can(context, "attendance.read") || can(context, "attendance.manage");
  const showMedical = featureEnabled(organization, "medical_records") && can(context, "students.medical.read");
  const canReportCards = can(context, "report_cards.manage") || can(context, "grades.read");
  const canConduct = can(context, "conduct.read") || can(context, "conduct.manage");
  const canDocuments = can(context, "documents.read") || can(context, "documents.generate") || can(context, "documents.dossier");

  const tabs: TabLink[] = [
    { key: "informations", label: "Informations", href: "?onglet=informations" },
    { key: "parents", label: "Parents", href: "?onglet=parents", count: student.student_guardians.length },
    { key: "scolarite", label: "Scolarité", href: "?onglet=scolarite", count: student.enrollments.length },
    ...(canGrades ? [{ key: "notes", label: "Notes", href: "?onglet=notes" }] : []),
    ...(canReportCards ? [{ key: "bulletins", label: "Bulletins", href: "?onglet=bulletins" }] : []),
    ...(canAttendance ? [{ key: "presences", label: "Présences", href: "?onglet=presences" }] : []),
    ...(canConduct ? [{ key: "discipline", label: "Discipline", href: "?onglet=discipline" }] : []),
    ...(canFinance ? [{ key: "finance", label: "Finance", href: "?onglet=finance" }] : []),
    ...(canDocuments ? [{ key: "documents", label: "Documents", href: "?onglet=documents" }] : []),
    { key: "portail", label: "Portail", href: "?onglet=portail" },
    ...(canAudit ? [{ key: "historique", label: "Historique", href: "?onglet=historique" }] : []),
  ];
  const requested = param(query, "onglet");
  const active = tabs.some((t) => t.key === requested) ? requested! : "informations";

  const current =
    student.enrollments.find((e) => e.status === "validated" && e.academic_year?.is_current) ??
    student.enrollments.find((e) => e.status === "validated");
  const archived = student.archived_at !== null;
  const fullName = `${student.first_name} ${student.last_name}`;

  return (
    <div className="grid gap-5">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
        <Link href="/eleves" className="hover:text-primary">
          {v.students}
        </Link>{" "}
        / <span className="text-foreground">{fullName}</span>
      </nav>

      {query.cree ? <Alert tone="success">Dossier créé. Matricule attribué : {student.matricule}.</Alert> : null}
      {query.modifie ? <Alert tone="success">Modifications enregistrées.</Alert> : null}
      {archived ? (
        <Alert tone="warning" title="Dossier archivé">
          Archivé le {formatDate(student.archived_at!, "fr-FR", { dateStyle: "long" })}. Il reste consultable et peut être restauré.
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center">
        <Avatar name={fullName} photoId={student.photo_path} className="size-20 text-2xl ring-4 ring-primary-soft" />
        <div className="grid flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold sm:text-[26px]">{fullName}</h1>
            {archived ? <Badge>Archivé</Badge> : <StatusBadge value={student.status} map={STUDENT_STATUS} />}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Matricule <strong className="text-foreground">{student.matricule}</strong>
            </span>
            <span>
              Classe <strong className="text-foreground">{current?.class?.name ?? "—"}</strong>
            </span>
            {current?.academic_year ? (
              <span>
                Année <strong className="text-foreground">{current.academic_year.name}</strong>
              </span>
            ) : null}
            {student.birth_date ? (
              <span>
                Né{student.sex === "F" ? "e" : ""} le{" "}
                <strong className="text-foreground">{formatDate(student.birth_date, "fr-FR", { dateStyle: "short" })}</strong>
                {student.birth_place ? ` à ${student.birth_place}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(context, "enrollments.manage") && !archived ? (
            <Button asChild variant="secondary">
              <Link href={`/inscriptions/nouvelle?eleve=${student.id}`}>
                <ClipboardPlus aria-hidden /> Inscrire
              </Link>
            </Button>
          ) : null}
          {can(context, "students.update") ? (
            <Button asChild variant="secondary">
              <Link href={`/eleves/${student.id}/modifier`}>
                <Pencil aria-hidden /> Modifier
              </Link>
            </Button>
          ) : null}
          <StudentLifecycleActions
            student={{ id: student.id, status: student.status, matricule: student.matricule, archived }}
            can={{ update: can(context, "students.update"), archive: can(context, "students.archive"), delete: can(context, "students.delete") }}
          />
          {can(context, "students.archive") ? (
            <ConfirmAction
              trigger={
                <Button variant={archived ? "secondary" : "ghost"} className={archived ? undefined : "text-danger"}>
                  {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {archived ? "Restaurer" : "Archiver"}
                </Button>
              }
              title={archived ? "Restaurer ce dossier ?" : "Archiver ce dossier ?"}
              description={
                archived
                  ? "Le dossier réapparaîtra dans la liste des élèves."
                  : "Le dossier est conservé intégralement (historique, notes, paiements) mais n'apparaît plus dans les listes courantes."
              }
              confirmLabel={archived ? "Restaurer" : "Archiver"}
              tone={archived ? "primary" : "danger"}
              action={setStudentArchived}
              fields={{ student_id: student.id, archive: archived ? "false" : "true" }}
            />
          ) : null}
        </div>
      </Card>

      <TabNav tabs={tabs} active={active} label="Sections du dossier" />
      <TabPanel active={active}>
  
        {active === "informations" ? (
          <InformationTab
            student={student}
            customFields={await getStudentFormFields(organization.id)}
            medical={showMedical ? await getStudentMedical(student.id) : null}
            showMedical={showMedical}
            canEditMedical={can(context, "students.medical.manage")}
          />
        ) : null}
        {active === "parents" ? <GuardiansTab student={student} canManage={can(context, "guardians.manage")} /> : null}
        {active === "scolarite" ? (
          <>
            <SchoolingTab student={student} canEnroll={can(context, "enrollments.manage") && !archived} />
            <PreviousSchoolsCard studentId={student.id} schools={await getStudentPreviousSchools(student.id)} canManage={can(context, "students.update") && !archived} />
          </>
        ) : null}
        {active === "bulletins" ? (
          <ReportCardsTab
            cards={await getStudentReportCards(student.id)}
            canPdf={can(context, "documents.generate") && (can(context, "report_cards.manage") || can(context, "report_cards.publish"))}
          />
        ) : null}
        {active === "discipline" ? (
          <ConductTab studentId={student.id} records={await getStudentConduct(student.id)} canManage={can(context, "conduct.manage") && !archived} today={todayIn(organization.timezone)} />
        ) : null}
        {active === "notes" ? <GradesTab grades={await getStudentGrades(student.id)} /> : null}
        {active === "presences" ? <AttendanceTab attendance={await getStudentAttendance(student.id)} /> : null}
        {active === "finance" ? <FinanceTab finance={await getStudentFinance(student.id)} currency={organization.currency} /> : null}
        {active === "documents" ? (
          <StudentDocumentsTab
            studentId={student.id}
            documents={can(context, "documents.read") ? await listStudentDocuments(organization.id, student.id) : []}
            enrollments={student.enrollments.filter((e) => e.status !== "cancelled" && e.status !== "draft")}
            can={{
              generate: can(context, "documents.generate") && !archived,
              dossier: can(context, "documents.dossier") && can(context, "documents.generate"),
              revoke: can(context, "documents.revoke"),
              saveDefault: can(context, "settings.manage"),
              transcript: can(context, "documents.generate") && (can(context, "report_cards.manage") || can(context, "report_cards.publish")),
            }}
            dossierOrder={dossierOrder(null, (organization.settings as { documents?: { dossier_sections?: unknown } } | null)?.documents?.dossier_sections)}
            timezone={organization.timezone}
            customTemplates={await listCustomTemplates(organization.id)}
          />
        ) : null}
        {active === "portail" ? <PortalTab studentId={student.id} hasBirthDate={Boolean(student.birth_date)} canManage={can(context, "portal_access.manage")} organization={organization} /> : null}
        {active === "historique" ? (
          <HistoryTab
            history={await getStudentHistory(organization.id, [student.id, ...student.enrollments.map((e) => e.id)])}
            timezone={organization.timezone}
          />
        ) : null}
      </TabPanel>
    </div>
  );
}

const FEATURE_LABELS: Record<string, string> = { grades: "notes", report_cards: "bulletins", documents: "documents", timetable: "emploi du temps" };

async function PortalTab({
  studentId,
  hasBirthDate,
  canManage,
  organization,
}: {
  studentId: string;
  hasBirthDate: boolean;
  canManage: boolean;
  organization: { currency: string; timezone: string };
}) {
  const [account, status] = await Promise.all([getPortalAccount("student", studentId), getPortalStatus(studentId)]);
  return (
    <StudentPortalAccess
      studentId={studentId}
      hasBirthDate={hasBirthDate}
      account={account}
      lastSignIn={account?.last_sign_in_at ? formatDateTime(account.last_sign_in_at, "fr-FR", organization.timezone) : null}
      canManage={canManage}
      status={
        status
          ? {
              restricted: status.restricted,
              rules_enabled: status.rules_enabled,
              overdue: formatMoney(status.overdue_amount, organization.currency),
              features: Object.entries(status.features)
                .filter(([, on]) => on)
                .map(([key]) => FEATURE_LABELS[key] ?? key),
              override: status.override,
            }
          : null
      }
    />
  );
}
