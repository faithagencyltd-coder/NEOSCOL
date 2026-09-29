import "server-only";

import type { Client } from "@/features/documents/server";
import { docStudent, loadStudent } from "@/features/documents/snapshots";
import type { DeliberationMinutesSnapshot, DiplomaSnapshot, DocOrganization, UniversityTranscriptSnapshot } from "@/features/documents/types";

type SubjectLine = { name?: string; coefficient?: number | string; session1?: number | string | null; retake?: number | string | null; average?: number | string | null };
const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** Relevé de notes LMD d'un semestre : figé depuis semester_results / ue_results (moteur de calcul en base). */
export async function buildUniversityTranscript(
  supabase: Client,
  organization: DocOrganization,
  studentId: string,
  periodId: string,
  options: { ranking: boolean; passMark: number },
): Promise<UniversityTranscriptSnapshot | null> {
  const [student, { data: sr }] = await Promise.all([
    loadStudent(supabase, organization.id, studentId),
    supabase
      .from("semester_results")
      .select(
        "enrollment_id, average, credits_total, credits_earned, validated, compensated, rank, population, decision, published_at, period:academic_periods(name, academic_year:academic_years(name)), enrollment:enrollments(program:programs(name, degree_title), level:levels!enrollments_organization_id_level_id_fkey(name), track:program_tracks!enrollments_organization_id_track_id_fkey(name))",
      )
      .eq("organization_id", organization.id)
      .eq("student_id", studentId)
      .eq("academic_period_id", periodId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!student || !sr) return null;
  const { data: ues } = await supabase
    .from("ue_results")
    .select("session1_average, retake_average, average, credits, credits_earned, status, subjects, unit:teaching_units(code, name)")
    .eq("enrollment_id", sr.enrollment_id)
    .eq("academic_period_id", periodId);
  return {
    kind: "university_transcript",
    organization,
    student: docStudent(student),
    program: sr.enrollment?.program?.name ?? null,
    degree: sr.enrollment?.program?.degree_title ?? null,
    level: sr.enrollment?.level?.name ?? null,
    track: sr.enrollment?.track?.name ?? null,
    year: sr.period?.academic_year?.name ?? null,
    period: sr.period?.name ?? "",
    pass_mark: options.passMark,
    units: (ues ?? [])
      .map((u) => ({
        code: u.unit?.code ?? "",
        name: u.unit?.name ?? "",
        credits: Number(u.credits ?? 0),
        credits_earned: Number(u.credits_earned ?? 0),
        session1: n(u.session1_average),
        retake: n(u.retake_average),
        average: n(u.average),
        status: u.status,
        subjects: ((u.subjects as SubjectLine[] | null) ?? []).map((m) => ({
          name: m.name ?? "",
          coefficient: Number(m.coefficient ?? 1),
          session1: n(m.session1),
          retake: n(m.retake),
          average: n(m.average),
        })),
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    average: n(sr.average),
    credits_earned: Number(sr.credits_earned ?? 0),
    credits_total: Number(sr.credits_total ?? 0),
    validated: sr.validated,
    compensated: sr.compensated,
    rank: options.ranking ? sr.rank : null,
    population: options.ranking ? sr.population : null,
    decision: sr.decision,
    published: Boolean(sr.published_at),
  };
}

/** Procès-verbal de délibération : décisions COURANTES du jury (l'historique reste en base). */
export async function buildDeliberationMinutes(supabase: Client, organization: DocOrganization, deliberationId: string): Promise<DeliberationMinutesSnapshot | null> {
  const { data: d } = await supabase
    .from("deliberations")
    .select("id, title, session, status, held_on, president, members, closed_at, class:classes(name, program:programs(name), level:levels(name)), period:academic_periods(name)")
    .eq("organization_id", organization.id)
    .eq("id", deliberationId)
    .maybeSingle();
  if (!d) return null;
  const { data: rows } = await supabase
    .from("deliberation_decisions")
    .select("average, credits_earned, credits_total, proposed_decision, decision, validate_credits, student:students(matricule, first_name, last_name)")
    .eq("deliberation_id", deliberationId)
    .eq("is_current", true);
  return {
    kind: "deliberation_minutes",
    organization,
    student: null,
    title: d.title,
    promotion: d.class?.name ?? "",
    program: d.class?.program?.name ?? null,
    level: d.class?.level?.name ?? null,
    period: d.period?.name ?? null,
    session: d.session === "retake" ? "retake" : "normal",
    held_on: d.held_on,
    president: d.president,
    members: d.members,
    status: d.status,
    closed_at: d.closed_at,
    rows: (rows ?? [])
      .map((r) => ({
        matricule: r.student?.matricule ?? "",
        name: `${r.student?.last_name ?? ""} ${r.student?.first_name ?? ""}`.trim(),
        average: n(r.average),
        credits_earned: n(r.credits_earned),
        credits_total: n(r.credits_total),
        decision: r.decision ?? r.proposed_decision,
        jury_credits: r.validate_credits,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
}

/** Diplôme délivré (numéro attribué en base, jamais modifiable). */
export async function buildDiploma(supabase: Client, organization: DocOrganization, diplomaId: string): Promise<{ snapshot: DiplomaSnapshot; studentId: string } | null> {
  const { data: d } = await supabase
    .from("student_diplomas")
    .select("id, student_id, kind, title, number, year_label, mention, issued_on, conferred_on, status, source, program:programs(name), level:levels(name)")
    .eq("organization_id", organization.id)
    .eq("id", diplomaId)
    .eq("source", "app")
    .maybeSingle();
  if (!d) return null;
  const student = await loadStudent(supabase, organization.id, d.student_id);
  if (!student) return null;
  return {
    studentId: d.student_id,
    snapshot: {
      kind: "diploma",
      organization,
      student: docStudent(student),
      title: d.title,
      diploma_kind: d.kind,
      number: d.number,
      program: d.program?.name ?? null,
      level: d.level?.name ?? null,
      year: d.year_label,
      mention: d.mention,
      conferred_on: d.conferred_on,
      issued_on: d.issued_on,
      status: d.status ?? "issued",
    },
  };
}
