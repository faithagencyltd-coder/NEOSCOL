import "server-only";

import type { Client } from "@/features/documents/server";
import { docStudent, loadStudent } from "@/features/documents/snapshots";
import type { CompetencySheetSnapshot, DocOrganization, TrainingTranscriptSnapshot } from "@/features/documents/types";

import type { LearnerAttendance } from "./queries";

/** Inscription en formation la plus récente (validée) d'un apprenant. */
async function trainingEnrollment(supabase: Client, organizationId: string, studentId: string) {
  const { data } = await supabase
    .from("enrollments")
    .select("id, class:classes!inner(id, name, kind, starts_on, ends_on, program:programs(id, name, duration_hours))")
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .eq("status", "validated")
    .eq("class.kind", "training_session")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.class ? data : null;
}

/** Relevé de notes de formation : évaluations de la session (notes, examens, TP), moyenne /20 par module. */
export async function buildTrainingTranscript(supabase: Client, organization: DocOrganization, studentId: string): Promise<TrainingTranscriptSnapshot | null> {
  const [student, enrollment] = await Promise.all([loadStudent(supabase, organization.id, studentId), trainingEnrollment(supabase, organization.id, studentId)]);
  if (!student || !enrollment?.class) return null;
  const session = enrollment.class;
  const [{ data: modules }, { data: assessments }, attendance] = await Promise.all([
    supabase.from("class_subjects").select("subject:subjects(id, name)").eq("class_id", session.id),
    supabase
      .from("assessments")
      .select("id, subject_id, title, kind, assessed_on, coefficient, max_score, subject:subjects(name), grades(score, is_absent, is_exempt, student_id)")
      .eq("class_id", session.id)
      .eq("grades.student_id", studentId)
      .order("assessed_on"),
    supabase.rpc("learner_attendance_summary", { p_student_id: studentId }),
  ]);
  const names = new Map<string, string>();
  for (const m of modules ?? []) if (m.subject) names.set(m.subject.id, m.subject.name);
  for (const a of assessments ?? []) if (a.subject) names.set(a.subject_id, a.subject.name);
  const rows = [...names.entries()].map(([id, name]) => {
    const list = (assessments ?? []).filter((a) => a.subject_id === id);
    let points = 0;
    let weights = 0;
    const items = list.map((a) => {
      const grade = a.grades?.[0];
      const score = grade && !grade.is_absent && !grade.is_exempt && grade.score !== null ? Number(grade.score) : null;
      if (score !== null) {
        points += (score / Number(a.max_score)) * 20 * Number(a.coefficient);
        weights += Number(a.coefficient);
      }
      return { title: a.title, kind: a.kind, date: a.assessed_on, score, max: Number(a.max_score) };
    });
    return { name, assessments: items, average: weights ? Math.round((points / weights) * 100) / 100 : null };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const averages = rows.map((r) => r.average).filter((v): v is number => v !== null);
  const summary = (attendance.data ?? null) as LearnerAttendance | null;
  return {
    kind: "training_transcript",
    organization,
    student: docStudent(student),
    formation: session.program?.name ?? "",
    session: session.name,
    period: { starts_on: session.starts_on, ends_on: session.ends_on },
    duration_hours: session.program?.duration_hours ?? null,
    modules: rows,
    average: averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) / 100 : null,
    attendance: summary ? { rate: summary.rate, absences: summary.absences, lates: summary.lates, minutes: summary.total_minutes } : null,
  };
}

/** Fiche de compétences : compétences visées par la formation, niveau atteint, stages. */
export async function buildCompetencySheet(supabase: Client, organization: DocOrganization, studentId: string): Promise<CompetencySheetSnapshot | null> {
  const [student, enrollment] = await Promise.all([loadStudent(supabase, organization.id, studentId), trainingEnrollment(supabase, organization.id, studentId)]);
  if (!student || !enrollment?.class?.program) return null;
  const [{ data: catalog }, { data: evaluations }, { data: internships }] = await Promise.all([
    supabase.from("training_competencies").select("id, name, sequence").eq("program_id", enrollment.class.program.id).eq("is_active", true).order("sequence").order("name"),
    supabase.from("learner_competencies").select("competency_id, level, evaluated_on, comment").eq("enrollment_id", enrollment.id),
    supabase.from("internships").select("company_name, starts_on, ends_on, status, evaluation_score").eq("student_id", studentId).neq("status", "cancelled").order("starts_on"),
  ]);
  const byId = new Map((evaluations ?? []).map((e) => [e.competency_id, e]));
  return {
    kind: "competency_sheet",
    organization,
    student: docStudent(student),
    formation: enrollment.class.program.name,
    session: enrollment.class.name,
    competencies: (catalog ?? []).map((c) => {
      const e = byId.get(c.id);
      return { name: c.name, level: e?.level ?? null, evaluated_on: e?.evaluated_on ?? null, comment: e?.comment ?? null };
    }),
    internships: (internships ?? []).map((i) => ({
      company: i.company_name,
      starts_on: i.starts_on,
      ends_on: i.ends_on,
      status: i.status,
      score: i.evaluation_score === null ? null : Number(i.evaluation_score),
    })),
  };
}

