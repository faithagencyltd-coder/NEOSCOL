import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export const CHILD_COOKIE = "neoscol_enfant";

export type PortalStudent = {
  id: string;
  first_name: string;
  last_name: string;
  matricule: string;
  birth_date: string | null;
  photo_path: string | null;
  status: string;
  class_id: string | null;
  class_name: string | null;
  academic_year_id: string | null;
  is_self: boolean;
};

/** Enfants (parent) ou soi-même (élève) — bornés à app.my_portal_student_ids(). */
export const getPortalStudents = cache(async (organizationId: string): Promise<PortalStudent[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_students", { p_organization_id: organizationId });
  return (data ?? []) as PortalStudent[];
});

/** Enfant sélectionné (cookie), sinon le premier ; null si aucun dossier rattaché. */
export async function getSelectedStudent(organizationId: string) {
  const students = await getPortalStudents(organizationId);
  const preferred = (await cookies()).get(CHILD_COOKIE)?.value;
  return { students, student: students.find((s) => s.id === preferred) ?? students[0] ?? null };
}

const statusSchema = z.object({
  restricted: z.boolean(),
  features: z.object({ grades: z.boolean(), report_cards: z.boolean(), documents: z.boolean(), timetable: z.boolean() }),
  overdue_amount: z.coerce.number(),
  balance: z.coerce.number(),
  next_due_on: z.string().nullable(),
  override: z.object({ mode: z.string(), reason: z.string(), expires_on: z.string().nullable() }).nullable(),
  rules_enabled: z.boolean(),
});
export type PortalStatus = z.infer<typeof statusSchema>;

export const getPortalStatus = cache(async (studentId: string): Promise<PortalStatus | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_status", { p_student_id: studentId });
  if (error) return null;
  const parsed = statusSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
});

/** Présences validées d'un élève (jamais restreintes). */
export async function getStudentAttendance(organizationId: string, studentId: string, limit = 200) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_records")
    .select(
      "id, status, minutes_late, arrived_at, comment, is_justified, justification, session:attendance_sessions!inner(session_date, starts_at, ends_at, status, class_subject:class_subjects(subject:subjects(name)))",
    )
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("session.status", "validated")
    .order("session_date", { referencedTable: "attendance_sessions", ascending: false })
    .limit(limit);
  return (data ?? [])
    .flatMap((r) =>
      r.session
        ? [
            {
              id: r.id,
              status: r.status,
              minutesLate: r.minutes_late,
              arrivedAt: r.arrived_at?.slice(0, 5) ?? null,
              comment: r.comment,
              isJustified: r.is_justified,
              justification: r.justification,
              date: r.session.session_date,
              startsAt: r.session.starts_at?.slice(0, 5) ?? null,
              endsAt: r.session.ends_at?.slice(0, 5) ?? null,
              subject: r.session.class_subject?.subject?.name ?? null,
            },
          ]
        : [],
    )
    .sort((a, b) => (a.date === b.date ? (b.startsAt ?? "").localeCompare(a.startsAt ?? "") : b.date.localeCompare(a.date)));
}

export async function getStudentJustifications(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("absence_justifications")
    .select("id, starts_on, ends_on, reason, status, submitted_at, review_comment, records_justified, file_id")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Notes publiées (RLS : vide si la fonctionnalité est restreinte). */
export async function getStudentGrades(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("grades")
    .select(
      "id, score, is_absent, is_exempt, comment, assessment:assessments!inner(id, title, kind, max_score, coefficient, assessed_on, is_published, period:academic_periods(id, name, sequence), subject:subjects(name, color))",
    )
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("assessment.is_published", true);
  return (data ?? [])
    .flatMap((g) => (g.assessment ? [{ ...g, assessment: g.assessment }] : []))
    .sort((a, b) => (b.assessment.assessed_on ?? "").localeCompare(a.assessment.assessed_on ?? ""));
}

/** Bulletins publiés (RLS : vide si restreint). */
export async function getStudentReportCards(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("report_cards")
    .select("id, average, rank, class_size, decision, appreciation, published_at, period:academic_periods(name, sequence), class:classes(name)")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return data ?? [];
}

/** Factures, échéances, paiements et rappels (jamais restreints). */
export async function getStudentFinance(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const [{ data: invoices }, { data: payments }, { data: reminders }] = await Promise.all([
    supabase
      .from("invoice_balances")
      .select("invoice_id, number, issued_on, due_on, next_due_on, total, paid, balance, is_overdue, payment_status, status, currency")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .neq("status", "draft")
      .order("issued_on", { ascending: false }),
    supabase
      .from("payments")
      .select("id, number, amount, method, paid_at, status, reference, invoice:invoices(number)")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("paid_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoice_reminders")
      .select("id, kind, amount_due, due_on, sent_at")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);
  const ids = (invoices ?? []).flatMap((i) => (i.invoice_id ? [i.invoice_id] : []));
  const { data: installments } = ids.length
    ? await supabase.from("installments").select("id, invoice_id, label, amount, due_on, sequence").in("invoice_id", ids).order("sequence")
    : { data: [] };
  return { invoices: invoices ?? [], payments: payments ?? [], reminders: reminders ?? [], installments: installments ?? [] };
}

/** Documents officiels valides (RLS : vide si restreint). */
export async function getStudentIssuedDocuments(organizationId: string, studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("issued_documents")
    .select("id, kind, number, title, issued_at")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("status", "valid")
    .order("issued_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function getPortalTimetable(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_timetable", { p_student_id: studentId });
  return (data ?? []).map((s) => ({ ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at.slice(0, 5) }));
}

export async function getPortalSubjects(studentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_class_subjects", { p_student_id: studentId });
  return data ?? [];
}

export async function getMyNotifications(organizationId: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, created_at, read_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getPortalAccount(kind: "guardian" | "student", recordId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_account", { p_kind: kind, p_record_id: recordId });
  if (error || !data) return null;
  return data as { has_account: boolean; status?: string; last_sign_in_at?: string | null; login?: string | null };
}
