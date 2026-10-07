import { Archive, ArchiveRestore, Cake, CalendarDays, Check, ClipboardPlus, GraduationCap, Hash, Mail, Pencil, Phone, School } from "lucide-react";
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
  getStudentMonthPresence,
  getStudentSchedule,
} from "@/features/students/queries";
import { DocumentsMenu, MoreActions } from "@/features/students/components/dossier-menus";
import { DossierKpis, OverviewTab, PaymentsTab, ScheduleTab } from "@/features/students/components/dossier-overview";
import { CashierDialog } from "@/features/finance/components/cashier-dialog";
import { allocateInstallments } from "@/features/finance/installments";
import { featureEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guards";
import { todayIn } from "@/lib/dates";
import { can } from "@/lib/auth/session";
import { RELATIONSHIP, STUDENT_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";
import { vocabularyFor } from "@/lib/vocabulary";
import { PastRecordsTab } from "@/features/migration/components/past-records";
import { AssiduityTab, BadgeTab, CompetenciesTab, TrainingTab } from "@/features/training/components/learner-tabs";
import { isTrainingOrg } from "@/features/training/config";
import { learnerAttendanceSummary, learnerTraining } from "@/features/training/queries";
import { issueStudentBadge, revokeStudentBadge } from "@/features/university/actions";
import { AcademicRecordTab, PedagogicalTab, ResultsTab } from "@/features/university/components/student-tabs";
import { universityConfigOf, type UniversityConfig } from "@/features/university/config";
import { studentAcademicRecord } from "@/features/university/queries";
import { qrDataUrl } from "@/lib/pdf/qr";
import { BadgePanel } from "@/features/cards/components/badge-panel";
import { loadStudentCard } from "@/features/cards/server";
import { getStudentPastRecords } from "@/features/migration/queries";

export const metadata: Metadata = { title: "Dossier élève" };

/** Onglet « Badge & QR » : carte 3D, impression, PDF, image, validité (les trois modules). */
async function StudentCardSection(props: {
  studentId: string;
  organizationId: string;
  timezone: string;
  holder: string;
  active: boolean;
  canManage: boolean;
  canEdit: boolean;
}) {
  const supabase = await createClient();
  const loaded = await loadStudentCard(supabase, props.organizationId, props.studentId);
  if (!loaded) return null;
  return (
    <BadgePanel
      studentId={props.studentId}
      card={loaded.card}
      design={loaded.design}
      badge={loaded.badge}
      holder={props.holder}
      canManage={props.canManage}
      canEdit={props.canEdit}
      active={props.active}
      timezone={props.timezone}
    />
  );
}

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
  const canCash = canFinance && can(context, "finance.payments.create");
  const today = todayIn(organization.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const finance = canFinance ? await getStudentFinance(student.id) : null;

  // Module Formation professionnelle : sections propres au dossier de l'apprenant.
  const training = isTrainingOrg(organization.type);
  const trainingTabs: TabLink[] = training
    ? [
        { key: "formation", label: "Formation", href: "?onglet=formation" },
        { key: "assiduite", label: "Assiduité", href: "?onglet=assiduite" },
        { key: "competences", label: "Compétences", href: "?onglet=competences" },
      ]
    : [];
  // Module Université : dossier académique permanent, inscription pédagogique, résultats et crédits.
  const university = universityConfigOf(organization.type, organization.settings);
  const universityTabs: TabLink[] = university
    ? [
        { key: "universite", label: "Dossier académique", href: "?onglet=universite" },
        { key: "pedagogique", label: "Inscription pédagogique", href: "?onglet=pedagogique" },
        ...(canGrades || can(context, "deliberations.read") ? [{ key: "resultats", label: "Résultats et crédits", href: "?onglet=resultats" }] : []),
        ...(canAttendance ? [{ key: "assiduite", label: "Assiduité", href: "?onglet=assiduite" }] : []),
      ]
    : [];
  // Onglets principaux (comme sur la maquette) ; les autres restent accessibles dans « Plus ».
  const learnerAttendance = training || Boolean(university);
  const all: TabLink[] = [
    { key: "apercu", label: "Aperçu", href: "?onglet=apercu" },
    { key: "informations", label: "Informations", href: "?onglet=informations" },
    { key: "scolarite", label: "Inscription", href: "?onglet=scolarite", count: student.enrollments.length },
    { key: "parents", label: "Parent / Tuteur", href: "?onglet=parents", count: student.student_guardians.length },
    ...(canFinance ? [{ key: "paiements", label: "Paiements", href: "?onglet=paiements", count: finance?.payments.filter((p) => p.status !== "cancelled").length }] : []),
    ...(canFinance ? [{ key: "echeancier", label: "Échéancier", href: "?onglet=echeancier" }] : []),
    // Présences : appels de cours (scolaire) ; entrées enregistrées (université, formation).
    ...(learnerAttendance && (training || canAttendance) ? [{ key: "assiduite", label: "Présences", href: "?onglet=assiduite" }] : []),
    ...(!learnerAttendance && canAttendance ? [{ key: "presences", label: "Présences", href: "?onglet=presences" }] : []),
    // Carte (badge + QR) : les trois modules ; université selon sa configuration.
    ...(!university || university.features.badges ? [{ key: "badge", label: "Badge & QR", href: "?onglet=badge" }] : []),
    ...(canDocuments ? [{ key: "documents", label: "Documents", href: "?onglet=documents" }] : []),
  ];
  const more: TabLink[] = [
    ...trainingTabs.filter((t) => t.key !== "assiduite"),
    ...universityTabs.filter((t) => t.key !== "assiduite"),
    ...(learnerAttendance && canAttendance ? [{ key: "presences", label: "Appels de cours", href: "?onglet=presences" }] : []),
    ...(canGrades ? [{ key: "notes", label: "Notes", href: "?onglet=notes" }] : []),
    ...(canReportCards && !university ? [{ key: "bulletins", label: "Bulletins", href: "?onglet=bulletins" }] : []),
    ...(canConduct ? [{ key: "discipline", label: "Discipline", href: "?onglet=discipline" }] : []),
    ...(canFinance ? [{ key: "finance", label: "Factures", href: "?onglet=finance" }] : []),
    { key: "parcours", label: "Parcours antérieur", href: "?onglet=parcours" },
    { key: "portail", label: "Portail", href: "?onglet=portail" },
    ...(canAudit ? [{ key: "historique", label: "Historique", href: "?onglet=historique" }] : []),
  ];
  const tabs = all;
  const requested = param(query, "onglet");
  const active = [...tabs, ...more].some((t) => t.key === requested) ? requested! : "apercu";

  const current =
    student.enrollments.find((e) => e.status === "validated" && e.academic_year?.is_current) ??
    student.enrollments.find((e) => e.status === "validated");
  const archived = student.archived_at !== null;
  const fullName = `${student.first_name} ${student.last_name}`;
  const liveInvoices = (finance?.invoices ?? []).filter((i) => i.status === "issued");
  const kpis = finance
    ? {
        total: liveInvoices.reduce((t, i) => t + Number(i.total ?? 0), 0),
        paid: liveInvoices.reduce((t, i) => t + Number(i.paid ?? 0), 0),
        balance: liveInvoices.reduce((t, i) => t + Number(i.balance ?? 0), 0),
        overdue: liveInvoices.some((i) => i.is_overdue),
      }
    : null;
  const presence = canAttendance || (training && can(context, "students.read")) ? await getStudentMonthPresence(student.id, monthStart, today, learnerAttendance) : null;
  const schedule = canFinance && ["apercu", "echeancier"].includes(active) ? await getStudentSchedule(student.id) : [];
  const cashier = canCash ? (
    <CashierDialog
      currency={organization.currency}
      today={today}
      minDate={new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10)}
      labels={{ student: v.student, theStudent: v.theStudent }}
      initialStudentId={student.id}
    />
  ) : null;

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

      <Card className="overflow-hidden p-0" data-testid="dossier-header">
        <div aria-hidden className="h-24 bg-gradient-to-r from-[#0b2559] via-[#1d4fd8] to-[#0ea5c6] sm:h-28" />
        <div className="grid gap-4 px-5 pb-5 sm:px-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-3 sm:-mt-14">
            <span className="relative">
              <Avatar name={fullName} photoId={student.photo_path} className="size-24 rounded-2xl border-4 border-surface bg-primary-soft text-3xl shadow-md sm:size-28 [&_img]:rounded-xl" />
              {!archived && student.status === "active" ? (
                <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-success text-white" title="Actif">
                  <Check className="size-4" aria-hidden />
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {canCash && !archived ? cashier : null}
              {canDocuments ? <DocumentsMenu studentId={student.id} university={Boolean(university)} transcript={can(context, "documents.generate") && (can(context, "report_cards.manage") || can(context, "report_cards.publish"))} generate={can(context, "documents.generate") && !archived} /> : null}
              <MoreActions>
                {can(context, "enrollments.manage") && !archived ? (
                  <Button asChild variant="secondary">
                    <Link
                      href={
                        training ? `/formation/inscription?apprenant=${student.id}` : university ? `/universite/inscription?etudiant=${student.id}` : `/inscriptions/nouvelle?eleve=${student.id}`
                      }
                    >
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
                      <Button variant="ghost" className={archived ? undefined : "text-danger"}>
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
              </MoreActions>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold sm:text-[28px]">{fullName}</h1>
              {archived ? <Badge>Archivé</Badge> : <StatusBadge value={student.status} map={STUDENT_STATUS} />}
              <Badge tone="primary">{training ? "Formation pro" : university ? "Université" : "Scolaire"}</Badge>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground" data-testid="dossier-facts">
              <li className="flex items-center gap-1.5">
                <Hash className="size-4" aria-hidden /> <span className="font-mono text-foreground">{student.matricule}</span>
              </li>
              {current?.class?.program?.name ? (
                <li className="flex items-center gap-1.5">
                  <GraduationCap className="size-4" aria-hidden /> {current.class.program.name}
                </li>
              ) : null}
              <li className="flex items-center gap-1.5" title={v.klass}>
                <School className="size-4" aria-hidden /> {current?.class?.name ?? `${v.klass} : —`}
              </li>
              {current?.academic_year ? (
                <li className="flex items-center gap-1.5" title={v.year}>
                  <CalendarDays className="size-4" aria-hidden /> {current.academic_year.name}
                </li>
              ) : null}
              {student.birth_date ? (
                <li className="flex items-center gap-1.5">
                  <Cake className="size-4" aria-hidden /> Né{student.sex === "F" ? "e" : ""} le {formatDate(student.birth_date, "fr-FR", { dateStyle: "short" })}
                  {student.birth_place ? ` à ${student.birth_place}` : ""}
                </li>
              ) : null}
              {student.phone ? (
                <li className="flex items-center gap-1.5">
                  <Phone className="size-4" aria-hidden /> {student.phone}
                </li>
              ) : null}
              {student.email ? (
                <li className="flex items-center gap-1.5">
                  <Mail className="size-4" aria-hidden /> {student.email}
                </li>
              ) : null}
            </ul>
          </div>
          <DossierKpis finance={kpis} presence={presence} currency={organization.currency} />
        </div>
      </Card>

      <TabNav tabs={tabs} more={more} active={active} label="Sections du dossier" />
      <TabPanel active={active}>
        {active === "apercu" ? (
          <OverviewTab
            enrollment={
              current
                ? { klass: current.class?.name ?? null, year: current.academic_year?.name ?? null, program: current.class?.program?.name ?? null, reference: current.reference }
                : null
            }
            guardians={student.student_guardians.map((g) => ({
              name: g.guardian ? `${g.guardian.first_name} ${g.guardian.last_name}` : "—",
              relationship: g.relationship ? (RELATIONSHIP[g.relationship] ?? g.relationship) : null,
              phone: g.guardian?.phone ?? null,
              primary: g.is_primary,
            }))}
            contact={{ phone: student.phone, email: student.email, address: [student.address, student.city].filter(Boolean).join(", ") || null }}
            finance={
              finance
                ? {
                    lastPayment: (() => {
                      const p = finance.payments.find((x) => x.status !== "cancelled");
                      return p ? { id: p.id, number: p.number, amount: Number(p.amount), at: p.paid_at } : null;
                    })(),
                    next: nextInstallment(schedule, today),
                    currency: organization.currency,
                    timezone: organization.timezone,
                    canReceipt: can(context, "documents.generate") || canFinance,
                  }
                : null
            }
            presence={presence}
            labels={{ klass: v.klass, year: v.year, guardians: "Parents / tuteurs" }}
          />
        ) : null}
        {active === "paiements" && finance ? (
          <PaymentsTab payments={finance.payments} currency={organization.currency} timezone={organization.timezone} cashier={archived ? null : cashier} canReceipt />
        ) : null}
        {active === "echeancier" ? <ScheduleTab invoices={schedule} currency={organization.currency} today={today} cashier={archived ? null : cashier} /> : null}
        {active === "informations" ? (
          <InformationTab
            student={student}
            customFields={await getStudentFormFields(organization.id)}
            medical={showMedical ? await getStudentMedical(student.id) : null}
            showMedical={showMedical}
            canEditMedical={can(context, "students.medical.manage")}
          />
        ) : null}
        {active === "badge" ? (
          <StudentCardSection
            studentId={student.id}
            organizationId={organization.id}
            timezone={organization.timezone}
            holder={v.theStudent}
            active={student.status === "active" && !archived}
            canManage={can(context, "students.badges.manage") && !archived}
            canEdit={can(context, "students.update") && !archived}
          />
        ) : null}
        {training && ["formation", "competences"].includes(active) ? (
          <TrainingSections
            active={active}
            studentId={student.id}
            organization={organization}
            studentActive={student.status === "active" && !archived}
            can={{
              documents: can(context, "documents.generate") && !archived,
              update: can(context, "students.update") && !archived,
              enroll: can(context, "enrollments.manage") && !archived,
              finance: canFinance,
              evaluate: (can(context, "grades.enter") || can(context, "grades.manage")) && !archived,
              badges: can(context, "students.badges.manage") && !archived,
            }}
          />
        ) : null}
        {university && ["universite", "pedagogique", "resultats"].includes(active) ? (
          <UniversitySections
            active={active}
            studentId={student.id}
            organizationId={organization.id}
            timezone={organization.timezone}
            config={university}
            studentActive={student.status === "active" && !archived}
            can={{
              enroll: can(context, "enrollments.manage") && !archived,
              badges: can(context, "students.badges.manage") && !archived,
              transcript: can(context, "documents.generate") && (can(context, "deliberations.read") || can(context, "grades.manage")),
            }}
          />
        ) : null}
        {active === "assiduite" ? <AssiduityTab data={await learnerAttendanceSummary(student.id)} /> : null}
        {active === "parents" ? <GuardiansTab student={student} canManage={can(context, "guardians.manage")} /> : null}
        {active === "parcours" ? (
          <PastRecordsTab
            student={student}
            records={await getStudentPastRecords(organization.id, student.id, canFinance)}
            canManage={can(context, "students.update") && !archived}
            currency={organization.currency}
            v={v}
          />
        ) : null}
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
        {active === "finance" ? <FinanceTab finance={finance ?? (await getStudentFinance(student.id))} currency={organization.currency} /> : null}
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
            training={training}
            university={Boolean(university)}
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

async function TrainingSections({
  active,
  studentId,
  organization,
  studentActive,
  can: allowed,
}: {
  active: string;
  studentId: string;
  organization: { id: string; currency: string; timezone: string };
  studentActive: boolean;
  can: { documents: boolean; update: boolean; enroll: boolean; finance: boolean; evaluate: boolean; badges: boolean };
}) {
  const training = await learnerTraining(organization.id, studentId);
  if (active === "competences") return <CompetenciesTab studentId={studentId} training={training} canEvaluate={allowed.evaluate} />;
  if (active === "badge") {
    const supabase = await createClient();
    const { data: token } = await supabase.from("student_badges").select("token").eq("student_id", studentId).eq("status", "active").maybeSingle();
    return (
      <BadgeTab
        studentId={studentId}
        badges={training.badges}
        qr={token ? await qrDataUrl(`NEOSCOL-BADGE:${token.token}`, "#000000") : null}
        canManage={allowed.badges}
        active={studentActive}
        timezone={organization.timezone}
      />
    );
  }
  let finance = null;
  if (allowed.finance) {
    const { invoices } = await getStudentFinance(studentId);
    const live = invoices.filter((i) => i.status !== "cancelled");
    finance = {
      total: live.reduce((s, i) => s + Number(i.total ?? 0), 0),
      paid: live.reduce((s, i) => s + Number(i.paid ?? 0), 0),
      balance: live.reduce((s, i) => s + Number(i.balance ?? 0), 0),
      overdue: live.some((i) => i.is_overdue),
      nextDue: live.map((i) => i.next_due_on).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
    };
  }
  return (
    <TrainingTab
      studentId={studentId}
      training={training}
      finance={finance}
      currency={organization.currency}
      today={todayIn(organization.timezone)}
      can={{ documents: allowed.documents, update: allowed.update, enroll: allowed.enroll, finance: allowed.finance }}
    />
  );
}

async function UniversitySections({
  active,
  studentId,
  organizationId,
  timezone,
  config,
  studentActive,
  can: allowed,
}: {
  active: string;
  studentId: string;
  organizationId: string;
  timezone: string;
  config: UniversityConfig;
  studentActive: boolean;
  can: { enroll: boolean; badges: boolean; transcript: boolean };
}) {
  const record = await studentAcademicRecord(organizationId, studentId);
  if (active === "universite") return <AcademicRecordTab record={record} config={config} />;
  if (active === "resultats") {
    return (
      <ResultsTab
        record={record}
        showRank={config.features.ranking}
        transcriptHref={allowed.transcript && config.features.documents ? (periodId) => `/api/documents/universite/releve/${studentId}?semestre=${periodId}` : undefined}
      />
    );
  }
  if (active === "badge") {
    const supabase = await createClient();
    const { data: token } = await supabase.from("student_badges").select("token").eq("student_id", studentId).eq("status", "active").maybeSingle();
    return (
      <BadgeTab
        studentId={studentId}
        badges={record.badges}
        qr={token ? await qrDataUrl(`NEOSCOL-BADGE:${token.token}`, "#000000") : null}
        canManage={allowed.badges}
        active={studentActive}
        timezone={timezone}
        who="L'étudiant"
        issueAction={issueStudentBadge}
        revokeAction={revokeStudentBadge}
      />
    );
  }
  const supabase = await createClient();
  const yearIds = [...new Set(record.enrollments.map((e) => e.academic_year?.id).filter((v): v is string => Boolean(v)))];
  const programIds = [...new Set(record.enrollments.map((e) => e.program_id).filter((v): v is string => Boolean(v)))];
  const [{ data: periods }, { data: units }] = await Promise.all([
    yearIds.length ? supabase.from("academic_periods").select("id, name, academic_year_id, sequence").in("academic_year_id", yearIds) : Promise.resolve({ data: [] }),
    programIds.length
      ? supabase.from("teaching_units").select("id, code, name, credits, semester_no, program_id, level_id, is_optional").in("program_id", programIds).eq("is_active", true).order("code")
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <PedagogicalTab
      studentId={studentId}
      record={record}
      periods={periods ?? []}
      units={(units ?? []).map((u) => ({ ...u, credits: Number(u.credits) }))}
      canManage={allowed.enroll}
      semesterLabel={config.features.semesters ? "Semestre" : "Période"}
    />
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

/** Prochaine tranche non soldée (la plus proche), pour l'Aperçu. */
function nextInstallment(schedule: Awaited<ReturnType<typeof getStudentSchedule>>, today: string) {
  const rows = schedule.flatMap((inv) =>
    inv.installments.length
      ? allocateInstallments(Number(inv.paid ?? 0), inv.installments)
      : [{ id: inv.invoice_id ?? "", label: inv.label ?? inv.number ?? "Facture", dueOn: inv.due_on ?? inv.issued_on ?? today, amount: Number(inv.total ?? 0), remaining: Number(inv.balance ?? 0) }],
  );
  const next = rows.filter((r) => r.remaining > 0).sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  return next ? { label: next.label, dueOn: next.dueOn, remaining: next.remaining, overdue: next.dueOn < today } : null;
}
