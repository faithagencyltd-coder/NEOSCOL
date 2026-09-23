import "server-only";

import { parseFields } from "@/features/forms/fields";

import type { Client } from "./server";
import type {
  CertificateSnapshot,
  CommitmentSnapshot,
  DocOrganization,
  DocStudent,
  EnrollmentFormSnapshot,
  InvoiceSnapshot,
  ReceiptSnapshot,
  ReportCardConfig,
  ReportCardSnapshot,
  ReportColumn,
  ReportSubjectRow,
  StudentCardSnapshot,
  TextDocumentKind,
  TranscriptSnapshot,
} from "./types";
import { TEMPLATE_DEFAULTS } from "./templates";

const STUDENT_FIELDS =
  "id, first_name, last_name, other_names, matricule, sex, birth_date, birth_place, nationality, address, city, phone, email, photo_path";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  matricule: string;
  sex: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  photo_path: string | null;
};

function docStudent(row: StudentRow): DocStudent {
  const { photo_path, ...rest } = row;
  return { ...rest, photo_file_id: photo_path };
}

const num = (value: unknown): number | null => (typeof value === "number" ? value : value === null || value === undefined || value === "" ? null : Number(value));

/** Classe (inscription validée) de l'élève pour l'année courante. */
async function currentClass(supabase: Client, organizationId: string, studentId: string) {
  const { data } = await supabase
    .from("enrollments")
    .select("class:classes(name, program:programs(name)), program:programs(name), academic_year:academic_years!inner(name, is_current)")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("status", "validated")
    .eq("academic_year.is_current", true)
    .limit(1)
    .maybeSingle();
  return { className: data?.class?.name ?? null, year: data?.academic_year?.name ?? null, program: data?.program?.name ?? data?.class?.program?.name ?? null };
}

export function reportConfig(raw: unknown, organization: DocOrganization): ReportCardConfig {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (key: string, fallback = true) => (typeof c[key] === "boolean" ? (c[key] as boolean) : fallback);
  const signatures = Array.isArray(c.signatures)
    ? (c.signatures as unknown[]).flatMap((s) =>
        s && typeof s === "object" && typeof (s as { label?: unknown }).label === "string" ? [{ label: (s as { label: string }).label }] : [],
      )
    : [];
  return {
    title: typeof c.title === "string" && c.title.trim() ? c.title : "BULLETIN DE NOTES",
    show_teacher: bool("show_teacher"),
    show_rank: bool("show_rank"),
    show_subject_rank: bool("show_subject_rank", false),
    show_class_stats: bool("show_class_stats"),
    show_attendance: bool("show_attendance"),
    show_appreciation: bool("show_appreciation"),
    show_logo: bool("show_logo"),
    show_stamp: bool("show_stamp"),
    show_qr: bool("show_qr"),
    signatures: signatures.length ? signatures : [{ label: "Le chef d'établissement" }],
    primary_color: typeof c.primary_color === "string" ? c.primary_color : organization.primary_color,
    accent_color: typeof c.accent_color === "string" ? c.accent_color : organization.accent_color,
    footer_note: typeof c.footer_note === "string" ? c.footer_note : "",
  };
}

/** Données calculées d'un bulletin (report_cards.data ou aperçu). */
export function reportCardData(data: unknown) {
  const d = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const columns: ReportColumn[] = Array.isArray(d.columns)
    ? (d.columns as Record<string, unknown>[]).map((c) => ({ key: String(c.key), label: String(c.label), weight: Number(c.weight ?? 1) }))
    : [];
  const subjects: ReportSubjectRow[] = Array.isArray(d.subjects)
    ? (d.subjects as Record<string, unknown>[]).map((s) => ({
        subject: String(s.subject ?? ""),
        teacher: typeof s.teacher === "string" ? s.teacher : null,
        coefficient: Number(s.coefficient ?? 1),
        columns: (s.columns && typeof s.columns === "object" ? s.columns : {}) as Record<string, number>,
        average: num(s.average),
        points: num(s.points),
        rank: num(s.rank),
        class_average: num(s.class_average),
        min: num(s.min),
        max: num(s.max),
        mention: typeof s.mention === "string" ? s.mention : null,
      }))
    : [];
  const attendance = d.attendance && typeof d.attendance === "object" ? (d.attendance as Record<string, number>) : null;
  return {
    columns,
    subjects,
    class_average: num(d.class_average),
    best_average: num(d.best_average),
    worst_average: num(d.worst_average),
    coefficient_total: num(d.coefficient_total),
    points_total: num(d.points_total),
    mention: typeof d.mention === "string" ? d.mention : null,
    proposed_decision: typeof d.proposed_decision === "string" ? d.proposed_decision : null,
    attendance: attendance
      ? { absences: Number(attendance.absences ?? 0), justified: Number(attendance.justified ?? 0), lates: Number(attendance.lates ?? 0) }
      : null,
  };
}

export async function buildReportCardSnapshots(
  supabase: Client,
  organization: DocOrganization,
  filter: { id?: string; classId?: string; periodId?: string; studentId?: string; publishedOnly?: boolean },
  rankingEnabled: boolean,
): Promise<ReportCardSnapshot[]> {
  let query = supabase
    .from("report_cards")
    .select(
      `id, status, average, rank, class_size, appreciation, head_teacher_comment, decision, data,
       student:students(${STUDENT_FIELDS}),
       class:classes(name, head_teacher:staff_members(first_name, last_name), academic_year:academic_years(name)),
       period:academic_periods(name)`,
    )
    .eq("organization_id", organization.id);
  if (filter.id) query = query.eq("id", filter.id);
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.periodId) query = query.eq("academic_period_id", filter.periodId);
  if (filter.studentId) query = query.eq("student_id", filter.studentId);
  if (filter.publishedOnly) query = query.eq("status", "published");
  const [{ data: cards }, { data: settings }] = await Promise.all([
    query,
    supabase.from("report_card_settings").select("config").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const config = reportConfig(settings?.config, organization);
  return (cards ?? [])
    .filter((card) => card.student && card.class)
    .sort((a, b) => (a.student!.last_name + a.student!.first_name).localeCompare(b.student!.last_name + b.student!.first_name, "fr"))
    .map((card) => {
      const computed = reportCardData(card.data);
      const head = card.class!.head_teacher;
      return {
        kind: "report_card" as const,
        organization,
        config,
        student: docStudent(card.student as StudentRow),
        class_name: card.class!.name,
        head_teacher: head ? `${head.first_name} ${head.last_name}` : null,
        year: card.class!.academic_year?.name ?? "",
        period: card.period?.name ?? "",
        ranking_enabled: rankingEnabled,
        card: {
          id: card.id,
          status: card.status,
          average: num(card.average),
          rank: card.rank,
          class_size: card.class_size,
          appreciation: card.appreciation,
          head_teacher_comment: card.head_teacher_comment,
          decision: card.decision,
          ...computed,
        },
      };
    });
}

export async function buildReceiptSnapshot(supabase: Client, organization: DocOrganization, paymentId: string): Promise<ReceiptSnapshot | null> {
  const { data: payment } = await supabase
    .from("payments")
    .select(`id, number, amount, method, reference, payer_name, paid_at, received_by_name, balance_after, status,
             invoice:invoices(number, total), student:students(${STUDENT_FIELDS})`)
    .eq("organization_id", organization.id)
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment?.student || !payment.invoice) return null;
  const { className } = await currentClass(supabase, organization.id, payment.student.id);
  return {
    kind: "receipt",
    organization,
    student: docStudent(payment.student as StudentRow),
    class_name: className,
    payment: {
      id: payment.id,
      number: payment.number,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference,
      payer_name: payment.payer_name,
      paid_at: payment.paid_at,
      received_by_name: payment.received_by_name,
      balance_after: num(payment.balance_after),
      status: payment.status,
    },
    invoice: { number: payment.invoice.number, total: Number(payment.invoice.total) },
  };
}

export async function buildInvoiceSnapshot(supabase: Client, organization: DocOrganization, invoiceId: string): Promise<InvoiceSnapshot | null> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`id, number, status, issued_on, due_on, subtotal, discount_total, total, student:students(${STUDENT_FIELDS}),
             invoice_lines(description, quantity, unit_amount, discount_amount, amount, sort_order),
             installments(label, due_on, amount, sequence),
             payments(number, paid_at, amount, method, status)`)
    .eq("organization_id", organization.id)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice?.student) return null;
  const [{ className }, { data: guardians }] = await Promise.all([
    currentClass(supabase, organization.id, invoice.student.id),
    supabase
      .from("student_guardians")
      .select("is_financial_responsible, is_primary, guardian:guardians(first_name, last_name)")
      .eq("student_id", invoice.student.id),
  ]);
  const responsible = (guardians ?? []).sort((a, b) => Number(b.is_financial_responsible) - Number(a.is_financial_responsible) || Number(b.is_primary) - Number(a.is_primary))[0];
  const payments = (invoice.payments ?? []).filter((p) => p.status === "completed");
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    kind: "invoice",
    organization,
    student: docStudent(invoice.student as StudentRow),
    class_name: className,
    guardian: responsible?.guardian ? `${responsible.guardian.first_name} ${responsible.guardian.last_name}` : null,
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      issued_on: invoice.issued_on,
      due_on: invoice.due_on,
      subtotal: Number(invoice.subtotal),
      discount_total: Number(invoice.discount_total),
      total: Number(invoice.total),
      paid,
      balance: Number(invoice.total) - paid,
      lines: (invoice.invoice_lines ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_amount: Number(l.unit_amount), discount_amount: Number(l.discount_amount), amount: Number(l.amount) })),
      installments: (invoice.installments ?? []).sort((a, b) => a.sequence - b.sequence).map((i) => ({ label: i.label, due_on: i.due_on, amount: Number(i.amount) })),
      payments: payments.sort((a, b) => a.paid_at.localeCompare(b.paid_at)).map((p) => ({ number: p.number, paid_at: p.paid_at, amount: Number(p.amount), method: p.method })),
    },
  };
}

async function loadStudent(supabase: Client, organizationId: string, studentId: string) {
  const { data } = await supabase.from("students").select(STUDENT_FIELDS).eq("organization_id", organizationId).eq("id", studentId).maybeSingle();
  return data as StudentRow | null;
}

/**
 * Document rédigé (certificat, attestation, certificat de formation,
 * convocation, contrat, document personnalisé) à partir du modèle de
 * l'établissement — ou du texte par défaut du Document Studio.
 */
export async function buildCertificateSnapshot(
  supabase: Client,
  organization: DocOrganization,
  studentId: string,
  kind: TextDocumentKind,
  purpose: string | null,
  templateId: string | null = null,
): Promise<CertificateSnapshot | null> {
  let templateQuery = supabase.from("document_templates").select("id, layout").eq("organization_id", organization.id).eq("kind", kind).eq("is_active", true);
  templateQuery = templateId ? templateQuery.eq("id", templateId) : templateQuery.eq("is_default", true);
  const [student, { data: template }] = await Promise.all([loadStudent(supabase, organization.id, studentId), templateQuery.limit(1).maybeSingle()]);
  if (!student) return null;
  if (kind === "custom" && !template) return null;
  const { className, year, program } = await currentClass(supabase, organization.id, studentId);
  const layout = (template?.layout ?? {}) as Record<string, unknown>;
  const defaults = TEMPLATE_DEFAULTS[kind];
  const text = (key: "title" | "body" | "closing") => (typeof layout[key] === "string" && (layout[key] as string).trim() ? (layout[key] as string) : defaults[key]);
  return {
    kind,
    organization,
    student: docStudent(student),
    class_name: className,
    year,
    program,
    title: text("title"),
    body: text("body"),
    closing: typeof layout.closing === "string" ? layout.closing : defaults.closing,
    purpose,
    template_id: template?.id ?? null,
  };
}

/** Relevé de notes de l'année en cours : bulletins PUBLIÉS de l'élève, période par période. */
export async function buildTranscriptSnapshot(supabase: Client, organization: DocOrganization, studentId: string, rankingEnabled: boolean): Promise<TranscriptSnapshot | null> {
  const student = await loadStudent(supabase, organization.id, studentId);
  if (!student) return null;
  const { data: cards } = await supabase
    .from("report_cards")
    .select("average, rank, data, period:academic_periods!inner(name, sequence, academic_year:academic_years!inner(name, is_current)), class:classes(name)")
    .eq("organization_id", organization.id)
    .eq("student_id", studentId)
    .eq("status", "published")
    .eq("period.academic_year.is_current", true);
  const sorted = (cards ?? []).slice().sort((a, b) => (a.period?.sequence ?? 0) - (b.period?.sequence ?? 0));
  const subjects = new Map<string, { subject: string; coefficient: number; averages: (number | null)[] }>();
  sorted.forEach((card, index) => {
    for (const row of reportCardData(card.data).subjects) {
      const entry = subjects.get(row.subject) ?? { subject: row.subject, coefficient: row.coefficient, averages: sorted.map(() => null) };
      entry.averages[index] = row.average;
      subjects.set(row.subject, entry);
    }
  });
  const averages = sorted.map((c) => num(c.average));
  const values = averages.filter((v): v is number => v !== null);
  return {
    kind: "transcript",
    organization,
    student: docStudent(student),
    class_name: sorted.at(-1)?.class?.name ?? null,
    year: sorted[0]?.period?.academic_year?.name ?? null,
    periods: sorted.map((c) => c.period?.name ?? ""),
    subjects: [...subjects.values()],
    averages,
    ranks: sorted.map((c) => (rankingEnabled ? c.rank : null)),
    annual_average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
  };
}

async function loadEnrollment(supabase: Client, organizationId: string, enrollmentId: string) {
  const { data } = await supabase
    .from("enrollments")
    .select(
      `id, reference, type, status, form_data, submitted_at, decided_at,
       student:students(${STUDENT_FIELDS}),
       academic_year:academic_years(name), class:classes(name), level:levels(name), program:programs(name),
       form_definition:form_definitions(fields)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", enrollmentId)
    .maybeSingle();
  return data;
}

async function loadGuardians(supabase: Client, studentId: string) {
  const { data } = await supabase
    .from("student_guardians")
    .select("relationship, is_primary, is_financial_responsible, guardian:guardians(first_name, last_name, phone, email, profession)")
    .eq("student_id", studentId);
  return (data ?? [])
    .filter((g) => g.guardian)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((g) => ({
      name: `${g.guardian!.first_name} ${g.guardian!.last_name}`,
      relationship: g.relationship,
      phone: g.guardian!.phone,
      email: g.guardian!.email,
      profession: g.guardian!.profession,
      is_financial_responsible: g.is_financial_responsible,
    }));
}

function formValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "checkbox") return value === true || value === "true" ? "Oui" : "Non";
  if (type === "file") return "Fournie";
  return String(value);
}

export async function buildEnrollmentFormSnapshot(supabase: Client, organization: DocOrganization, enrollmentId: string): Promise<EnrollmentFormSnapshot | null> {
  const enrollment = await loadEnrollment(supabase, organization.id, enrollmentId);
  if (!enrollment?.student) return null;
  const guardians = await loadGuardians(supabase, enrollment.student.id);
  const values = (enrollment.form_data ?? {}) as Record<string, unknown>;
  const fields = parseFields(enrollment.form_definition?.fields).map((f) => ({
    label: f.label,
    value: formValue(values[f.key], f.type),
    section: f.section || "Informations complémentaires",
  }));
  return {
    kind: "enrollment_form",
    organization,
    student: docStudent(enrollment.student as StudentRow),
    guardians,
    enrollment: {
      reference: enrollment.reference,
      type: enrollment.type,
      status: enrollment.status,
      year: enrollment.academic_year?.name ?? "",
      class_name: enrollment.class?.name ?? null,
      level: enrollment.level?.name ?? null,
      program: enrollment.program?.name ?? null,
      submitted_at: enrollment.submitted_at,
      decided_at: enrollment.decided_at,
      fields,
    },
  };
}

export async function buildCommitmentSnapshot(supabase: Client, organization: DocOrganization, enrollmentId: string): Promise<CommitmentSnapshot | null> {
  const enrollment = await loadEnrollment(supabase, organization.id, enrollmentId);
  if (!enrollment?.student) return null;
  const [guardians, { data: invoice }] = await Promise.all([
    loadGuardians(supabase, enrollment.student.id),
    supabase
      .from("invoices")
      .select("total, invoice_lines(description, amount, sort_order), installments(label, due_on, amount, sequence)")
      .eq("organization_id", organization.id)
      .eq("enrollment_id", enrollmentId)
      .neq("status", "cancelled")
      .order("issued_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const responsible = guardians.find((g) => g.is_financial_responsible) ?? guardians[0] ?? null;
  return {
    kind: "commitment_form",
    organization,
    student: docStudent(enrollment.student as StudentRow),
    guardian: responsible ? { name: responsible.name, phone: responsible.phone, relationship: responsible.relationship } : null,
    enrollment: { reference: enrollment.reference, year: enrollment.academic_year?.name ?? "", class_name: enrollment.class?.name ?? null },
    fees: {
      total: Number(invoice?.total ?? 0),
      lines: (invoice?.invoice_lines ?? []).sort((a, b) => a.sort_order - b.sort_order).map((l) => ({ description: l.description, amount: Number(l.amount) })),
      installments: (invoice?.installments ?? []).sort((a, b) => a.sequence - b.sequence).map((i) => ({ label: i.label, due_on: i.due_on, amount: Number(i.amount) })),
    },
  };
}

export async function buildStudentCardSnapshot(supabase: Client, organization: DocOrganization, studentId: string): Promise<StudentCardSnapshot | null> {
  const student = await loadStudent(supabase, organization.id, studentId);
  if (!student) return null;
  const { className, year } = await currentClass(supabase, organization.id, studentId);
  return { kind: "student_card", organization, student: docStudent(student), class_name: className, year };
}
