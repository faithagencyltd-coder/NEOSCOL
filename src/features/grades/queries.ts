import "server-only";

import { getMyStaffMember } from "@/features/timetable/queries";
import { createClient } from "@/lib/supabase/server";

/** Carnets de notes (matière × classe) de l'année : tous, ou ceux de l'enseignant. */
export async function getGradeBooks(organizationId: string, yearId: string, userId: string, all: boolean) {
  const supabase = await createClient();
  let query = supabase
    .from("class_subjects")
    .select(
      "id, coefficient, teacher_id, class:classes!inner(id, name, academic_year_id), subject:subjects(name, color), teacher:staff_members(first_name, last_name), assessments(count)",
    )
    .eq("organization_id", organizationId)
    .eq("class.academic_year_id", yearId);
  if (!all) {
    const me = await getMyStaffMember(organizationId, userId);
    if (!me) return [];
    query = query.eq("teacher_id", me.id);
  }
  const { data } = await query;
  return (data ?? [])
    .map((cs) => ({
      id: cs.id,
      classId: cs.class.id,
      className: cs.class.name,
      subject: cs.subject?.name ?? "—",
      color: cs.subject?.color ?? null,
      coefficient: cs.coefficient,
      teacher: cs.teacher ? `${cs.teacher.first_name} ${cs.teacher.last_name}` : null,
      assessments: cs.assessments[0]?.count ?? 0,
    }))
    .sort((a, b) => a.className.localeCompare(b.className, "fr") || a.subject.localeCompare(b.subject, "fr"));
}

export async function getGradeBook(organizationId: string, classSubjectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_subjects")
    .select(
      `id, coefficient, teacher_id, class:classes(id, name, academic_year_id), subject:subjects(name),
       teacher:staff_members(first_name, last_name),
       assessments(id, title, kind, assessed_on, coefficient, max_score, is_published, academic_period_id,
         grades(score, is_absent, is_exempt))`,
    )
    .eq("organization_id", organizationId)
    .eq("id", classSubjectId)
    .maybeSingle();
  return data;
}

export async function getAssessmentSheet(organizationId: string, assessmentId: string) {
  const supabase = await createClient();
  const { data: assessment } = await supabase
    .from("assessments")
    .select(
      `id, title, kind, assessed_on, coefficient, max_score, is_published, class_subject_id, class_id,
       grades_status, grades_validated_at, column_key,
       class:classes(id, name), subject:subjects(name),
       period:academic_periods(id, name, is_locked),
       class_subject:class_subjects(teacher_id),
       grades(student_id, score, is_absent, is_exempt, comment)`,
    )
    .eq("organization_id", organizationId)
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) return null;
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("student:students(id, first_name, last_name, matricule)")
    .eq("class_id", assessment.class_id)
    .eq("status", "validated");
  const students = (enrollments ?? [])
    .flatMap((e) => (e.student ? [e.student] : []))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));
  return { assessment, students };
}

export function gradeStats(grades: { score: number | null; is_absent: boolean; is_exempt: boolean }[], maxScore: number) {
  const scores = grades.filter((g) => g.score !== null && !g.is_absent && !g.is_exempt).map((g) => g.score as number);
  if (scores.length === 0) return { count: 0, average: null, min: null, max: null, maxScore };
  return {
    count: scores.length,
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    maxScore,
  };
}
